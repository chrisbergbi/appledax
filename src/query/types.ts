export type QueryRunStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';

export type QueryConnectionMode = 'delegated' | 'service-principal';

export interface QueryConnectionRef {
  accessToken?: string;
}

export interface QueryConnection {
  mode: QueryConnectionMode;
  workspaceId: string;
  datasetId: string;
  workspaceName?: string;
  datasetName?: string;
  connectionRef?: QueryConnectionRef;
}

export interface QueryRequest {
  queryText: string;
  workspaceId: string;
  datasetId: string;
  mode: QueryConnectionMode;
  connectionRef?: QueryConnectionRef;
}

export interface QueryColumn {
  name: string;
  type?: string;
}

export interface QueryWarning {
  code: string;
  message: string;
}

export interface QueryRunResult {
  columns: QueryColumn[];
  rows: Array<Record<string, unknown>>;
  elapsedMs: number;
  truncated: boolean;
  warnings: QueryWarning[];
  requestId: string;
}

export interface BenchmarkRun {
  run: number;
  elapsedMs: number;
  requestId: string;
}

export interface BenchmarkResult {
  runs: BenchmarkRun[];
  medianMs: number;
  p95Ms: number;
  stdDevMs: number;
  requestId: string;
}

export interface QueryTab {
  id: string;
  name: string;
  queryText: string;
  dirty: boolean;
  lastRunStatus: QueryRunStatus;
}

export interface QueryErrorDetails {
  status: number;
  code: string;
  message: string;
  suggestion?: string;
}

export interface QueryProfile {
  id: string;
  name: string;
  mode: QueryConnectionMode;
  tenantId: string;
  clientId: string;
  redirectUri: string;
  workspaceId: string;
  datasetId: string;
  accessToken: string;
  sessionId: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}
