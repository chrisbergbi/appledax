import type { LintDiagnostic } from '../types';

interface LintMetrics {
  totalRuns: number;
  totalDiagnostics: number;
  byRule: Record<string, number>;
  bySeverity: Record<string, number>;
  lastRunAt: number;
}

const STORAGE_KEY = 'appledax-lint-metrics';

const EMPTY_METRICS: LintMetrics = {
  totalRuns: 0,
  totalDiagnostics: 0,
  byRule: {},
  bySeverity: {},
  lastRunAt: 0,
};

export function recordLintRun(diags: LintDiagnostic[]): void {
  const metrics = getLintMetrics();
  metrics.totalRuns += 1;
  metrics.totalDiagnostics += diags.length;
  metrics.lastRunAt = Date.now();

  for (const diag of diags) {
    metrics.byRule[diag.ruleId] = (metrics.byRule[diag.ruleId] ?? 0) + 1;
    metrics.bySeverity[diag.severity] = (metrics.bySeverity[diag.severity] ?? 0) + 1;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metrics));
  } catch {
    // ignore in non-browser contexts
  }
}

export function getLintMetrics(): LintMetrics {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_METRICS, byRule: {}, bySeverity: {} };
    const parsed = JSON.parse(raw) as Partial<LintMetrics>;
    if (!parsed || typeof parsed !== 'object') {
      return { ...EMPTY_METRICS, byRule: {}, bySeverity: {} };
    }
    return {
      totalRuns: typeof parsed.totalRuns === 'number' ? parsed.totalRuns : 0,
      totalDiagnostics: typeof parsed.totalDiagnostics === 'number' ? parsed.totalDiagnostics : 0,
      byRule: parsed.byRule && typeof parsed.byRule === 'object' ? parsed.byRule : {},
      bySeverity: parsed.bySeverity && typeof parsed.bySeverity === 'object' ? parsed.bySeverity : {},
      lastRunAt: typeof parsed.lastRunAt === 'number' ? parsed.lastRunAt : 0,
    };
  } catch {
    return { ...EMPTY_METRICS, byRule: {}, bySeverity: {} };
  }
}
