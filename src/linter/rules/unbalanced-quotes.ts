import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

export const unbalancedQuotes = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];

  for (const token of tokens) {
    if (token.type === TokenType.String) {
      // Check if string is properly terminated (starts and ends with ")
      if (!token.value.endsWith('"') || token.value.length < 2) {
        diagnostics.push({
          severity: 'error',
          message: t('lint.unterminated_string'),
          startLine: token.line,
          startCol: token.col,
          endLine: token.endLine,
          endCol: token.endCol,
          ruleId: 'unbalanced-quotes',
        });
      }
    }

    if (token.type === TokenType.TableRef) {
      // Check if table ref is properly terminated (starts and ends with ')
      const val = token.value;
      if (val.length < 2 || val[0] !== "'" || val[val.length - 1] !== "'") {
        diagnostics.push({
          severity: 'error',
          message: t('lint.unterminated_table_ref'),
          startLine: token.line,
          startCol: token.col,
          endLine: token.endLine,
          endCol: token.endCol,
          ruleId: 'unbalanced-quotes',
        });
      }
    }

    if (token.type === TokenType.ColumnRef) {
      // Check if column ref is properly terminated [...]
      const val = token.value;
      if (!val.endsWith(']')) {
        diagnostics.push({
          severity: 'error',
          message: t('lint.unterminated_column_ref'),
          startLine: token.line,
          startCol: token.col,
          endLine: token.endLine,
          endCol: token.endCol,
          ruleId: 'unbalanced-quotes',
        });
      }
    }
  }

  return diagnostics;
};
