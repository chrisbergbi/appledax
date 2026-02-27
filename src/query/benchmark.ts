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

export type BenchmarkAssessment = 'excellent' | 'good' | 'fair' | 'needs_attention';

export function assessBenchmark(medianMs: number, p95Ms: number): BenchmarkAssessment {
  if (medianMs <= 150 && p95Ms <= 300) return 'excellent';
  if (medianMs <= 400 && p95Ms <= 800) return 'good';
  if (medianMs <= 900 && p95Ms <= 1800) return 'fair';
  return 'needs_attention';
}

export function benchmarkRecommendation(assessment: BenchmarkAssessment): string {
  if (assessment === 'excellent') return 'Keep this pattern; changes are likely unnecessary.';
  if (assessment === 'good') return 'Acceptable for most reports; optimize only if this is frequently queried.';
  if (assessment === 'fair') return 'Review filter granularity and iterator usage for faster execution.';
  return 'Prioritize optimization: simplify filters, reduce cardinality, and benchmark alternatives.';
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const idx = Math.min(values.length - 1, Math.max(0, Math.floor(p * (values.length - 1))));
  return values[idx];
}
