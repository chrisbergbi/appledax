/**
 * Rule: relatedtable-row-context
 *
 * RELATEDTABLE() requires row context. In measures, row context usually
 * comes from iterator functions like SUMX/FILTER.
 */

import type { Token, LintDiagnostic } from '../../types';
import { t } from '../../i18n/index';
import { buildSemanticModel, findEnclosingCall, isIteratorFunction } from '../semantic';

export const relatedtableRowContext = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const semantic = buildSemanticModel(tokens);
  const relatedTableCalls = semantic.functionCallsByName.get('RELATEDTABLE') ?? [];

  for (const call of relatedTableCalls) {
    const enclosingIterator = findEnclosingCall(
      semantic,
      call.openParenIdx,
      (candidate) => isIteratorFunction(candidate.name),
    );

    if (!enclosingIterator) {
      diagnostics.push({
        severity: 'warning',
        message: t('lint.relatedtable_without_row_context'),
        startLine: call.nameStartToken.line,
        startCol: call.nameStartToken.col,
        endLine: call.closeParenToken.endLine,
        endCol: call.closeParenToken.endCol,
        ruleId: 'relatedtable-row-context',
      });
    }
  }

  return diagnostics;
};
