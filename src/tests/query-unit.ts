import { summarizeBenchmark } from '../query/benchmark';
import { mapQueryError } from '../query/error-map';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
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

runBenchmarkSummaryTest();
runErrorMapTests();
console.log('Query unit checks passed.');
