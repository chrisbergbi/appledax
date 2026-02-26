/**
 * Rule: all-vs-removefilters
 *
 * When ALL() is used as a filter argument inside CALCULATE/CALCULATETABLE,
 * REMOVEFILTERS() is clearer — it expresses the intent more explicitly.
 *
 * Detects: CALCULATE(..., ALL(...))  or  CALCULATETABLE(..., ALL(...))
 * Suggests: Use REMOVEFILTERS() instead of ALL() in this context.
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { filterNonWS } from './_utils';

export const allVsRemovefilters = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = filterNonWS(tokens);

  for (let i = 0; i < nonWS.length; i++) {
    const tok = nonWS[i];

    // Look for CALCULATE( or CALCULATETABLE(
    if (
      tok.type !== TokenType.Function ||
      (tok.value.toUpperCase() !== 'CALCULATE' && tok.value.toUpperCase() !== 'CALCULATETABLE') ||
      i + 1 >= nonWS.length ||
      nonWS[i + 1].type !== TokenType.OpenParen
    ) {
      continue;
    }

    // Scan filter arguments (everything after the first comma at depth 1)
    let depth = 1;
    let pastFirstArg = false;
    for (let j = i + 2; j < nonWS.length; j++) {
      if (nonWS[j].type === TokenType.OpenParen) {
        depth++;
      } else if (nonWS[j].type === TokenType.CloseParen) {
        depth--;
        if (depth === 0) break; // end of CALCULATE
      } else if (nonWS[j].type === TokenType.Comma && depth === 1) {
        pastFirstArg = true;
        continue;
      }

      // Only look in filter arguments (after first comma at depth 1)
      if (!pastFirstArg || depth !== 1) continue;

      // Check for ALL( at this position
      if (
        nonWS[j].type === TokenType.Function &&
        nonWS[j].value.toUpperCase() === 'ALL' &&
        j + 1 < nonWS.length &&
        nonWS[j + 1].type === TokenType.OpenParen
      ) {
        diagnostics.push({
          severity: 'info',
          message: t('lint.all_vs_removefilters'),
          startLine: nonWS[j].line,
          startCol: nonWS[j].col,
          endLine: nonWS[j].endLine,
          endCol: nonWS[j].endCol,
          ruleId: 'all-vs-removefilters',
        });
      }
    }
  }

  return diagnostics;
};
