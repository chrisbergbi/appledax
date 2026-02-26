/**
 * Rule: duplicate-var
 *
 * Detects two VAR declarations with the same name (case-insensitive).
 * The second silently shadows the first, which is almost always a bug.
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { filterNonWS } from './_utils';

export const duplicateVar = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = filterNonWS(tokens);

  // Collect all VAR declarations: name → first declaration token
  const seen = new Map<string, Token>();

  for (let i = 0; i < nonWS.length - 1; i++) {
    if (
      nonWS[i].type === TokenType.Keyword &&
      nonWS[i].value.toUpperCase() === 'VAR' &&
      nonWS[i + 1].type === TokenType.Identifier
    ) {
      const nameToken = nonWS[i + 1];
      const upper = nameToken.value.toUpperCase();

      if (seen.has(upper)) {
        diagnostics.push({
          severity: 'error',
          message: t('lint.duplicate_var', { name: nameToken.value }),
          startLine: nonWS[i].line,
          startCol: nonWS[i].col,
          endLine: nameToken.endLine,
          endCol: nameToken.endCol,
          ruleId: 'duplicate-var',
        });
      } else {
        seen.set(upper, nameToken);
      }
    }
  }

  return diagnostics;
};
