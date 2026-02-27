/**
 * Rule: countrows-filter-pattern
 *
 * Detects the pattern COUNTROWS(FILTER(...)) which can often be rewritten
 * as CALCULATE(COUNTROWS(<table>), <filter>) for better performance.
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { filterNonWS } from './_utils';

export const countrowsFilterPattern = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = filterNonWS(tokens);

  // Look for the 4-token pattern: COUNTROWS ( FILTER (
  for (let i = 0; i < nonWS.length - 3; i++) {
    if (
      nonWS[i].type === TokenType.Function &&
      nonWS[i].value.toUpperCase() === 'COUNTROWS' &&
      nonWS[i + 1].type === TokenType.OpenParen &&
      nonWS[i + 2].type === TokenType.Function &&
      nonWS[i + 2].value.toUpperCase() === 'FILTER'
    ) {
      diagnostics.push({
        severity: 'info',
        message: t('lint.countrows_filter'),
        startLine: nonWS[i].line,
        startCol: nonWS[i].col,
        endLine: nonWS[i + 2].endLine,
        endCol: nonWS[i + 2].endCol,
        ruleId: 'countrows-filter-pattern',
        quickFix: {
          title: t('qf.countrows_calculate'),
          safety: 'risky',
          confidence: 0.5,
          edits: [{
            range: { startLine: nonWS[i].line + 1, startCol: 1, endLine: nonWS[i].line + 1, endCol: 1 },
            text: '// Consider: CALCULATE(COUNTROWS(\'Table\'), <filter condition>)\n',
          }],
        },
      });
    }
  }

  return diagnostics;
};
