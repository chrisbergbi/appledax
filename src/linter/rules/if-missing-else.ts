/**
 * Rule: if-missing-else
 *
 * Warns when IF() is called with only 2 arguments (missing the else/false branch).
 * IF(cond, trueValue) silently returns BLANK() when the condition is false,
 * which is a very common source of unexpected results.
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { filterNonWS, parseFunctionArgs } from './_utils';

export const ifMissingElse = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = filterNonWS(tokens);

  for (let i = 0; i < nonWS.length; i++) {
    if (
      nonWS[i].type !== TokenType.Function ||
      nonWS[i].value.toUpperCase() !== 'IF' ||
      i + 1 >= nonWS.length ||
      nonWS[i + 1].type !== TokenType.OpenParen
    ) {
      continue;
    }

    const args = parseFunctionArgs(nonWS, i + 1);
    if (!args) continue;

    // IF with exactly 2 args → missing else branch
    if (args.length === 2) {
      diagnostics.push({
        severity: 'warning',
        message: t('lint.if_missing_else'),
        startLine: nonWS[i].line,
        startCol: nonWS[i].col,
        endLine: nonWS[i].endLine,
        endCol: nonWS[i].endCol,
        ruleId: 'if-missing-else',
      });
    }
  }

  return diagnostics;
};
