/**
 * Rule: iferror-warning
 *
 * Warns when IFERROR() is used, as it suppresses ALL errors — including
 * those from logic bugs, missing columns, type mismatches, etc.
 * Best practice is to handle specific error conditions explicitly.
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

export const iferrorWarning = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];

  for (const tk of tokens) {
    if (tk.type === TokenType.Function && tk.value.toUpperCase() === 'IFERROR') {
      diagnostics.push({
        severity: 'warning',
        message: t('lint.iferror_warning'),
        startLine: tk.line,
        startCol: tk.col,
        endLine: tk.endLine,
        endCol: tk.endCol,
        ruleId: 'iferror-warning',
        quickFix: {
          title: t('qf.iferror_hint'),
          edits: [{
            range: { startLine: tk.line, startCol: 1, endLine: tk.line, endCol: 1 },
            text: '// Consider: IF(ISERROR(<expr>), <fallback>, <expr>) for explicit error handling\n',
          }],
        },
      });
    }
  }

  return diagnostics;
};
