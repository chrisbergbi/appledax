/**
 * Rule: function-casing
 *
 * DAX convention is UPPERCASE function names.
 * Detects inconsistent casing like sum(), Sum(), Calculate().
 *
 * Reports with a quick fix to auto-uppercase.
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

export const functionCasing = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];

  for (const tk of tokens) {
    if (tk.type !== TokenType.Function) continue;

    const upper = tk.value.toUpperCase();
    if (tk.value !== upper) {
      diagnostics.push({
        severity: 'info',
        message: t('lint.function_casing', { name: tk.value, upper }),
        startLine: tk.line,
        startCol: tk.col,
        endLine: tk.endLine,
        endCol: tk.endCol,
        ruleId: 'function-casing',
        quickFix: {
          title: t('qf.uppercase_function', { name: upper }),
          edits: [{
            range: {
              startLine: tk.line,
              startCol: tk.col,
              endLine: tk.endLine,
              endCol: tk.endCol,
            },
            text: upper,
          }],
        },
      });
    }
  }

  return diagnostics;
};
