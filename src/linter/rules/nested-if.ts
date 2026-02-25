import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';

const MAX_NESTING = 2;

export const nestedIf = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = tokens.filter(
    (tk) => tk.type !== TokenType.Whitespace &&
           tk.type !== TokenType.LineComment &&
           tk.type !== TokenType.BlockComment &&
           tk.type !== TokenType.EOF,
  );

  // Track call stack: each entry is the function name and its paren depth
  interface CallFrame {
    name: string;
    token: Token;
    depth: number;
  }

  const callStack: CallFrame[] = [];
  let parenDepth = 0;
  const reported = new Set<number>(); // line numbers already reported

  for (let i = 0; i < nonWS.length; i++) {
    const token = nonWS[i];

    if (token.type === TokenType.OpenParen) {
      parenDepth++;
      // Check if this paren follows a function call
      if (i > 0 && nonWS[i - 1].type === TokenType.Function) {
        callStack.push({
          name: nonWS[i - 1].value.toUpperCase(),
          token: nonWS[i - 1],
          depth: parenDepth,
        });
      }
      continue;
    }

    if (token.type === TokenType.CloseParen) {
      // Pop any call frames at this depth
      while (callStack.length > 0 && callStack[callStack.length - 1].depth === parenDepth) {
        callStack.pop();
      }
      parenDepth--;
      continue;
    }
  }

  // Simpler approach: count nested IF( patterns directly
  // Find all IF function tokens and check nesting by tracking the paren scope
  const ifTokens: Array<{ token: Token; parenLevel: number }> = [];
  parenDepth = 0;
  const parenToIf = new Map<number, Token>(); // parenDepth -> IF token that opened it

  for (let i = 0; i < nonWS.length; i++) {
    const token = nonWS[i];

    if (token.type === TokenType.OpenParen) {
      parenDepth++;
      if (i > 0 && nonWS[i - 1].type === TokenType.Function &&
          nonWS[i - 1].value.toUpperCase() === 'IF') {
        ifTokens.push({ token: nonWS[i - 1], parenLevel: parenDepth });
        parenToIf.set(parenDepth, nonWS[i - 1]);
      }
    } else if (token.type === TokenType.CloseParen) {
      parenToIf.delete(parenDepth);
      parenDepth--;
    }
  }

  // Check for IF tokens that are nested inside other IF calls
  // Count how many active IF scopes each IF is inside
  parenDepth = 0;
  let ifNestingLevel = 0;

  for (let i = 0; i < nonWS.length; i++) {
    const token = nonWS[i];

    if (token.type === TokenType.OpenParen) {
      parenDepth++;
      if (i > 0 && nonWS[i - 1].type === TokenType.Function &&
          nonWS[i - 1].value.toUpperCase() === 'IF') {
        ifNestingLevel++;
        if (ifNestingLevel > MAX_NESTING && !reported.has(nonWS[i - 1].line)) {
          reported.add(nonWS[i - 1].line);
          diagnostics.push({
            severity: 'info',
            message: t('lint.nested_if', { depth: ifNestingLevel, max: MAX_NESTING }),
            startLine: nonWS[i - 1].line,
            startCol: nonWS[i - 1].col,
            endLine: nonWS[i - 1].endLine,
            endCol: nonWS[i - 1].endCol,
            ruleId: 'nested-if',
          });
        }
      }
    } else if (token.type === TokenType.CloseParen) {
      // Check if we're closing an IF scope
      // We need to track which open parens belong to IFs
      parenDepth--;
    }
  }

  // Better approach: use a stack to track IF scopes
  diagnostics.length = 0;
  reported.clear();

  interface ScopeFrame {
    isIf: boolean;
    parenDepth: number;
  }
  const scopeStack: ScopeFrame[] = [];
  parenDepth = 0;

  for (let i = 0; i < nonWS.length; i++) {
    const token = nonWS[i];

    if (token.type === TokenType.OpenParen) {
      parenDepth++;
      const isIfCall = i > 0 && nonWS[i - 1].type === TokenType.Function &&
                       nonWS[i - 1].value.toUpperCase() === 'IF';
      scopeStack.push({ isIf: isIfCall, parenDepth });

      if (isIfCall) {
        const currentIfDepth = scopeStack.filter((s) => s.isIf).length;
        if (currentIfDepth > MAX_NESTING && !reported.has(nonWS[i - 1].line)) {
          reported.add(nonWS[i - 1].line);
          const ifToken = nonWS[i - 1];
          diagnostics.push({
            severity: 'info',
            message: t('lint.nested_if', { depth: currentIfDepth, max: MAX_NESTING }),
            startLine: ifToken.line,
            startCol: ifToken.col,
            endLine: ifToken.endLine,
            endCol: ifToken.endCol,
            ruleId: 'nested-if',
            quickFix: {
              title: t('qf.switch_template'),
              edits: [{
                range: { startLine: ifToken.line + 1, startCol: 1, endLine: ifToken.line + 1, endCol: 1 },
                text: '// Consider: SWITCH(TRUE(), <cond1>, <result1>, <cond2>, <result2>, <default>)\n',
              }],
            },
          });
        }
      }
    } else if (token.type === TokenType.CloseParen) {
      // Pop the matching scope
      while (scopeStack.length > 0 && scopeStack[scopeStack.length - 1].parenDepth === parenDepth) {
        scopeStack.pop();
      }
      parenDepth--;
    }
  }

  return diagnostics;
};
