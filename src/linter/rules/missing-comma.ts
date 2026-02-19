import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

const VALUE_TYPES = new Set([
  TokenType.Number,
  TokenType.String,
  TokenType.Identifier,
  TokenType.ColumnRef,
  TokenType.TableRef,
  TokenType.Function,
  TokenType.Keyword,
]);

const EXPRESSION_END_TYPES = new Set([
  TokenType.Number,
  TokenType.String,
  TokenType.Identifier,
  TokenType.ColumnRef,
  TokenType.TableRef,
  TokenType.CloseParen,
]);

export const missingComma = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = tokens.filter(
    (tk) => tk.type !== TokenType.Whitespace &&
           tk.type !== TokenType.LineComment &&
           tk.type !== TokenType.BlockComment &&
           tk.type !== TokenType.EOF,
  );

  // Track paren depth to only check inside function calls
  let parenDepth = 0;
  const inFunction: boolean[] = [false];

  for (let i = 0; i < nonWS.length; i++) {
    const token = nonWS[i];

    if (token.type === TokenType.OpenParen) {
      // Check if previous non-WS token is a function name
      const prev = i > 0 ? nonWS[i - 1] : null;
      parenDepth++;
      inFunction.push(prev?.type === TokenType.Function);
      continue;
    }

    if (token.type === TokenType.CloseParen) {
      parenDepth--;
      inFunction.pop();
      continue;
    }

    // Only check inside function calls
    if (parenDepth <= 0 || !inFunction[inFunction.length - 1]) continue;

    // Look for: expression-ending token followed by value-starting token
    // without a comma or operator in between
    if (i > 0 && EXPRESSION_END_TYPES.has(nonWS[i - 1].type) && VALUE_TYPES.has(token.type)) {
      const prev = nonWS[i - 1];

      // Exclude certain valid patterns:

      // - 'TableName'[ColumnName] — fully qualified column reference
      if (prev.type === TokenType.TableRef && token.type === TokenType.ColumnRef) {
        continue;
      }

      // - Identifier[ColumnName] — unquoted table with column (e.g. Sales[Amount])
      if (prev.type === TokenType.Identifier && token.type === TokenType.ColumnRef) {
        continue;
      }

      // - CloseParen followed by ColumnRef — e.g. RELATED('Table')[Column] or chained refs
      if (prev.type === TokenType.CloseParen && token.type === TokenType.ColumnRef) {
        continue;
      }

      // - After CloseParen followed by operator-like keywords (AND, OR, NOT, IN)
      const kw = token.value.toUpperCase();
      if (token.type === TokenType.Keyword && ['AND', 'OR', 'NOT', 'IN', 'TRUE', 'FALSE', 'VAR', 'RETURN'].includes(kw)) {
        continue;
      }
      // - Identifier followed by function (e.g., table names before function calls are common in DAX)
      if (token.type === TokenType.Function) {
        continue;
      }

      diagnostics.push({
        severity: 'error',
        message: t('lint.missing_comma'),
        startLine: prev.endLine,
        startCol: prev.endCol,
        endLine: token.line,
        endCol: token.col + 1,
        ruleId: 'missing-comma',
      });
    }
  }

  return diagnostics;
};
