import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { extractApiMessage, preflightCode, preflightHint } from './utils.js';

interface QueryRequestBody {
  queryText: string;
  workspaceId: string;
  datasetId: string;
  mode: 'delegated' | 'service-principal';
  connectionRef?: { accessToken?: string };
}

interface BenchmarkRequestBody extends QueryRequestBody {
  iterations?: number;
  warmupRuns?: number;
}

const PORT = Number(process.env.PORT ?? '8787');
const ENABLE_SERVICE_PRINCIPAL = process.env.ENABLE_SERVICE_PRINCIPAL === 'true';
const SP_TENANT_ID = process.env.SP_TENANT_ID ?? '';
const SP_CLIENT_ID = process.env.SP_CLIENT_ID ?? '';
const SP_CLIENT_SECRET = process.env.SP_CLIENT_SECRET ?? '';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const ENABLE_XMLA_TRACE = process.env.ENABLE_XMLA_TRACE === 'true';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? '60000');
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? '120');

interface SessionTokenStoreItem {
  refreshToken: string;
  tenantId: string;
  clientId: string;
  createdAt: number;
}

const sessionTokens = new Map<string, SessionTokenStoreItem>();
const rateLimitBuckets = new Map<string, { windowStart: number; count: number }>();

const server = createServer(async (req, res) => {
  try {
    setCors(res);
    const requestId = randomUUID();
    const rate = applyRateLimit(req);
    if (!rate.ok) {
      writeJson(res, 429, { error: 'Rate limit exceeded', requestId, retryAfterMs: rate.retryAfterMs });
      audit('rate_limited', { requestId, path: req.url ?? '', retryAfterMs: rate.retryAfterMs });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!req.url) {
      writeJson(res, 404, { error: 'Not found' });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/health') {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method !== 'POST') {
      writeJson(res, 404, { error: 'Not found' });
      return;
    }

    if (url.pathname === '/api/query/auth/exchange') {
      await handleAuthExchange(req, res);
      return;
    }
    if (url.pathname === '/api/query/auth/refresh') {
      await handleAuthRefresh(req, res);
      return;
    }
    if (url.pathname === '/api/query/workspaces') {
      await handleWorkspaces(req, res);
      return;
    }
    if (url.pathname === '/api/query/datasets') {
      await handleDatasets(req, res);
      return;
    }
    if (url.pathname === '/api/query/preflight') {
      await handlePreflight(req, res);
      return;
    }
    if (url.pathname === '/api/query/execute') {
      await handleExecute(req, res);
      return;
    }
    if (url.pathname === '/api/query/benchmark') {
      await handleBenchmark(req, res);
      return;
    }
    if (url.pathname === '/api/query/trace/start') {
      await handleTraceStart(req, res);
      return;
    }
    if (url.pathname === '/api/query/trace/run') {
      await handleTraceRun(req, res);
      return;
    }
    if (url.pathname === '/api/query/trace/stop') {
      await handleTraceStop(req, res);
      return;
    }

    writeJson(res, 404, { error: 'Not found' });
  } catch (err) {
    writeJson(res, 500, { error: 'Server error', details: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`[query-service] listening on :${PORT}`);
});

async function handleAuthExchange(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req) as {
    tenantId: string;
    clientId: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  };

  if (!body.tenantId || !body.clientId || !body.redirectUri || !body.code || !body.codeVerifier) {
    writeJson(res, 400, { error: 'Missing auth exchange fields' });
    return;
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(body.tenantId)}/oauth2/v2.0/token`;
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: body.clientId,
    code: body.code,
    redirect_uri: body.redirectUri,
    code_verifier: body.codeVerifier,
    scope: 'https://analysis.windows.net/powerbi/api/.default offline_access',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    writeJson(res, response.status, payload);
    return;
  }

  const sessionId = randomUUID();
  if (typeof payload.refresh_token === 'string' && payload.refresh_token) {
    sessionTokens.set(sessionId, {
      refreshToken: payload.refresh_token,
      tenantId: body.tenantId,
      clientId: body.clientId,
      createdAt: Date.now(),
    });
  }
  cleanupExpiredSessions();
  writeJson(res, 200, {
    accessToken: payload.access_token ?? '',
    expiresIn: Number(payload.expires_in ?? 3600),
    sessionId,
  });
  audit('auth_exchange_ok', { sessionId });
}

async function handleAuthRefresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req) as { sessionId?: string };
  if (!body.sessionId) {
    writeJson(res, 400, { error: 'sessionId is required' });
    return;
  }

  const session = sessionTokens.get(body.sessionId);
  if (!session) {
    writeJson(res, 401, { error: 'Unknown or expired sessionId' });
    return;
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(session.tenantId)}/oauth2/v2.0/token`;
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: session.clientId,
    refresh_token: session.refreshToken,
    scope: 'https://analysis.windows.net/powerbi/api/.default offline_access',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const payload = await safeJson(response);
  if (!response.ok || !payload.access_token) {
    sessionTokens.delete(body.sessionId);
    writeJson(res, response.status || 401, payload);
    return;
  }

  if (typeof payload.refresh_token === 'string' && payload.refresh_token) {
    sessionTokens.set(body.sessionId, {
      ...session,
      refreshToken: payload.refresh_token,
      createdAt: Date.now(),
    });
  }
  cleanupExpiredSessions();
  writeJson(res, 200, {
    accessToken: payload.access_token,
    expiresIn: Number(payload.expires_in ?? 3600),
    sessionId: body.sessionId,
  });
  audit('auth_refresh_ok', { sessionId: body.sessionId });
}

async function handleWorkspaces(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const token = await resolveAccessToken(body);
  if (!token.ok) {
    writeJson(res, token.status, { error: token.message });
    return;
  }

  const response = await fetch('https://api.powerbi.com/v1.0/myorg/groups', {
    headers: { Authorization: `Bearer ${token.value}` },
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    writeJson(res, response.status, payload);
    return;
  }
  const workspaces = Array.isArray(payload.value)
    ? payload.value.map((w: { id: string; name: string }) => ({ id: w.id, name: w.name }))
    : [];
  writeJson(res, 200, { workspaces });
}

async function handleDatasets(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req) as { workspaceId?: string };
  const token = await resolveAccessToken(body);
  if (!token.ok) {
    writeJson(res, token.status, { error: token.message });
    return;
  }
  if (!body.workspaceId) {
    writeJson(res, 400, { error: 'workspaceId is required' });
    return;
  }

  const response = await fetch(`https://api.powerbi.com/v1.0/myorg/groups/${encodeURIComponent(body.workspaceId)}/datasets`, {
    headers: { Authorization: `Bearer ${token.value}` },
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    writeJson(res, response.status, payload);
    return;
  }
  const datasets = Array.isArray(payload.value)
    ? payload.value.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))
    : [];
  writeJson(res, 200, { datasets });
}

async function handlePreflight(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req) as QueryRequestBody;
  const token = await resolveAccessToken(body);
  if (!token.ok) {
    writeJson(res, token.status, { ok: false, checks: [{ code: 'AUTH', pass: false, message: token.message }] });
    return;
  }

  const testRequest: QueryRequestBody = {
    ...body,
    queryText: 'EVALUATE ROW("Ping", 1)',
    connectionRef: { accessToken: token.value },
  };
  const exec = await executePowerBI(testRequest, token.value);
  if (!exec.ok) {
    const hint = preflightHint(exec.status, exec.message);
    writeJson(res, exec.status, {
      ok: false,
      checks: [{
        code: preflightCode(exec.status, exec.message),
        pass: false,
        message: exec.message,
        hint,
      }],
    });
    return;
  }

  writeJson(res, 200, {
    ok: true,
    checks: [
      { code: 'AUTH', pass: true, message: 'Access token valid' },
      { code: 'EXECUTE', pass: true, message: 'Dataset executeQueries call succeeded' },
    ],
  });
}

async function handleExecute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req) as QueryRequestBody;
  const requestId = randomUUID();
  const token = await resolveAccessToken(body);
  if (!token.ok) {
    writeJson(res, token.status, { error: token.message, requestId });
    audit('execute_failed_auth', { requestId, status: token.status });
    return;
  }
  const exec = await executePowerBI(body, token.value);
  if (!exec.ok) {
    writeJson(res, exec.status, { error: exec.message, requestId });
    audit('execute_failed_upstream', { requestId, status: exec.status, message: exec.message });
    return;
  }

  writeJson(res, 200, {
    ...exec.value,
    requestId,
  });
  audit('execute_ok', { requestId, elapsedMs: exec.value.elapsedMs, rows: exec.value.rows.length });
}

async function handleBenchmark(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req) as BenchmarkRequestBody;
  const requestId = randomUUID();
  const token = await resolveAccessToken(body);
  if (!token.ok) {
    writeJson(res, token.status, { error: token.message, requestId });
    audit('benchmark_failed_auth', { requestId, status: token.status });
    return;
  }

  const iterations = Math.max(1, Math.min(20, Number(body.iterations ?? 5)));
  const warmupRuns = Math.max(0, Math.min(5, Number(body.warmupRuns ?? 1)));

  for (let i = 0; i < warmupRuns; i++) {
    const warm = await executePowerBI(body, token.value);
    if (!warm.ok) {
      writeJson(res, warm.status, { error: warm.message, requestId });
      audit('benchmark_failed_warmup', { requestId, status: warm.status, message: warm.message });
      return;
    }
  }

  const runs: Array<{ run: number; elapsedMs: number; requestId: string }> = [];
  for (let i = 0; i < iterations; i++) {
    const r = await executePowerBI(body, token.value);
    if (!r.ok) {
      writeJson(res, r.status, { error: r.message, requestId });
      audit('benchmark_failed_run', { requestId, status: r.status, message: r.message, run: i + 1 });
      return;
    }
    runs.push({ run: i + 1, elapsedMs: r.value.elapsedMs, requestId: randomUUID() });
  }

  writeJson(res, 200, { requestId, runs });
  audit('benchmark_ok', { requestId, iterations, warmupRuns });
}

async function handleTraceStart(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!ENABLE_XMLA_TRACE) {
    writeJson(res, 501, {
      error: 'XMLA trace is disabled',
      hint: 'Set ENABLE_XMLA_TRACE=true and implement XMLA session provider.',
    });
    return;
  }
  writeJson(res, 501, { error: 'XMLA trace start not implemented yet' });
}

async function handleTraceRun(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!ENABLE_XMLA_TRACE) {
    writeJson(res, 501, {
      error: 'XMLA trace is disabled',
      hint: 'Set ENABLE_XMLA_TRACE=true and implement XMLA session provider.',
    });
    return;
  }
  writeJson(res, 501, { error: 'XMLA trace run not implemented yet' });
}

async function handleTraceStop(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!ENABLE_XMLA_TRACE) {
    writeJson(res, 501, {
      error: 'XMLA trace is disabled',
      hint: 'Set ENABLE_XMLA_TRACE=true and implement XMLA session provider.',
    });
    return;
  }
  writeJson(res, 501, { error: 'XMLA trace stop not implemented yet' });
}

async function executePowerBI(body: QueryRequestBody, token: string): Promise<{ ok: true; value: { columns: Array<{ name: string; type?: string }>; rows: Array<Record<string, unknown>>; elapsedMs: number; truncated: boolean; warnings: Array<{ code: string; message: string }> } } | { ok: false; status: number; message: string }> {
  if (!body.workspaceId || !body.datasetId || !body.queryText) {
    return { ok: false, status: 400, message: 'workspaceId, datasetId, and queryText are required' };
  }

  const startedAt = Date.now();
  const url = `https://api.powerbi.com/v1.0/myorg/groups/${encodeURIComponent(body.workspaceId)}/datasets/${encodeURIComponent(body.datasetId)}/executeQueries`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      queries: [{ query: body.queryText }],
      serializerSettings: { includeNulls: true },
    }),
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    const rawMessage = extractApiMessage(payload);
    return { ok: false, status: response.status, message: rawMessage };
  }

  const elapsedMs = Date.now() - startedAt;
  const table = payload?.results?.[0]?.tables?.[0];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const columns = inferColumns(rows);
  const warnings: Array<{ code: string; message: string }> = [];
  const truncated = rows.length >= 100000;
  if (truncated) {
    warnings.push({ code: 'TRUNCATED', message: 'Result may be truncated due to API row limits.' });
  }

  return {
    ok: true,
    value: {
      columns,
      rows,
      elapsedMs,
      truncated,
      warnings,
    },
  };
}

async function resolveAccessToken(body: unknown): Promise<{ ok: true; value: string } | { ok: false; status: number; message: string }> {
  const mode = (body as { mode?: string })?.mode ?? 'delegated';
  if (mode === 'delegated') {
    const token = (body as { connectionRef?: { accessToken?: string } })?.connectionRef?.accessToken;
    if (!token) return { ok: false, status: 401, message: 'Missing delegated access token' };
    return { ok: true, value: token };
  }

  // Service principal scaffold (disabled by default)
  if (!ENABLE_SERVICE_PRINCIPAL) {
    return { ok: false, status: 400, message: 'Service principal mode is disabled' };
  }
  if (!SP_TENANT_ID || !SP_CLIENT_ID || !SP_CLIENT_SECRET) {
    return { ok: false, status: 400, message: 'Service principal env vars are missing' };
  }
  try {
    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(SP_TENANT_ID)}/oauth2/v2.0/token`;
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: SP_CLIENT_ID,
      client_secret: SP_CLIENT_SECRET,
      scope: 'https://analysis.windows.net/powerbi/api/.default',
    });
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const payload = await safeJson(response);
    if (!response.ok || !payload.access_token) {
      return {
        ok: false,
        status: response.status || 401,
        message: extractApiMessage(payload) || 'Service principal token acquisition failed',
      };
    }
    return { ok: true, value: payload.access_token as string };
  } catch (err) {
    return { ok: false, status: 500, message: `Service principal token error: ${String(err)}` };
  }
}

function inferColumns(rows: Array<Record<string, unknown>>): Array<{ name: string; type?: string }> {
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first).map((name) => ({ name }));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  return JSON.parse(text);
}

async function safeJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    try {
      return { text: await response.text() };
    } catch {
      return {};
    }
  }
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessionTokens.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessionTokens.delete(id);
    }
  }
}

function applyRateLimit(req: IncomingMessage): { ok: true } | { ok: false; retryAfterMs: number } {
  const key = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    rateLimitBuckets.set(key, { windowStart: now, count: 1 });
    return { ok: true };
  }
  if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    bucket.windowStart = now;
    bucket.count = 1;
    rateLimitBuckets.set(key, bucket);
    return { ok: true };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart) };
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return { ok: true };
}

function audit(event: string, payload: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...payload,
  };
  console.info(JSON.stringify(entry));
}
