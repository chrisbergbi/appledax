import { t } from '../i18n/index';
import { QueryStateStore } from '../query/state';
import { executeQuery, benchmarkQuery, isQueryErrorDetails } from '../query/executors/rest-executor';
import { loadQueryHistory, saveQueryHistoryItem } from '../query/history';
import { exportResultAsCsv } from '../query/export';
import type {
  BenchmarkResult,
  QueryConnection,
  QueryErrorDetails,
  QueryRequest,
  QueryRunResult,
  QueryTab,
} from '../query/types';

interface WorkspaceItem {
  id: string;
  name: string;
}

interface DatasetItem {
  id: string;
  name: string;
}

const AUTH_STORAGE_KEY = 'appledax-query-auth';

interface AuthState {
  tenantId: string;
  clientId: string;
  redirectUri: string;
  accessToken: string;
  sessionId: string;
  expiresAt: number;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class QueryWorkspacePanel {
  private container: HTMLElement;
  private state = new QueryStateStore();
  private runAbortController: AbortController | null = null;
  private latestResult: QueryRunResult | null = null;
  private latestBenchmark: BenchmarkResult | null = null;
  private latestError: QueryErrorDetails | null = null;
  private latestErrorRaw = '';
  private workspaces: WorkspaceItem[] = [];
  private datasets: DatasetItem[] = [];
  private auth: AuthState;
  private mode: 'delegated' | 'service-principal' = 'delegated';
  private selectedWorkspaceId = '';
  private selectedDatasetId = '';

  constructor() {
    this.container = document.getElementById('query-workspace-panel')!;
    this.auth = this.loadAuthState();
    void this.handleAuthCallback();
    this.render();
    void this.refreshWorkspaces();
  }

  public render(): void {
    const active = this.state.getActiveTab();
    const status = this.state.getRunStatus();
    const history = loadQueryHistory().slice(0, 5);

    const workspaceOptions = this.workspaces
      .map((w) => `<option value="${esc(w.id)}"${w.id === this.selectedWorkspaceId ? ' selected' : ''}>${esc(w.name)}</option>`)
      .join('');
    const datasetOptions = this.datasets
      .map((d) => `<option value="${esc(d.id)}"${d.id === this.selectedDatasetId ? ' selected' : ''}>${esc(d.name)}</option>`)
      .join('');

    const tabsHtml = this.state.getTabs().map((tab) => this.renderTab(tab)).join('');
    const resultHtml = this.latestResult ? this.renderResultTable(this.latestResult) : '';
    const benchmarkHtml = this.latestBenchmark ? this.renderBenchmark(this.latestBenchmark) : '';
    const warningHtml = this.latestResult && this.latestResult.warnings.length > 0
      ? `<div class="qw-warning">${this.latestResult.warnings.map((w) => esc(w.message)).join('<br>')}</div>`
      : '';
    const errorHtml = this.latestError
      ? `<div class="qw-error"><strong>${esc(this.latestError.code)}</strong>: ${esc(this.latestError.message)}${this.latestError.suggestion ? `<br>${esc(this.latestError.suggestion)}` : ''}${this.latestErrorRaw ? `<details><summary>${esc(t('qw.error_details'))}</summary><pre>${esc(this.latestErrorRaw)}</pre></details>` : ''}</div>`
      : '';
    const historyHtml = history.map((item) =>
      `<button class="qw-history-item" data-history-id="${esc(item.id)}">${new Date(item.createdAt).toLocaleString()} · ${esc(item.datasetId)} · ${item.elapsedMs}ms</button>`
    ).join('');

    this.container.innerHTML = `
      <div class="qw-root">
        <div class="qw-tabs">
          ${tabsHtml}
          <button id="qw-tab-add" class="qw-tab-add">+</button>
        </div>

        <div class="qw-auth">
          <select id="qw-mode" class="qw-input">
            <option value="delegated"${this.mode === 'delegated' ? ' selected' : ''}>${esc(t('qw.mode_delegated'))}</option>
            <option value="service-principal"${this.mode === 'service-principal' ? ' selected' : ''}>${esc(t('qw.mode_service_principal'))}</option>
          </select>
          <input id="qw-tenant-id" class="qw-input" placeholder="${esc(t('qw.tenant_id'))}" value="${esc(this.auth.tenantId)}">
          <input id="qw-client-id" class="qw-input" placeholder="${esc(t('qw.client_id'))}" value="${esc(this.auth.clientId)}">
          <input id="qw-redirect-uri" class="qw-input" placeholder="${esc(t('qw.redirect_uri'))}" value="${esc(this.auth.redirectUri)}">
          <button id="qw-signin" class="qw-btn"${this.mode === 'service-principal' ? ' disabled' : ''}>${esc(t('qw.sign_in'))}</button>
        </div>

        <div class="qw-connection">
          <select id="qw-workspace" class="qw-input">
            <option value="">${esc(t('qw.select_workspace'))}</option>
            ${workspaceOptions}
          </select>
          <select id="qw-dataset" class="qw-input">
            <option value="">${esc(t('qw.select_dataset'))}</option>
            ${datasetOptions}
          </select>
          <button id="qw-refresh-connections" class="qw-btn-secondary">${esc(t('qw.refresh'))}</button>
        </div>

        <textarea id="qw-editor" class="qw-editor">${esc(active.queryText)}</textarea>

        <div class="qw-actions">
          <button id="qw-run" class="qw-btn" ${status === 'running' ? 'disabled' : ''}>${esc(t('qw.run'))}</button>
          <button id="qw-cancel" class="qw-btn-secondary" ${status === 'running' ? '' : 'disabled'}>${esc(t('qw.cancel'))}</button>
          <button id="qw-benchmark" class="qw-btn-secondary" ${status === 'running' ? 'disabled' : ''}>${esc(t('qw.benchmark'))}</button>
          <button id="qw-export" class="qw-btn-secondary" ${this.latestResult ? '' : 'disabled'}>${esc(t('qw.export_csv'))}</button>
          <span class="qw-status">${esc(t(`qw.status_${status}`))}</span>
        </div>

        <div class="qw-diagnostics">
          ${warningHtml}
          ${errorHtml}
          ${this.latestResult ? `<div class="qw-meta">${esc(t('qw.elapsed'))}: ${this.latestResult.elapsedMs}ms · ${esc(t('qw.rows'))}: ${this.latestResult.rows.length} · ${esc(t('qw.truncated'))}: ${this.latestResult.truncated ? esc(t('qw.yes')) : esc(t('qw.no'))} · ${esc(t('qw.request_id'))}: ${esc(this.latestResult.requestId)}</div>` : ''}
          ${resultHtml}
          ${benchmarkHtml}
        </div>

        <div class="qw-history">
          <div class="qw-history-title">${esc(t('qw.recent_runs'))}</div>
          ${historyHtml || `<div class="qw-history-empty">${esc(t('qw.no_history'))}</div>`}
        </div>
      </div>
    `;

    this.attachHandlers();
  }

  private renderTab(tab: QueryTab): string {
    const active = tab.id === this.state.getActiveTabId();
    const canClose = this.state.getTabs().length > 1;
    return `<div class="qw-tab ${active ? 'active' : ''}" data-tab-id="${esc(tab.id)}">
      <button class="qw-tab-select" data-tab-id="${esc(tab.id)}">${esc(tab.name)}</button>
      <button class="qw-tab-close" data-tab-close="${esc(tab.id)}"${canClose ? '' : ' disabled'}>&times;</button>
    </div>`;
  }

  private renderResultTable(result: QueryRunResult): string {
    if (result.rows.length === 0) {
      return `<div class="qw-empty">${esc(t('qw.no_rows'))}</div>`;
    }
    const headers = result.columns.map((c) => `<th>${esc(c.name)}</th>`).join('');
    const rows = result.rows.map((row) => {
      const cells = result.columns.map((c) => `<td>${esc(String(row[c.name] ?? ''))}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table class="qw-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  private renderBenchmark(result: BenchmarkResult): string {
    const runs = result.runs.map((run) => `<li>#${run.run}: ${run.elapsedMs}ms</li>`).join('');
    return `<div class="qw-benchmark">
      <div>${esc(t('qw.benchmark_median'))}: ${result.medianMs.toFixed(1)}ms</div>
      <div>${esc(t('qw.benchmark_p95'))}: ${result.p95Ms.toFixed(1)}ms</div>
      <div>${esc(t('qw.benchmark_stddev'))}: ${result.stdDevMs.toFixed(1)}ms</div>
      <ul>${runs}</ul>
    </div>`;
  }

  private attachHandlers(): void {
    this.container.querySelector('#qw-tab-add')?.addEventListener('click', () => {
      this.state.createTab(`Query ${this.state.getTabs().length + 1}`);
      this.render();
    });

    this.container.querySelectorAll<HTMLElement>('[data-tab-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.tabId;
        if (!id) return;
        this.state.setActiveTab(id);
        this.render();
      });
      el.addEventListener('dblclick', () => {
        const id = el.dataset.tabId;
        if (!id) return;
        const current = this.state.getTabs().find((t) => t.id === id);
        const next = window.prompt(t('qw.rename_tab_prompt'), current?.name ?? 'Query');
        if (next !== null) {
          this.state.renameTab(id, next);
          this.render();
        }
      });
    });

    this.container.querySelectorAll<HTMLElement>('[data-tab-close]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.tabClose;
        if (!id) return;
        if (this.state.getTabs().length <= 1) return;
        this.state.closeTab(id);
        this.render();
      });
    });

    const modeSelect = this.container.querySelector('#qw-mode') as HTMLSelectElement | null;
    modeSelect?.addEventListener('change', async () => {
      this.mode = modeSelect.value === 'service-principal' ? 'service-principal' : 'delegated';
      this.selectedWorkspaceId = '';
      this.selectedDatasetId = '';
      this.workspaces = [];
      this.datasets = [];
      await this.refreshWorkspaces();
      this.render();
    });

    const editor = this.container.querySelector('#qw-editor') as HTMLTextAreaElement | null;
    editor?.addEventListener('input', () => {
      this.state.setQueryText(this.state.getActiveTabId(), editor.value);
    });

    const workspaceSelect = this.container.querySelector('#qw-workspace') as HTMLSelectElement | null;
    const datasetSelect = this.container.querySelector('#qw-dataset') as HTMLSelectElement | null;
    workspaceSelect?.addEventListener('change', async () => {
      this.selectedWorkspaceId = workspaceSelect.value;
      this.selectedDatasetId = '';
      await this.refreshDatasets(this.selectedWorkspaceId);
      this.render();
    });
    datasetSelect?.addEventListener('change', () => {
      this.selectedDatasetId = datasetSelect.value;
    });

    this.container.querySelector('#qw-refresh-connections')?.addEventListener('click', async () => {
      await this.refreshWorkspaces();
      this.render();
    });

    this.container.querySelector('#qw-signin')?.addEventListener('click', async () => {
      await this.beginDelegatedSignIn();
    });

    this.container.querySelector('#qw-run')?.addEventListener('click', async () => {
      await this.runCurrentQuery();
    });

    this.container.querySelector('#qw-cancel')?.addEventListener('click', () => {
      this.runAbortController?.abort();
      this.state.setRunStatus('cancelled');
      this.render();
    });

    this.container.querySelector('#qw-benchmark')?.addEventListener('click', async () => {
      await this.runBenchmark();
    });

    this.container.querySelector('#qw-export')?.addEventListener('click', () => {
      if (!this.latestResult) return;
      exportResultAsCsv(`query-result-${Date.now()}`, this.latestResult);
    });

    this.container.querySelectorAll<HTMLElement>('[data-history-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const history = loadQueryHistory();
        const selected = history.find((h) => h.id === el.dataset.historyId);
        if (!selected) return;
        this.state.setQueryText(this.state.getActiveTabId(), selected.queryText);
        this.render();
      });
    });
  }

  private getConnection(): QueryConnection {
    const workspaceId = this.selectedWorkspaceId || (this.container.querySelector('#qw-workspace') as HTMLSelectElement | null)?.value || '';
    const datasetId = this.selectedDatasetId || (this.container.querySelector('#qw-dataset') as HTMLSelectElement | null)?.value || '';
    return {
      mode: this.mode,
      workspaceId,
      datasetId,
      connectionRef: this.mode === 'delegated' ? { accessToken: this.auth.accessToken } : undefined,
    };
  }

  private async runCurrentQuery(): Promise<void> {
    if (this.mode === 'delegated') {
      const refreshed = await this.ensureAccessToken();
      if (!refreshed) return;
    }
    const connection = this.getConnection();
    if (!connection.workspaceId || !connection.datasetId) {
      this.latestError = { status: 400, code: 'MISSING_CONNECTION', message: t('qw.error_missing_connection') };
      this.latestErrorRaw = '';
      this.render();
      return;
    }

    const active = this.state.getActiveTab();
    const preflightOk = await this.runPreflight(connection, active.queryText);
    if (!preflightOk) {
      return;
    }
    const request: QueryRequest = {
      queryText: active.queryText,
      workspaceId: connection.workspaceId,
      datasetId: connection.datasetId,
      mode: connection.mode,
      connectionRef: connection.connectionRef,
    };

    this.latestError = null;
    this.latestErrorRaw = '';
    this.latestBenchmark = null;
    this.state.setRunStatus('running');
    this.runAbortController = new AbortController();
    this.render();

    try {
      const result = await executeQuery(request, connection, this.runAbortController.signal);
      this.latestResult = result;
      saveQueryHistoryItem(active.queryText, connection, result);
      this.state.setRunStatus('success');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.state.setRunStatus('cancelled');
      } else if (isQueryErrorDetails(err)) {
        this.latestError = err;
        this.latestErrorRaw = '';
        this.state.setRunStatus('error');
      } else {
        this.latestError = { status: 500, code: 'UNKNOWN', message: t('qw.error_unknown') };
        this.latestErrorRaw = String(err);
        this.state.setRunStatus('error');
      }
    } finally {
      this.runAbortController = null;
      this.render();
    }
  }

  private async runPreflight(connection: QueryConnection, queryText: string): Promise<boolean> {
    try {
      const response = await fetch('/api/query/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: connection.workspaceId,
          datasetId: connection.datasetId,
          queryText,
          mode: connection.mode,
          connectionRef: connection.connectionRef,
        }),
      });
      if (response.ok) return true;
      const payload = await response.json().catch(() => null) as { checks?: Array<{ code: string; message: string; hint?: string }>; error?: string } | null;
      const check = payload?.checks?.[0];
      this.latestError = {
        status: response.status,
        code: check?.code ?? 'PREFLIGHT',
        message: check?.message ?? payload?.error ?? t('qw.error_preflight'),
        suggestion: check?.hint,
      };
      this.latestErrorRaw = payload ? JSON.stringify(payload, null, 2) : '';
      this.state.setRunStatus('error');
      this.render();
      return false;
    } catch {
      this.latestError = { status: 500, code: 'PREFLIGHT', message: t('qw.error_preflight') };
      this.latestErrorRaw = '';
      this.state.setRunStatus('error');
      this.render();
      return false;
    }
  }

  private async runBenchmark(): Promise<void> {
    if (this.mode === 'delegated') {
      const refreshed = await this.ensureAccessToken();
      if (!refreshed) return;
    }
    const connection = this.getConnection();
    if (!connection.workspaceId || !connection.datasetId) {
      this.latestError = { status: 400, code: 'MISSING_CONNECTION', message: t('qw.error_missing_connection') };
      this.latestErrorRaw = '';
      this.render();
      return;
    }
    const active = this.state.getActiveTab();
    const request: QueryRequest = {
      queryText: active.queryText,
      workspaceId: connection.workspaceId,
      datasetId: connection.datasetId,
      mode: connection.mode,
      connectionRef: connection.connectionRef,
    };

    this.latestError = null;
    this.latestErrorRaw = '';
    this.latestResult = null;
    this.state.setRunStatus('running');
    this.runAbortController = new AbortController();
    this.render();

    try {
      this.latestBenchmark = await benchmarkQuery(request, connection, 5, 1, this.runAbortController.signal);
      this.state.setRunStatus('success');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.state.setRunStatus('cancelled');
      } else if (isQueryErrorDetails(err)) {
        this.latestError = err;
        this.latestErrorRaw = '';
        this.state.setRunStatus('error');
      } else {
        this.latestError = { status: 500, code: 'UNKNOWN', message: t('qw.error_unknown') };
        this.latestErrorRaw = String(err);
        this.state.setRunStatus('error');
      }
    } finally {
      this.runAbortController = null;
      this.render();
    }
  }

  private async refreshWorkspaces(): Promise<void> {
    if (this.mode === 'delegated') {
      const refreshed = await this.ensureAccessToken();
      if (!refreshed || !this.auth.accessToken) return;
    }
    const response = await fetch('/api/query/workspaces', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({
        mode: this.mode,
        connectionRef: this.mode === 'delegated' ? { accessToken: this.auth.accessToken } : undefined,
      }),
    });
    if (!response.ok) return;
    const payload = await response.json() as { workspaces: WorkspaceItem[] };
    this.workspaces = payload.workspaces;
    if (!this.workspaces.some((w) => w.id === this.selectedWorkspaceId)) {
      this.selectedWorkspaceId = '';
      this.selectedDatasetId = '';
      this.datasets = [];
    }
  }

  private async refreshDatasets(workspaceId: string): Promise<void> {
    if (!workspaceId) {
      this.datasets = [];
      return;
    }
    if (this.mode === 'delegated') {
      const refreshed = await this.ensureAccessToken();
      if (!refreshed || !this.auth.accessToken) {
        this.datasets = [];
        return;
      }
    }
    const response = await fetch('/api/query/datasets', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({
        workspaceId,
        mode: this.mode,
        connectionRef: this.mode === 'delegated' ? { accessToken: this.auth.accessToken } : undefined,
      }),
    });
    if (!response.ok) {
      this.datasets = [];
      return;
    }
    const payload = await response.json() as { datasets: DatasetItem[] };
    this.datasets = payload.datasets;
    if (!this.datasets.some((d) => d.id === this.selectedDatasetId)) {
      this.selectedDatasetId = '';
    }
  }

  private loadAuthState(): AuthState {
    const defaultRedirect = `${window.location.origin}${window.location.pathname}`;
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        return { tenantId: '', clientId: '', redirectUri: defaultRedirect, accessToken: '', sessionId: '', expiresAt: 0 };
      }
      const parsed = JSON.parse(raw) as Partial<AuthState>;
      return {
        tenantId: parsed.tenantId ?? '',
        clientId: parsed.clientId ?? '',
        redirectUri: parsed.redirectUri ?? defaultRedirect,
        accessToken: parsed.accessToken ?? '',
        sessionId: parsed.sessionId ?? '',
        expiresAt: parsed.expiresAt ?? 0,
      };
    } catch {
      return { tenantId: '', clientId: '', redirectUri: defaultRedirect, accessToken: '', sessionId: '', expiresAt: 0 };
    }
  }

  private saveAuthState(): void {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.auth));
    } catch {
      // ignore
    }
  }

  private async beginDelegatedSignIn(): Promise<void> {
    const tenantId = (this.container.querySelector('#qw-tenant-id') as HTMLInputElement | null)?.value.trim() ?? '';
    const clientId = (this.container.querySelector('#qw-client-id') as HTMLInputElement | null)?.value.trim() ?? '';
    const redirectUri = (this.container.querySelector('#qw-redirect-uri') as HTMLInputElement | null)?.value.trim() ?? '';

    if (!tenantId || !clientId || !redirectUri) {
      this.latestError = { status: 400, code: 'AUTH_CONFIG', message: t('qw.error_auth_config') };
      this.latestErrorRaw = '';
      this.render();
      return;
    }

    this.auth.tenantId = tenantId;
    this.auth.clientId = clientId;
    this.auth.redirectUri = redirectUri;
    this.saveAuthState();

    const codeVerifier = randomString(64);
    const state = randomString(32);
    const challenge = await sha256Base64Url(codeVerifier);
    localStorage.setItem('appledax-query-code-verifier', codeVerifier);
    localStorage.setItem('appledax-query-auth-state', state);

    const scope = encodeURIComponent('https://analysis.windows.net/powerbi/api/Dataset.Read.All https://analysis.windows.net/powerbi/api/Workspace.Read.All offline_access');
    const authorize = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_mode=query` +
      `&scope=${scope}` +
      `&state=${encodeURIComponent(state)}` +
      `&code_challenge=${encodeURIComponent(challenge)}` +
      `&code_challenge_method=S256`;
    window.location.href = authorize;
  }

  private async handleAuthCallback(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return;

    const expectedState = localStorage.getItem('appledax-query-auth-state');
    const codeVerifier = localStorage.getItem('appledax-query-code-verifier');
    if (!expectedState || state !== expectedState || !codeVerifier || !this.auth.clientId || !this.auth.redirectUri || !this.auth.tenantId) {
      this.latestError = { status: 400, code: 'AUTH_STATE', message: t('qw.error_auth_state') };
      this.latestErrorRaw = '';
      return;
    }

    const response = await fetch('/api/query/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: this.auth.tenantId,
        clientId: this.auth.clientId,
        redirectUri: this.auth.redirectUri,
        code,
        codeVerifier,
      }),
    });
    if (response.ok) {
      const payload = await response.json() as { accessToken: string; expiresIn: number; sessionId: string };
      this.auth.accessToken = payload.accessToken;
      this.auth.sessionId = payload.sessionId;
      this.auth.expiresAt = Date.now() + Math.max(60, Number(payload.expiresIn || 3600) - 60) * 1000;
      this.saveAuthState();
      params.delete('code');
      params.delete('state');
      window.history.replaceState({}, document.title, `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
    } else {
      this.latestError = { status: response.status, code: 'AUTH_EXCHANGE', message: t('qw.error_auth_exchange') };
      this.latestErrorRaw = await response.text().catch(() => '');
    }
  }

  private async ensureAccessToken(): Promise<boolean> {
    if (!this.auth.accessToken || !this.auth.sessionId) {
      this.latestError = { status: 401, code: 'AUTH_REQUIRED', message: t('qw.error_auth_required') };
      this.latestErrorRaw = '';
      this.state.setRunStatus('error');
      this.render();
      return false;
    }
    if (Date.now() < this.auth.expiresAt) return true;

    const response = await fetch('/api/query/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.auth.sessionId }),
    });
    if (!response.ok) {
      this.latestError = { status: response.status, code: 'AUTH_REFRESH', message: t('qw.error_auth_refresh') };
      this.latestErrorRaw = await response.text().catch(() => '');
      this.state.setRunStatus('error');
      this.render();
      return false;
    }
    const payload = await response.json() as { accessToken: string; expiresIn: number; sessionId: string };
    this.auth.accessToken = payload.accessToken;
    this.auth.sessionId = payload.sessionId;
    this.auth.expiresAt = Date.now() + Math.max(60, Number(payload.expiresIn || 3600) - 60) * 1000;
    this.saveAuthState();
    return true;
  }
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) result += chars[bytes[i] % chars.length];
  return result;
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
