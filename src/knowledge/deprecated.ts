export interface DeprecatedInfo {
  replacement: string;
  reason: string;
}

/**
 * Map of deprecated/discouraged DAX function names to their recommended replacements.
 */
export const DEPRECATED_FUNCTIONS: Record<string, DeprecatedInfo> = {
  EARLIER: {
    replacement: 'VAR',
    reason: 'Use VAR to capture outer row context values before the inner iteration',
  },
  EARLIEST: {
    replacement: 'VAR',
    reason: 'Use VAR to capture outer row context values before the inner iteration',
  },
};

/**
 * Check if a function name is in the deprecated/discouraged list (case-insensitive).
 */
export function isDeprecated(name: string): DeprecatedInfo | undefined {
  return DEPRECATED_FUNCTIONS[name.toUpperCase()];
}
