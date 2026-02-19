import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

export const calculateNoFilter = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = tokens.filter(
    (tk) => tk.type !== TokenType.Whitespace &&
           tk.type !== TokenType.LineComment &&
           tk.type !== TokenType.BlockComment &&
           tk.type !== TokenType.EOF,
  );

  for (let i = 0; i < nonWS.length; i++) {
    const token = nonWS[i];

    // Look for CALCULATE(
    if (token.type === TokenType.Function &&
        token.value.toUpperCase() === 'CALCULATE' &&
        i + 1 < nonWS.length &&
        nonWS[i + 1].type === TokenType.OpenParen) {
      // Track paren depth to find matching close paren
      let depth = 0;
      let hasComma = false;
      let j = i + 1; // the OpenParen

      for (; j < nonWS.length; j++) {
        if (nonWS[j].type === TokenType.OpenParen) {
          depth++;
        } else if (nonWS[j].type === TokenType.CloseParen) {
          depth--;
          if (depth === 0) break;
        } else if (nonWS[j].type === TokenType.Comma && depth === 1) {
          // Comma at the top level of this CALCULATE call means there's a filter arg
          hasComma = true;
          break;
        }
      }

      if (!hasComma) {
        diagnostics.push({
          severity: 'info',
          message: t('lint.calculate_no_filter'),
          startLine: token.line,
          startCol: token.col,
          endLine: token.endLine,
          endCol: token.endCol,
          ruleId: 'calculate-no-filter',
        });
      }
    }
  }

  return diagnostics;
};
