/**
 * Rule: selectedvalue-suggestion
 *
 * Detects the pattern:
 *   IF(HASONEVALUE(<col>), VALUES(<col>), <default>)
 * which can be simplified to:
 *   SELECTEDVALUE(<col>, <default>)
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { filterNonWS, parseFunctionArgs } from './_utils';

export const selectedvalueSuggestion = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = filterNonWS(tokens);

  for (let i = 0; i < nonWS.length; i++) {
    // Find IF(
    if (
      nonWS[i].type !== TokenType.Function ||
      nonWS[i].value.toUpperCase() !== 'IF' ||
      i + 1 >= nonWS.length ||
      nonWS[i + 1].type !== TokenType.OpenParen
    ) {
      continue;
    }

    const args = parseFunctionArgs(nonWS, i + 1);
    if (!args || args.length < 3) continue;

    const arg1 = args[0]; // condition
    const arg2 = args[1]; // true branch

    // Check arg1 starts with HASONEVALUE(
    if (
      arg1.length < 1 ||
      arg1[0].type !== TokenType.Function ||
      arg1[0].value.toUpperCase() !== 'HASONEVALUE'
    ) {
      continue;
    }

    // Check arg2 starts with VALUES(
    if (
      arg2.length < 1 ||
      arg2[0].type !== TokenType.Function ||
      arg2[0].value.toUpperCase() !== 'VALUES'
    ) {
      continue;
    }

    // Find the closing paren of the IF call for the span
    let depth = 1;
    let endIdx = i + 2;
    for (; endIdx < nonWS.length; endIdx++) {
      if (nonWS[endIdx].type === TokenType.OpenParen) depth++;
      if (nonWS[endIdx].type === TokenType.CloseParen) {
        depth--;
        if (depth === 0) break;
      }
    }
    const endToken = endIdx < nonWS.length ? nonWS[endIdx] : nonWS[nonWS.length - 1];

    diagnostics.push({
      severity: 'info',
      message: t('lint.selectedvalue_suggestion'),
      startLine: nonWS[i].line,
      startCol: nonWS[i].col,
      endLine: endToken.endLine,
      endCol: endToken.endCol,
      ruleId: 'selectedvalue-suggestion',
      quickFix: {
        title: t('qf.selectedvalue_hint'),
        safety: 'review',
        confidence: 0.7,
        edits: [{
          range: { startLine: nonWS[i].line, startCol: 1, endLine: nonWS[i].line, endCol: 1 },
          text: '// Simplify to: SELECTEDVALUE(<column>, <default>)\n',
        }],
      },
    });
  }

  return diagnostics;
};
