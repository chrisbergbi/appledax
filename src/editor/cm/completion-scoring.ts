const COMPLETION_RECENCY_KEY = 'appledax-completion-recency';
const RECENCY_MAX = 200;

export function fuzzyMatchScore(candidate: string, query: string): number {
  if (!query) return 0;
  const cand = candidate.toLowerCase();
  const q = query.toLowerCase();
  if (cand.startsWith(q)) return 6;
  if (cand.includes(q)) return 4;

  let idx = 0;
  let score = 0;
  for (let i = 0; i < cand.length && idx < q.length; i++) {
    if (cand[i] === q[idx]) {
      idx++;
      score++;
    }
  }
  if (idx !== q.length) return 0;
  return Math.max(1, Math.min(3, score));
}

export function loadRecencyMap(): Map<string, number> {
  try {
    const raw = localStorage.getItem(COMPLETION_RECENCY_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Array<{ label: string; ts: number }>;
    if (!Array.isArray(parsed)) return new Map();
    const map = new Map<string, number>();
    for (const item of parsed) {
      if (!item || typeof item.label !== 'string' || typeof item.ts !== 'number') continue;
      map.set(item.label, item.ts);
    }
    return map;
  } catch {
    return new Map();
  }
}

function persistRecencyMap(map: Map<string, number>): void {
  try {
    const items = [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, RECENCY_MAX)
      .map(([label, ts]) => ({ label, ts }));
    localStorage.setItem(COMPLETION_RECENCY_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function recordCompletionUsage(label: string): void {
  const map = loadRecencyMap();
  map.set(label, Date.now());
  persistRecencyMap(map);
}

export function recencyBoost(label: string, map: Map<string, number>): number {
  const ts = map.get(label);
  if (!ts) return 0;
  const minutes = (Date.now() - ts) / 60000;
  if (minutes <= 10) return 6;
  if (minutes <= 60) return 4;
  if (minutes <= 1440) return 2;
  return 1;
}
