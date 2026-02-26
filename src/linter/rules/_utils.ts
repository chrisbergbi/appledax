import type { Token } from '../../types';
import { TokenType } from '../../types';

/**
 * Filter out whitespace, comments, and EOF tokens.
 * Most rules need only "meaningful" tokens.
 */
export function filterNonWS(tokens: Token[]): Token[] {
  return tokens.filter(
    (tk) =>
      tk.type !== TokenType.Whitespace &&
      tk.type !== TokenType.LineComment &&
      tk.type !== TokenType.BlockComment &&
      tk.type !== TokenType.EOF,
  );
}

/**
 * Parse function arguments starting from the OpenParen at `openParenIdx`.
 * Returns an array of token arrays (one per comma-separated argument),
 * or null if the closing paren is not found.
 *
 * Example: for `SUM( a + b, c )` with openParenIdx pointing to `(`,
 * returns [[a, +, b], [c]].
 */
export function parseFunctionArgs(
  nonWS: Token[],
  openParenIdx: number,
): Token[][] | null {
  if (nonWS[openParenIdx]?.type !== TokenType.OpenParen) return null;

  const args: Token[][] = [];
  let currentArg: Token[] = [];
  let depth = 1;

  for (let i = openParenIdx + 1; i < nonWS.length; i++) {
    const tk = nonWS[i];

    if (tk.type === TokenType.OpenParen) {
      depth++;
      currentArg.push(tk);
    } else if (tk.type === TokenType.CloseParen) {
      depth--;
      if (depth === 0) {
        // End of function call — push last arg if non-empty
        if (currentArg.length > 0) {
          args.push(currentArg);
        }
        return args;
      }
      currentArg.push(tk);
    } else if (tk.type === TokenType.Comma && depth === 1) {
      // Top-level comma — separates arguments
      args.push(currentArg);
      currentArg = [];
    } else {
      currentArg.push(tk);
    }
  }

  // If we get here, no matching close paren found
  return null;
}

/**
 * Check if tokens at index `idx` form a dot-function pattern: Identifier.Identifier(
 * e.g. STDEV.S( which tokenizes as Identifier("STDEV") Operator(".") Identifier("S") OpenParen
 *
 * Returns the reconstructed function name and span info, or null.
 */
export function tryParseDotFunction(
  nonWS: Token[],
  idx: number,
): { name: string; startToken: Token; endToken: Token; parenIdx: number } | null {
  if (
    idx + 3 < nonWS.length &&
    nonWS[idx].type === TokenType.Identifier &&
    nonWS[idx + 1].type === TokenType.Operator &&
    nonWS[idx + 1].value === '.' &&
    nonWS[idx + 2].type === TokenType.Identifier &&
    nonWS[idx + 3].type === TokenType.OpenParen
  ) {
    return {
      name: nonWS[idx].value + '.' + nonWS[idx + 2].value,
      startToken: nonWS[idx],
      endToken: nonWS[idx + 2],
      parenIdx: idx + 3,
    };
  }
  return null;
}

/**
 * Collect all VAR-declared identifier names from the token stream.
 * Used to exclude VAR names from unknown-function detection.
 */
export function collectVarNames(nonWS: Token[]): Set<string> {
  const names = new Set<string>();
  for (let i = 0; i < nonWS.length - 1; i++) {
    if (
      nonWS[i].type === TokenType.Keyword &&
      nonWS[i].value.toUpperCase() === 'VAR' &&
      nonWS[i + 1].type === TokenType.Identifier
    ) {
      names.add(nonWS[i + 1].value.toUpperCase());
    }
  }
  return names;
}
