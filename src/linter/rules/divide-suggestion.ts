import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

export const divideSuggestion = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];

  for (const token of tokens) {
    if (token.type === TokenType.Operator && token.value === '/') {
      diagnostics.push({
        severity: 'info',
        message: t('lint.divide_suggestion'),
        startLine: token.line,
        startCol: token.col,
        endLine: token.endLine,
        endCol: token.endCol,
        ruleId: 'divide-suggestion',
      });
    }
  }

  return diagnostics;
};
