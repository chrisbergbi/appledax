import type { LintDiagnostic } from '../types';

export type LintSeverity = LintDiagnostic['severity'];
export type LintProfile = 'balanced' | 'strict' | 'performance';

export interface LintConfig {
  profile: LintProfile;
  disabledRules: string[];
  severityOverrides: Partial<Record<string, LintSeverity>>;
}

const STORAGE_KEY = 'appledax-lint-config';

const DEFAULT_CONFIG: LintConfig = {
  profile: 'balanced',
  disabledRules: [],
  severityOverrides: {},
};

const PROFILE_OVERRIDES: Record<LintProfile, Partial<Record<string, LintSeverity>>> = {
  balanced: {},
  strict: {
    'if-missing-else': 'warning',
    'selectedvalue-missing-default': 'warning',
    'calculate-no-filter': 'warning',
    'function-casing': 'warning',
  },
  performance: {
    'calculate-no-filter': 'warning',
    'filter-all-pattern': 'warning',
    'countrows-filter-pattern': 'warning',
    'all-vs-removefilters': 'warning',
    'divide-suggestion': 'warning',
  },
};

const PROFILE_DISABLED: Record<LintProfile, string[]> = {
  balanced: [],
  strict: [],
  performance: ['function-casing'],
};

let cachedConfig: LintConfig | null = null;

export function getLintConfig(): LintConfig {
  if (cachedConfig) return cachedConfig;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedConfig = { ...DEFAULT_CONFIG };
      return cachedConfig;
    }
    const parsed = JSON.parse(raw) as Partial<LintConfig>;
    cachedConfig = normalizeConfig(parsed);
    return cachedConfig;
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

export function setLintProfile(profile: LintProfile): void {
  const config = getLintConfig();
  config.profile = profile;
  saveLintConfig(config);
}

export function setRuleEnabled(ruleId: string, enabled: boolean): void {
  const config = getLintConfig();
  const upperId = ruleId.trim();
  const set = new Set(config.disabledRules);
  if (enabled) set.delete(upperId);
  else set.add(upperId);
  config.disabledRules = [...set];
  saveLintConfig(config);
}

export function setRuleSeverity(ruleId: string, severity: LintSeverity | null): void {
  const config = getLintConfig();
  if (!severity) {
    delete config.severityOverrides[ruleId];
  } else {
    config.severityOverrides[ruleId] = severity;
  }
  saveLintConfig(config);
}

export function applyLintConfig(diags: LintDiagnostic[]): LintDiagnostic[] {
  const config = getLintConfig();
  const profileOverrides = PROFILE_OVERRIDES[config.profile] ?? {};
  const profileDisabled = new Set(PROFILE_DISABLED[config.profile] ?? []);
  const customDisabled = new Set(config.disabledRules);

  const output: LintDiagnostic[] = [];
  for (const diag of diags) {
    if (profileDisabled.has(diag.ruleId) || customDisabled.has(diag.ruleId)) {
      continue;
    }

    const customSeverity = config.severityOverrides[diag.ruleId];
    const profileSeverity = profileOverrides[diag.ruleId];
    const resolvedSeverity = customSeverity ?? profileSeverity ?? diag.severity;

    output.push({
      ...diag,
      severity: resolvedSeverity,
    });
  }
  return output;
}

export function getLintProfiles(): LintProfile[] {
  return ['balanced', 'strict', 'performance'];
}

function saveLintConfig(config: LintConfig): void {
  cachedConfig = normalizeConfig(config);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedConfig));
  } catch {
    // ignore in non-browser contexts
  }
}

function normalizeConfig(config: Partial<LintConfig>): LintConfig {
  const profile = config.profile === 'strict' || config.profile === 'performance'
    ? config.profile
    : 'balanced';
  return {
    profile,
    disabledRules: Array.isArray(config.disabledRules)
      ? config.disabledRules.filter((x): x is string => typeof x === 'string')
      : [],
    severityOverrides: isPlainObject(config.severityOverrides)
      ? { ...config.severityOverrides as Partial<Record<string, LintSeverity>> }
      : {},
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
