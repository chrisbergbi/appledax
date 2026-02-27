/**
 * Rule: selectedvalue-missing-default
 *
 * SELECTEDVALUE(<column>) without an alternate result can produce BLANK when
 * there is no single value. Encourage explicit fallback for robustness.
 */

import type { Token, LintDiagnostic } from '../../types';
import { t } from '../../i18n/index';
import { buildSemanticModel } from '../semantic';

export const selectedvalueMissingDefault = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const semantic = buildSemanticModel(tokens);
  const selectedValueCalls = semantic.functionCallsByName.get('SELECTEDVALUE') ?? [];

  for (const call of selectedValueCalls) {
    if (call.args.length === 1) {
      diagnostics.push({
        severity: 'info',
        message: t('lint.selectedvalue_missing_default'),
        startLine: call.nameStartToken.line,
        startCol: call.nameStartToken.col,
        endLine: call.closeParenToken.endLine,
        endCol: call.closeParenToken.endCol,
        ruleId: 'selectedvalue-missing-default',
      });
    }
  }

  return diagnostics;
};
