import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

export const unusedVar = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = tokens.filter(
    (tk) => tk.type !== TokenType.Whitespace &&
           tk.type !== TokenType.LineComment &&
           tk.type !== TokenType.BlockComment &&
           tk.type !== TokenType.EOF,
  );

  // Collect all VAR declarations and their names
  interface VarDecl {
    name: string;
    nameToken: Token;
    varToken: Token;
  }

  const vars: VarDecl[] = [];

  for (let i = 0; i < nonWS.length; i++) {
    if (nonWS[i].type === TokenType.Keyword && nonWS[i].value.toUpperCase() === 'VAR') {
      // The next token should be the variable name (identifier)
      if (i + 1 < nonWS.length && nonWS[i + 1].type === TokenType.Identifier) {
        vars.push({
          name: nonWS[i + 1].value,
          nameToken: nonWS[i + 1],
          varToken: nonWS[i],
        });
      }
    }
  }

  // For each VAR, check if the name appears later as an identifier
  for (const v of vars) {
    let used = false;
    const nameUpper = v.name.toUpperCase();

    // Look at all identifiers after the declaration
    let pastDecl = false;
    for (const token of nonWS) {
      if (token === v.nameToken) {
        pastDecl = true;
        continue;
      }
      if (pastDecl && token.type === TokenType.Identifier && token.value.toUpperCase() === nameUpper) {
        used = true;
        break;
      }
    }

    if (!used) {
      // Build a quick fix to remove the entire VAR declaration line(s)
      const removeLine = v.varToken.line;
      // Find the end of the assignment: scan forward from nameToken to find the next
      // VAR or RETURN keyword, or end of tokens
      let removeEndLine = v.nameToken.endLine + 1;
      let pastName = false;
      let depth = 0;
      for (const token of nonWS) {
        if (token === v.nameToken) { pastName = true; continue; }
        if (!pastName) continue;
        // Track paren depth so we don't stop inside a nested expression
        if (token.type === TokenType.OpenParen) { depth++; continue; }
        if (token.type === TokenType.CloseParen) { depth--; continue; }
        if (depth > 0) continue;
        // Stop at the next VAR or RETURN keyword (that's the next declaration)
        if (token.type === TokenType.Keyword &&
            (token.value.toUpperCase() === 'VAR' || token.value.toUpperCase() === 'RETURN')) {
          removeEndLine = token.line;
          break;
        }
      }

      diagnostics.push({
        severity: 'warning',
        message: t('lint.unused_var', { name: v.name }),
        startLine: v.varToken.line,
        startCol: v.varToken.col,
        endLine: v.nameToken.endLine,
        endCol: v.nameToken.endCol,
        ruleId: 'unused-var',
        quickFix: {
          title: t('qf.remove_unused_var'),
          edits: [{
            range: { startLine: removeLine, startCol: 1, endLine: removeEndLine, endCol: 1 },
            text: '',
          }],
        },
      });
    }
  }

  return diagnostics;
};
