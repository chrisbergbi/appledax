import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

export const unbalancedParens = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const stack: Token[] = [];

  for (const token of tokens) {
    if (token.type === TokenType.OpenParen) {
      stack.push(token);
    } else if (token.type === TokenType.CloseParen) {
      if (stack.length === 0) {
        diagnostics.push({
          severity: 'error',
          message: t('lint.unmatched_close_paren'),
          startLine: token.line,
          startCol: token.col,
          endLine: token.endLine,
          endCol: token.endCol,
          ruleId: 'unbalanced-parens',
        });
      } else {
        stack.pop();
      }
    }
  }

  for (const open of stack) {
    diagnostics.push({
      severity: 'error',
      message: t('lint.unmatched_open_paren'),
      startLine: open.line,
      startCol: open.col,
      endLine: open.endLine,
      endCol: open.endCol,
      ruleId: 'unbalanced-parens',
    });
  }

  return diagnostics;
};
