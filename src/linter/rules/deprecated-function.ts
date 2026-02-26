/**
 * Rule: deprecated-function
 *
 * Warns when discouraged DAX functions are used (e.g. EARLIER, EARLIEST).
 * Suggests modern alternatives.
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { filterNonWS } from './_utils';
import { DEPRECATED_FUNCTIONS } from '../../knowledge/deprecated';

export const deprecatedFunction = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = filterNonWS(tokens);

  for (let i = 0; i < nonWS.length; i++) {
    const tk = nonWS[i];

    if (tk.type !== TokenType.Function) continue;

    const upper = tk.value.toUpperCase();
    const info = DEPRECATED_FUNCTIONS[upper];
    if (!info) continue;

    diagnostics.push({
      severity: 'warning',
      message: t('lint.deprecated_function', { name: upper, reason: info.reason }),
      startLine: tk.line,
      startCol: tk.col,
      endLine: tk.endLine,
      endCol: tk.endCol,
      ruleId: 'deprecated-function',
      quickFix: {
        title: t('qf.deprecated_var_hint'),
        edits: [{
          range: { startLine: tk.line, startCol: 1, endLine: tk.line, endCol: 1 },
          text: '// Use VAR to capture the value before the inner iteration:\n// VAR __outerValue = [Column]\n// ... then reference __outerValue inside the iterator\n',
        }],
      },
    });
  }

  return diagnostics;
};
