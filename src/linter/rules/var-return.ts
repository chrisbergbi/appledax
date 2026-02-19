import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

export const varReturn = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = tokens.filter(
    (tk) => tk.type !== TokenType.Whitespace &&
           tk.type !== TokenType.LineComment &&
           tk.type !== TokenType.BlockComment &&
           tk.type !== TokenType.EOF,
  );

  // Track VAR and RETURN occurrences
  const varPositions: Token[] = [];
  let hasReturn = false;
  let hasVar = false;
  const returnPositions: Token[] = [];

  for (const token of nonWS) {
    if (token.type === TokenType.Keyword) {
      const kw = token.value.toUpperCase();
      if (kw === 'VAR') {
        hasVar = true;
        varPositions.push(token);
      } else if (kw === 'RETURN') {
        hasReturn = true;
        returnPositions.push(token);
      }
    }
  }

  // VAR without RETURN
  if (hasVar && !hasReturn) {
    // Report on the first VAR
    const firstVar = varPositions[0];
    diagnostics.push({
      severity: 'error',
      message: t('lint.var_without_return'),
      startLine: firstVar.line,
      startCol: firstVar.col,
      endLine: firstVar.endLine,
      endCol: firstVar.endCol,
      ruleId: 'var-without-return',
    });
  }

  // RETURN without VAR (warning, as RETURN can sometimes be valid context)
  if (hasReturn && !hasVar) {
    for (const ret of returnPositions) {
      diagnostics.push({
        severity: 'warning',
        message: t('lint.return_without_var'),
        startLine: ret.line,
        startCol: ret.col,
        endLine: ret.endLine,
        endCol: ret.endCol,
        ruleId: 'return-without-var',
      });
    }
  }

  return diagnostics;
};
