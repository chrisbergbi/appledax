import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

export const filterAllPattern = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = tokens.filter(
    (tk) => tk.type !== TokenType.Whitespace &&
           tk.type !== TokenType.LineComment &&
           tk.type !== TokenType.BlockComment &&
           tk.type !== TokenType.EOF,
  );

  // Look for the pattern: FILTER( ALL(
  for (let i = 0; i < nonWS.length - 3; i++) {
    if (nonWS[i].type === TokenType.Function &&
        nonWS[i].value.toUpperCase() === 'FILTER' &&
        nonWS[i + 1].type === TokenType.OpenParen &&
        nonWS[i + 2].type === TokenType.Function &&
        nonWS[i + 2].value.toUpperCase() === 'ALL') {
      diagnostics.push({
        severity: 'warning',
        message: t('lint.filter_all_pattern'),
        startLine: nonWS[i].line,
        startCol: nonWS[i].col,
        endLine: nonWS[i + 2].endLine,
        endCol: nonWS[i + 2].endCol,
        ruleId: 'filter-all-pattern',
        quickFix: {
          title: t('qf.calculate_alternative'),
          safety: 'risky',
          confidence: 0.5,
          edits: [{
            range: { startLine: nonWS[i].line + 1, startCol: 1, endLine: nonWS[i].line + 1, endCol: 1 },
            text: '// Consider: CALCULATE(<expr>, \'Table\'[Column] = <value>)\n',
          }],
        },
      });
    }
  }

  return diagnostics;
};
