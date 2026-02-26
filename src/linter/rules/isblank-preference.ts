/**
 * Rule: isblank-preference
 *
 * Detects the pattern `= BLANK()` or `BLANK() =` and suggests using
 * ISBLANK() instead for clarity.
 *
 * Skips `<> BLANK()` since that has different semantics (not blank check).
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { filterNonWS } from './_utils';

/**
 * Check if tokens at idx form `BLANK()` — Function("BLANK") + OpenParen + CloseParen
 */
function isBlankCall(nonWS: Token[], idx: number): boolean {
  return (
    idx + 2 < nonWS.length &&
    nonWS[idx].type === TokenType.Function &&
    nonWS[idx].value.toUpperCase() === 'BLANK' &&
    nonWS[idx + 1].type === TokenType.OpenParen &&
    nonWS[idx + 2].type === TokenType.CloseParen
  );
}

export const isblankPreference = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = filterNonWS(tokens);

  for (let i = 0; i < nonWS.length; i++) {
    // Pattern 1: <something> = BLANK()
    if (
      nonWS[i].type === TokenType.Operator &&
      nonWS[i].value === '=' &&
      isBlankCall(nonWS, i + 1)
    ) {
      // Make sure it's not <> (which would be a multi-char operator already)
      // The lexer already handles <> as a single Operator("<>"), so `=` here is standalone
      diagnostics.push({
        severity: 'info',
        message: t('lint.isblank_preference'),
        startLine: nonWS[i].line,
        startCol: nonWS[i].col,
        endLine: nonWS[i + 3].endLine,
        endCol: nonWS[i + 3].endCol,
        ruleId: 'isblank-preference',
      });
      i += 3; // skip past = BLANK ( )
      continue;
    }

    // Pattern 2: BLANK() = <something>
    if (
      isBlankCall(nonWS, i) &&
      i + 3 < nonWS.length &&
      nonWS[i + 3].type === TokenType.Operator &&
      nonWS[i + 3].value === '='
    ) {
      diagnostics.push({
        severity: 'info',
        message: t('lint.isblank_preference'),
        startLine: nonWS[i].line,
        startCol: nonWS[i].col,
        endLine: nonWS[i + 3].endLine,
        endCol: nonWS[i + 3].endCol,
        ruleId: 'isblank-preference',
      });
      i += 3; // skip past BLANK ( ) =
      continue;
    }
  }

  return diagnostics;
};
