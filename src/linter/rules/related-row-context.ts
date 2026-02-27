/**
 * Rule: related-row-context
 *
 * RELATED() requires row context. In measure expressions, row context usually
 * comes from iterators such as SUMX/FILTER.
 *
 * This rule warns when RELATED() appears without an enclosing iterator.
 */

import type { Token, LintDiagnostic } from '../../types';
import { t } from '../../i18n/index';
import { buildSemanticModel, findEnclosingCall, isIteratorFunction } from '../semantic';

export const relatedRowContext = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const semantic = buildSemanticModel(tokens);
  const relatedCalls = semantic.functionCallsByName.get('RELATED') ?? [];

  for (const call of relatedCalls) {
    const enclosingIterator = findEnclosingCall(
      semantic,
      call.openParenIdx,
      (candidate) => isIteratorFunction(candidate.name),
    );

    if (!enclosingIterator) {
      diagnostics.push({
        severity: 'warning',
        message: t('lint.related_without_row_context'),
        startLine: call.nameStartToken.line,
        startCol: call.nameStartToken.col,
        endLine: call.closeParenToken.endLine,
        endCol: call.closeParenToken.endCol,
        ruleId: 'related-row-context',
      });
    }
  }

  return diagnostics;
};
