export type TimelineEventStatus = 'success' | 'error' | 'cancelled' | 'running';

export interface QueryTimelineEvent {
  id: string;
  createdAt: number;
  kind: 'run' | 'benchmark' | 'preflight';
  status: TimelineEventStatus;
  message: string;
}

const STORAGE_KEY = 'appledax-query-timeline';
const MAX_ITEMS = 120;

export function loadQueryTimeline(): QueryTimelineEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueryTimelineEvent[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function recordQueryTimelineEvent(kind: QueryTimelineEvent['kind'], status: TimelineEventStatus, message: string): void {
  const next: QueryTimelineEvent = {
    id: createId(),
    createdAt: Date.now(),
    kind,
    status,
    message,
  };
  const events = [next, ...loadQueryTimeline()].slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
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
