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
import { benchmarkHint, getBenchmarkPresetConfig } from '../query/benchmark-presets';
import { assessBenchmark, benchmarkRecommendation } from '../query/benchmark';
import { buildSnapshot, parseSnapshot } from '../query/snapshot';
import { clearQueryTimeline, filterQueryTimeline, loadQueryTimeline, recordQueryTimelineEvent } from '../query/timeline';

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

function runBenchmarkPresetTests(): void {
  const quick = getBenchmarkPresetConfig('quick');
  const standard = getBenchmarkPresetConfig('standard');
  const deep = getBenchmarkPresetConfig('deep');
  assert(quick.iterations === 3 && quick.warmupRuns === 0, 'Expected quick preset config');
  assert(standard.iterations === 5 && standard.warmupRuns === 1, 'Expected standard preset config');
  assert(deep.iterations === 10 && deep.warmupRuns === 2, 'Expected deep preset config');
  assert(benchmarkHint('quick').length > 0, 'Expected benchmark hint text');
}

function runBenchmarkAssessmentTests(): void {
  assert(assessBenchmark(120, 250) === 'excellent', 'Expected excellent assessment');
  assert(assessBenchmark(300, 700) === 'good', 'Expected good assessment');
  assert(assessBenchmark(700, 1200) === 'fair', 'Expected fair assessment');
  assert(assessBenchmark(1500, 3200) === 'needs_attention', 'Expected needs_attention assessment');
  assert(benchmarkRecommendation('excellent').length > 0, 'Expected recommendation text');
}

function runSnapshotTests(): void {
  const snapshot = buildSnapshot(
    'EVALUATE ROW(\"X\", 1)',
    { mode: 'delegated', workspaceId: 'w1', datasetId: 'd1', workspaceName: 'WS', datasetName: 'DS' },
    { columns: [{ name: 'X' }], rows: [{ X: 1 }], elapsedMs: 111, truncated: false, warnings: [], requestId: 'r1' },
    null,
  );
  const parsed = parseSnapshot(JSON.stringify(snapshot));
  assert(parsed !== null, 'Expected snapshot parsing to succeed');
  assert(parsed?.connection.datasetId === 'd1', 'Expected dataset id in parsed snapshot');
  assert(parseSnapshot('{\"version\":2}') === null, 'Expected unsupported version to fail parsing');
}

function runTimelineTests(): void {
  installLocalStorageMock();
  recordQueryTimelineEvent('run', 'running', 'Run started');
  recordQueryTimelineEvent('run', 'success', 'Run succeeded');
  const events = loadQueryTimeline();
  assert(events.length === 2, `Expected 2 timeline events, got ${events.length}`);
  assert(events[0].status === 'success', 'Expected newest timeline event first');
  assert(filterQueryTimeline(events, 'errors').length === 0, 'Expected no error events in filter');
  assert(filterQueryTimeline(events, 'running').length === 1, 'Expected one running event in filter');
  clearQueryTimeline();
  assert(loadQueryTimeline().length === 0, 'Expected timeline clear to remove all events');
}

runBenchmarkSummaryTest();
runErrorMapTests();
runProfileStoreTests();
runStateStoreTests();
runHistoryTests();
runCompletionScoringTests();
runBenchmarkPresetTests();
runBenchmarkAssessmentTests();
runSnapshotTests();
runTimelineTests();
console.log('Query unit checks passed.');
