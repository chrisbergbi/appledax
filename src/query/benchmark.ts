import type { BenchmarkResult, BenchmarkRun } from './types';

export function summarizeBenchmark(runs: BenchmarkRun[]): Omit<BenchmarkResult, 'requestId'> {
  const values = runs.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const medianMs = percentile(values, 0.5);
  const p95Ms = percentile(values, 0.95);
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const variance = values.length > 0
    ? values.reduce((acc, v) => acc + (v - avg) * (v - avg), 0) / values.length
    : 0;
  return {
    runs,
    medianMs,
    p95Ms,
    stdDevMs: Math.sqrt(variance),
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const idx = Math.min(values.length - 1, Math.max(0, Math.floor(p * (values.length - 1))));
  return values[idx];
}
