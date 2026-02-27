import { summarizeBenchmark } from '../query/benchmark';
import { mapQueryError } from '../query/error-map';
import {
  createProfile,
  deleteProfile,
  ensureProfiles,
  getActiveProfileId,
  loadProfiles,
  setActiveProfileId,
  upsertProfile,
} from '../query/profile-store';
import { QueryStateStore } from '../query/state';
import { saveQueryHistoryItem, searchQueryHistory, togglePinnedHistoryItem } from '../query/history';
import { fuzzyMatchScore, recencyBoost, recordCompletionUsage } from '../editor/cm/completion-scoring';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function installLocalStorageMock(): void {
  const storage = new Map<string, string>();
  const mock = {
    getItem(key: string): string | null {
      return storage.has(key) ? storage.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      storage.set(key, value);
    },
    removeItem(key: string): void {
      storage.delete(key);
    },
    clear(): void {
      storage.clear();
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: mock,
  });
}

function runBenchmarkSummaryTest(): void {
  const summary = summarizeBenchmark([
    { run: 1, elapsedMs: 100, requestId: 'a' },
    { run: 2, elapsedMs: 200, requestId: 'b' },
    { run: 3, elapsedMs: 300, requestId: 'c' },
    { run: 4, elapsedMs: 400, requestId: 'd' },
  ]);

  assert(summary.medianMs === 200, `Expected median 200, got ${summary.medianMs}`);
  assert(summary.p95Ms === 300, `Expected p95 300, got ${summary.p95Ms}`);
  assert(summary.stdDevMs > 0, 'Expected stdDev > 0');
}

function runErrorMapTests(): void {
  const e401 = mapQueryError(401, 'unauthorized');
  assert(e401.code === 'AUTH_REQUIRED', `Expected AUTH_REQUIRED, got ${e401.code}`);

  const e403Build = mapQueryError(403, 'missing build permission');
  assert(e403Build.code === 'MISSING_BUILD', `Expected MISSING_BUILD, got ${e403Build.code}`);

  const e429 = mapQueryError(429, 'too many requests');
  assert(e429.code === 'RATE_LIMITED', `Expected RATE_LIMITED, got ${e429.code}`);

  const e500 = mapQueryError(500, 'server error');
  assert(e500.code === 'SERVER_ERROR', `Expected SERVER_ERROR, got ${e500.code}`);
}

function runProfileStoreTests(): void {
  installLocalStorageMock();
  const profiles = ensureProfiles('http://127.0.0.1:5178/appledax/');
  assert(profiles.length === 1, `Expected 1 default profile, got ${profiles.length}`);

  const created = createProfile('Demo', 'delegated', 'http://127.0.0.1:5178/appledax/');
  const withCreated = upsertProfile(created);
  assert(withCreated.length === 2, `Expected 2 profiles after create, got ${withCreated.length}`);

  setActiveProfileId(created.id);
  assert(getActiveProfileId() === created.id, 'Expected active profile id to match created profile');

  const updated = { ...created, tenantId: 'tenant-1', clientId: 'client-1' };
  const withUpdated = upsertProfile(updated);
  const found = withUpdated.find((item) => item.id === created.id);
  assert(found?.tenantId === 'tenant-1', 'Expected updated tenantId to persist');

  const afterDelete = deleteProfile(created.id);
  assert(afterDelete.length === 1, `Expected 1 profile after delete, got ${afterDelete.length}`);
  assert(loadProfiles().length === 1, 'Expected loadProfiles to return remaining profile');
}

function runStateStoreTests(): void {
  installLocalStorageMock();
  const store = new QueryStateStore();
  const first = store.getActiveTab();
  store.setQueryText(first.id, `${first.queryText}\n-- changed`);
  assert(store.getActiveTab().dirty === true, 'Expected tab dirty after text change');
  store.setTabRunStatus(first.id, 'success');
  assert(store.getActiveTab().dirty === false, 'Expected tab clean after success status');

  const duplicate = store.duplicateTab(first.id);
  assert(Boolean(duplicate), 'Expected duplicate tab to be created');
  assert(store.getTabs().length === 2, 'Expected 2 tabs after duplicate');
}

function runHistoryTests(): void {
  installLocalStorageMock();
  saveQueryHistoryItem(
    'EVALUATE ROW(\"A\", 1)',
    { mode: 'delegated', workspaceId: 'w1', datasetId: 'd1', workspaceName: 'WS', datasetName: 'DS' },
    { columns: [{ name: 'A' }], rows: [{ A: 1 }], elapsedMs: 120, truncated: false, warnings: [], requestId: 'r1' },
  );
  saveQueryHistoryItem(
    'EVALUATE ROW(\"B\", 2)',
    { mode: 'delegated', workspaceId: 'w1', datasetId: 'd2', workspaceName: 'WS', datasetName: 'Finance' },
    { columns: [{ name: 'B' }], rows: [{ B: 2 }], elapsedMs: 130, truncated: false, warnings: [], requestId: 'r2' },
  );

  const finance = searchQueryHistory('finance');
  assert(finance.length === 1, `Expected 1 search hit, got ${finance.length}`);
  const first = finance[0];
  const toggled = togglePinnedHistoryItem(first.id);
  const changed = toggled.find((item) => item.id === first.id);
  assert(changed?.pinned === true, 'Expected pin toggle to set pinned=true');
}

function runCompletionScoringTests(): void {
  installLocalStorageMock();
  assert(fuzzyMatchScore('CALCULATE', 'cal') >= 4, 'Expected strong fuzzy score for prefix');
  assert(fuzzyMatchScore('CALCULATE', 'clc') >= 1, 'Expected subsequence fuzzy score');
  assert(fuzzyMatchScore('CALCULATE', 'xyz') === 0, 'Expected no fuzzy score for non-match');

  recordCompletionUsage('CALCULATE');
  const map = new Map<string, number>([['CALCULATE', Date.now()]]);
  assert(recencyBoost('CALCULATE', map) >= 4, 'Expected positive recency boost');
}

runBenchmarkSummaryTest();
runErrorMapTests();
runProfileStoreTests();
runStateStoreTests();
runHistoryTests();
runCompletionScoringTests();
console.log('Query unit checks passed.');
