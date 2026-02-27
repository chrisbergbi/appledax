export type BenchmarkPreset = 'quick' | 'standard' | 'deep';

export interface BenchmarkPresetConfig {
  iterations: number;
  warmupRuns: number;
}

export function getBenchmarkPresetConfig(preset: BenchmarkPreset): BenchmarkPresetConfig {
  if (preset === 'quick') {
    return { iterations: 3, warmupRuns: 0 };
  }
  if (preset === 'deep') {
    return { iterations: 10, warmupRuns: 2 };
  }
  return { iterations: 5, warmupRuns: 1 };
}

export function benchmarkHint(preset: BenchmarkPreset): string {
  if (preset === 'quick') return 'Quick confidence';
  if (preset === 'deep') return 'Higher confidence';
  return 'Balanced confidence';
}
