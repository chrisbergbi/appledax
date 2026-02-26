/**
 * Rule: redundant-if
 *
 * Detects redundant IF patterns:
 *   IF(cond, TRUE(), FALSE())  → simplify to just cond
 *   IF(cond, FALSE(), TRUE())  → simplify to NOT(cond)
 *
 * Handles both TRUE()/FALSE() function calls and bare TRUE/FALSE keywords.
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { filterNonWS, parseFunctionArgs } from './_utils';

/**
 * Check if an argument is exactly TRUE — either:
 *  - Single Keyword token "TRUE"
 *  - Function "TRUE" + OpenParen + CloseParen
 */
function isTrueArg(argTokens: Token[]): boolean {
  if (argTokens.length === 1) {
    return argTokens[0].type === TokenType.Keyword && argTokens[0].value.toUpperCase() === 'TRUE';
  }
  if (argTokens.length === 3) {
    return (
      argTokens[0].type === TokenType.Function &&
      argTokens[0].value.toUpperCase() === 'TRUE' &&
      argTokens[1].type === TokenType.OpenParen &&
      argTokens[2].type === TokenType.CloseParen
    );
  }
  return false;
}

/**
 * Check if an argument is exactly FALSE — either:
 *  - Single Keyword token "FALSE"
 *  - Function "FALSE" + OpenParen + CloseParen
 */
function isFalseArg(argTokens: Token[]): boolean {
  if (argTokens.length === 1) {
    return argTokens[0].type === TokenType.Keyword && argTokens[0].value.toUpperCase() === 'FALSE';
  }
  if (argTokens.length === 3) {
    return (
      argTokens[0].type === TokenType.Function &&
      argTokens[0].value.toUpperCase() === 'FALSE' &&
      argTokens[1].type === TokenType.OpenParen &&
      argTokens[2].type === TokenType.CloseParen
    );
  }
  return false;
}

export const redundantIf = (tokens: Token[]): LintDiagnostic[] => {
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

    const arg2 = args[1]; // second argument (true-result)
    const arg3 = args[2]; // third argument (false-result)

    // Pattern: IF(cond, TRUE, FALSE)
    if (isTrueArg(arg2) && isFalseArg(arg3)) {
      // Find the closing paren of the IF call
      let depth = 1;
      let endIdx = i + 2; // start after (
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
        message: t('lint.redundant_if_true_false'),
        startLine: nonWS[i].line,
        startCol: nonWS[i].col,
        endLine: endToken.endLine,
        endCol: endToken.endCol,
        ruleId: 'redundant-if',
      });
    }

    // Pattern: IF(cond, FALSE, TRUE)
    if (isFalseArg(arg2) && isTrueArg(arg3)) {
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
        message: t('lint.redundant_if_false_true'),
        startLine: nonWS[i].line,
        startCol: nonWS[i].col,
        endLine: endToken.endLine,
        endCol: endToken.endCol,
        ruleId: 'redundant-if',
      });
    }
  }

  return diagnostics;
};
