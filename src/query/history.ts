import type { QueryConnection, QueryRunResult } from './types';

const STORAGE_KEY = 'appledax-query-history';
const MAX_ITEMS = 200;

export interface QueryHistoryItem {
  id: string;
  createdAt: number;
  pinned: boolean;
  queryText: string;
  workspaceId: string;
  workspaceName: string;
  datasetId: string;
  datasetName: string;
  elapsedMs: number;
  rowCount: number;
  requestId: string;
  warnings: string[];
}

export function loadQueryHistory(): QueryHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueryHistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeHistoryItem).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
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
    pinned: false,
    queryText,
    workspaceId: connection.workspaceId,
    workspaceName: connection.workspaceName ?? '',
    datasetId: connection.datasetId,
    datasetName: connection.datasetName ?? '',
    elapsedMs: result.elapsedMs,
    rowCount: result.rows.length,
    requestId: result.requestId,
    warnings: result.warnings.map((warning) => warning.message),
  };
  persistHistory([item, ...existing]);
}

export function searchQueryHistory(searchTerm: string): QueryHistoryItem[] {
  const needle = searchTerm.trim().toLowerCase();
  if (!needle) return loadQueryHistory();
  return loadQueryHistory().filter((item) =>
    item.queryText.toLowerCase().includes(needle)
    || item.workspaceName.toLowerCase().includes(needle)
    || item.datasetName.toLowerCase().includes(needle)
    || item.workspaceId.toLowerCase().includes(needle)
    || item.datasetId.toLowerCase().includes(needle)
  );
}

export function togglePinnedHistoryItem(id: string): QueryHistoryItem[] {
  const next = loadQueryHistory().map((item) =>
    item.id === id ? { ...item, pinned: !item.pinned } : item
  );
  persistHistory(next);
  return loadQueryHistory();
}

function persistHistory(items: QueryHistoryItem[]): void {
  const trimmed = items.slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

function normalizeHistoryItem(item: QueryHistoryItem): QueryHistoryItem {
  return {
    ...item,
    pinned: Boolean(item.pinned),
    workspaceName: item.workspaceName ?? '',
    datasetName: item.datasetName ?? '',
    warnings: Array.isArray(item.warnings) ? item.warnings : [],
  };
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
