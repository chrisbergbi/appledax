import type { QueryConnection, QueryRunResult } from './types';

const STORAGE_KEY = 'appledax-query-history';
const MAX_ITEMS = 30;

export interface QueryHistoryItem {
  id: string;
  createdAt: number;
  queryText: string;
  workspaceId: string;
  datasetId: string;
  elapsedMs: number;
  rowCount: number;
  requestId: string;
}

export function loadQueryHistory(): QueryHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueryHistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveQueryHistoryItem(
  queryText: string,
  connection: QueryConnection,
  result: QueryRunResult,
): void {
  const existing = loadQueryHistory();
  const item: QueryHistoryItem = {
    id: createId(),
    createdAt: Date.now(),
    queryText,
    workspaceId: connection.workspaceId,
    datasetId: connection.datasetId,
    elapsedMs: result.elapsedMs,
    rowCount: result.rows.length,
    requestId: result.requestId,
  };
  const next = [item, ...existing].slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
