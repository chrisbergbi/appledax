/**
 * Rule: divide-missing-alternate
 *
 * Authoring hint: DIVIDE(numerator, denominator) without third argument may
 * surface BLANKs where an explicit fallback is preferred.
 */

import type { Token, LintDiagnostic } from '../../types';
import { t } from '../../i18n/index';
import { buildSemanticModel } from '../semantic';

export const divideMissingAlternate = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const semantic = buildSemanticModel(tokens);
  const divideCalls = semantic.functionCallsByName.get('DIVIDE') ?? [];

  for (const call of divideCalls) {
    if (call.args.length === 2) {
      diagnostics.push({
        severity: 'info',
        message: t('lint.divide_missing_alternate'),
        startLine: call.nameStartToken.line,
        startCol: call.nameStartToken.col,
        endLine: call.closeParenToken.endLine,
        endCol: call.closeParenToken.endCol,
        ruleId: 'divide-missing-alternate',
      });
    }
  }

  return diagnostics;
};
