/**
 * Rule: calculate-nested-calculate-filter
 *
 * In CALCULATE/CALCULATETABLE boolean filter arguments, nested CALCULATE/
 * CALCULATETABLE calls are not valid. Those filters should be rewritten.
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import type { SemanticFunctionCall } from '../semantic';
import { buildSemanticModel } from '../semantic';

const TABLE_FILTER_STARTERS = new Set([
  'FILTER',
  'KEEPFILTERS',
  'ALL',
  'ALLEXCEPT',
  'ALLNOBLANKROW',
  'ALLSELECTED',
  'REMOVEFILTERS',
  'VALUES',
  'DISTINCT',
  'SUMMARIZE',
  'SUMMARIZECOLUMNS',
  'TREATAS',
]);

export const calculateNestedCalculateFilter = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const semantic = buildSemanticModel(tokens);

  const parents = [
    ...(semantic.functionCallsByName.get('CALCULATE') ?? []),
    ...(semantic.functionCallsByName.get('CALCULATETABLE') ?? []),
  ];

  for (const parent of parents) {
    if (parent.args.length < 2) continue;

    for (let argIdx = 1; argIdx < parent.args.length; argIdx++) {
      const arg = parent.args[argIdx];
      if (arg.tokens.length === 0) continue;

      const first = arg.tokens[0];
      if (
        first.type === TokenType.Function &&
        TABLE_FILTER_STARTERS.has(first.value.toUpperCase())
      ) {
        continue;
      }

      if (hasNestedCalculateInArg(semantic.functionCalls, arg.startIdx, arg.endIdx)) {
        diagnostics.push({
          severity: 'error',
          message: t('lint.calculate_filter_nested_calculate'),
          startLine: arg.tokens[0].line,
          startCol: arg.tokens[0].col,
          endLine: arg.tokens[arg.tokens.length - 1].endLine,
          endCol: arg.tokens[arg.tokens.length - 1].endCol,
          ruleId: 'calculate-nested-calculate-filter',
        });
      }
    }
  }

  return diagnostics;
};

function hasNestedCalculateInArg(
  calls: SemanticFunctionCall[],
  startIdx: number,
  endIdx: number,
): boolean {
  for (const call of calls) {
    if (call.openParenIdx < startIdx || call.closeParenIdx > endIdx) continue;
    const name = call.name.toUpperCase();
    if (name === 'CALCULATE' || name === 'CALCULATETABLE') return true;
  }
  return false;
}
