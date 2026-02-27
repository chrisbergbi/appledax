/**
 * Rule: calculate-multi-table-filter
 *
 * In CALCULATE/CALCULATETABLE boolean filter arguments, columns from multiple
 * tables are not allowed in a single predicate argument.
 *
 * Example invalid pattern:
 *   CALCULATE([Sales], 'Date'[Year] = 2024 && 'Product'[Color] = "Red")
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { buildSemanticModel } from '../semantic';

const SKIP_TABLE_EXPRESSION_STARTERS = new Set([
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

export const calculateMultiTableFilter = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const semantic = buildSemanticModel(tokens);

  const targets = [
    ...(semantic.functionCallsByName.get('CALCULATE') ?? []),
    ...(semantic.functionCallsByName.get('CALCULATETABLE') ?? []),
  ];

  for (const call of targets) {
    if (call.args.length < 2) continue;

    for (let argIdx = 1; argIdx < call.args.length; argIdx++) {
      const arg = call.args[argIdx];
      if (arg.tokens.length === 0) continue;

      const first = arg.tokens[0];
      if (
        first.type === TokenType.Function &&
        SKIP_TABLE_EXPRESSION_STARTERS.has(first.value.toUpperCase())
      ) {
        continue;
      }

      const tableNames = collectQualifiedTables(arg.tokens);
      if (tableNames.size > 1) {
        diagnostics.push({
          severity: 'error',
          message: t('lint.calculate_filter_multi_table'),
          startLine: arg.tokens[0].line,
          startCol: arg.tokens[0].col,
          endLine: arg.tokens[arg.tokens.length - 1].endLine,
          endCol: arg.tokens[arg.tokens.length - 1].endCol,
          ruleId: 'calculate-multi-table-filter',
        });
      }
    }
  }

  return diagnostics;
};

function collectQualifiedTables(argTokens: Token[]): Set<string> {
  const tables = new Set<string>();
  for (let i = 0; i < argTokens.length - 1; i++) {
    const left = argTokens[i];
    const right = argTokens[i + 1];
    if (left.type === TokenType.TableRef && right.type === TokenType.ColumnRef) {
      tables.add(extractTableName(left.value).toUpperCase());
    }
  }
  return tables;
}

function extractTableName(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}
