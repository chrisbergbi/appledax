/**
 * Rule: calculate-naked-column
 *
 * Detects CALCULATE( 'Table'[Column], ... ) or CALCULATE( [Column], ... )
 * where the first argument is a bare (non-aggregated) column reference.
 *
 * The first argument of CALCULATE must be an expression that evaluates to a
 * scalar value — typically an aggregation like SUM(), AVERAGE(), COUNT(), etc.
 * A raw column reference is almost never correct and usually indicates a
 * missing aggregation wrapper.
 *
 * Valid:    CALCULATE( SUM('Sales'[Amount]), ... )
 * Invalid:  CALCULATE( 'Contract'[Contract_BK], ALL('Person') )
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

export const calculateNakedColumn = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = tokens.filter(
    (tk) =>
      tk.type !== TokenType.Whitespace &&
      tk.type !== TokenType.LineComment &&
      tk.type !== TokenType.BlockComment &&
      tk.type !== TokenType.EOF,
  );

  for (let i = 0; i < nonWS.length; i++) {
    const tok = nonWS[i];

    // Look for CALCULATE(
    if (
      tok.type !== TokenType.Function ||
      tok.value.toUpperCase() !== 'CALCULATE' ||
      i + 1 >= nonWS.length ||
      nonWS[i + 1].type !== TokenType.OpenParen
    ) {
      continue;
    }

    // i+1 is the OpenParen — first argument starts at i+2
    const argStart = i + 2;
    if (argStart >= nonWS.length) continue;

    // Scan the first argument: collect tokens until we hit the first
    // top-level comma (depth=1) or the matching close-paren (depth→0).
    let depth = 1; // we are inside the ( already
    let j = argStart;

    // Collect indices belonging to the first argument
    const firstArgTokens: Token[] = [];
    for (; j < nonWS.length; j++) {
      if (nonWS[j].type === TokenType.OpenParen) {
        depth++;
      } else if (nonWS[j].type === TokenType.CloseParen) {
        depth--;
        if (depth === 0) break; // end of CALCULATE(...)
      } else if (nonWS[j].type === TokenType.Comma && depth === 1) {
        break; // end of first argument
      }
      firstArgTokens.push(nonWS[j]);
    }

    if (firstArgTokens.length === 0) continue;

    // Check whether the first argument is a "naked column reference":
    //
    // Pattern 1:  'TableName'[ColumnName]        → 2 tokens: TableRef + ColumnRef
    // Pattern 2:  [ColumnName]                   → 1 token:  ColumnRef
    //
    // We also need to make sure there is NO function call wrapping it.
    // If the first token is a Function (like SUM, AVERAGE, etc.) then it's
    // aggregated and fine.

    const isNakedColumn = isNakedColumnRef(firstArgTokens);

    if (isNakedColumn) {
      // Highlight from the first token of the argument to the last
      const firstTok = firstArgTokens[0];
      const lastTok = firstArgTokens[firstArgTokens.length - 1];
      const originalText = firstArgTokens.map((tk) => tk.value).join('');

      diagnostics.push({
        severity: 'warning',
        message: t('lint.calculate_naked_column'),
        startLine: firstTok.line,
        startCol: firstTok.col,
        endLine: lastTok.endLine,
        endCol: lastTok.endCol,
        ruleId: 'calculate-naked-column',
        quickFix: {
          title: t('qf.wrap_sum'),
          edits: [{
            range: {
              startLine: firstTok.line,
              startCol: firstTok.col,
              endLine: lastTok.endLine,
              endCol: lastTok.endCol,
            },
            text: `SUM(${originalText})`,
          }],
        },
      });
    }
  }

  return diagnostics;
};

/**
 * Determines if a set of tokens represents a naked (non-aggregated) column reference.
 *
 * Matches:
 *   [Column]                  — just a ColumnRef
 *   'Table'[Column]           — TableRef + ColumnRef
 *
 * Does NOT match:
 *   SUM('Table'[Column])      — starts with a Function
 *   [Column] + [Column2]      — has operators (so it's an expression)
 *   IF(...)                    — function call
 */
function isNakedColumnRef(argTokens: Token[]): boolean {
  // Pattern 2: single [Column]
  if (argTokens.length === 1 && argTokens[0].type === TokenType.ColumnRef) {
    return true;
  }

  // Pattern 1: 'Table'[Column]
  if (
    argTokens.length === 2 &&
    argTokens[0].type === TokenType.TableRef &&
    argTokens[1].type === TokenType.ColumnRef
  ) {
    return true;
  }

  return false;
}
