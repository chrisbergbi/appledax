import type { BenchmarkResult, QueryConnection, QueryRunResult } from './types';

export interface QuerySnapshot {
  version: 1;
  createdAt: number;
  queryText: string;
  connection: {
    mode: QueryConnection['mode'];
    workspaceId: string;
    datasetId: string;
    workspaceName?: string;
    datasetName?: string;
  };
  result?: QueryRunResult;
  benchmark?: BenchmarkResult;
}

export function buildSnapshot(
  queryText: string,
  connection: QueryConnection,
  result: QueryRunResult | null,
  benchmark: BenchmarkResult | null,
): QuerySnapshot {
  return {
    version: 1,
    createdAt: Date.now(),
    queryText,
    connection: {
      mode: connection.mode,
      workspaceId: connection.workspaceId,
      datasetId: connection.datasetId,
      workspaceName: connection.workspaceName,
      datasetName: connection.datasetName,
    },
    result: result ?? undefined,
    benchmark: benchmark ?? undefined,
  };
}

export function exportSnapshot(filename: string, snapshot: QuerySnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function parseSnapshot(raw: string): QuerySnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<QuerySnapshot>;
    if (parsed.version !== 1) return null;
    if (typeof parsed.queryText !== 'string') return null;
    if (!parsed.connection || typeof parsed.connection !== 'object') return null;
    if (typeof parsed.connection.workspaceId !== 'string') return null;
    if (typeof parsed.connection.datasetId !== 'string') return null;
    if (parsed.connection.mode !== 'delegated' && parsed.connection.mode !== 'service-principal') return null;
    return parsed as QuerySnapshot;
  } catch {
    return null;
  }
}
