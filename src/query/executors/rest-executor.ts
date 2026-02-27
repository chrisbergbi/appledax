import { mapQueryError } from '../error-map';
import { summarizeBenchmark } from '../benchmark';
import type {
  BenchmarkResult,
  BenchmarkRun,
  QueryConnection,
  QueryErrorDetails,
  QueryRequest,
  QueryRunResult,
} from '../types';

const DEFAULT_BASE_URL = (globalThis as { __APPLEDAX_QUERY_API_BASE__?: string }).__APPLEDAX_QUERY_API_BASE__ ?? '';

export async function executeQuery(
  request: QueryRequest,
  connection: QueryConnection,
  signal?: AbortSignal,
): Promise<QueryRunResult> {
  const response = await fetch(`${DEFAULT_BASE_URL}/api/query/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...request, connectionRef: connection.connectionRef }),
    signal,
  });

  if (!response.ok) {
    const bodyText = await safeReadText(response);
    throw mapQueryError(response.status, bodyText);
  }

  return await response.json() as QueryRunResult;
}

export async function benchmarkQuery(
  request: QueryRequest,
  connection: QueryConnection,
  iterations: number,
  warmupRuns = 1,
  signal?: AbortSignal,
): Promise<BenchmarkResult> {
  const response = await fetch(`${DEFAULT_BASE_URL}/api/query/benchmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...request, connectionRef: connection.connectionRef, iterations, warmupRuns }),
    signal,
  });

  if (!response.ok) {
    const bodyText = await safeReadText(response);
    throw mapQueryError(response.status, bodyText);
  }

  const payload = await response.json() as { runs: BenchmarkRun[]; requestId: string };
  const summary = summarizeBenchmark(payload.runs);
  return {
    ...summary,
    requestId: payload.requestId,
  };
}

export function isQueryErrorDetails(err: unknown): err is QueryErrorDetails {
  if (!err || typeof err !== 'object') return false;
  const e = err as Partial<QueryErrorDetails>;
  return typeof e.status === 'number' && typeof e.code === 'string' && typeof e.message === 'string';
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
