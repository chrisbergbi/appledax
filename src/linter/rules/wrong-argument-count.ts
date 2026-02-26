/**
 * Rule: wrong-argument-count
 *
 * Validates that DAX function calls have the correct number of arguments.
 * Uses functions.json params data to determine min/max argument counts.
 *
 * Variadic functions (CALCULATE, SWITCH, etc.) accept unlimited optional args.
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { filterNonWS, parseFunctionArgs, tryParseDotFunction } from './_utils';
import { getFunctionByName } from '../../knowledge/lookup';

/** Functions that accept a variable number of arguments beyond their documented params */
const VARIADIC_FUNCTIONS = new Set([
  'CALCULATE', 'CALCULATETABLE',
  'SWITCH',
  'ADDCOLUMNS', 'SELECTCOLUMNS',
  'SUMMARIZE', 'SUMMARIZECOLUMNS',
  'CONTAINS', 'CONTAINSROW',
  'COALESCE',
  'UNION', 'INTERSECT', 'EXCEPT',
  'ROW',
  'LOOKUPVALUE',
  'DATATABLE',
  'GENERATESERIES',
  'TREATAS',
  'CONCATENATEX',
  'TOPN',
  'XIRR', 'XNPV',
  'SAMPLE',
  'SUBSTITUTEWITHINDEX',
  'PATH',
  'ALL', 'ALLEXCEPT',
  'COMBINEVALUES',
  'ORDERBY', 'PARTITIONBY', 'MATCHBY',
  'WINDOW', 'INDEX', 'OFFSET', 'RANK', 'ROWNUMBER',
  'ROLLUP', 'ROLLUPADDISSUBTOTAL', 'ROLLUPISSUBTOTAL', 'ROLLUPGROUP',
  'ADDMISSINGITEMS',
  'ISSELECTEDMEASURE',
  'ISAFTER', 'ISONORAFTER',
  'ACCRINT',
  'GCD', 'LCM',
]);

export const wrongArgumentCount = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = filterNonWS(tokens);

  for (let i = 0; i < nonWS.length; i++) {
    let funcName: string | null = null;
    let funcStartToken: Token | null = null;
    let funcEndToken: Token | null = null;
    let parenIdx: number | null = null;

    // Check dot-function pattern: ID.ID(
    const dotFn = tryParseDotFunction(nonWS, i);
    if (dotFn) {
      funcName = dotFn.name;
      funcStartToken = dotFn.startToken;
      funcEndToken = dotFn.endToken;
      parenIdx = dotFn.parenIdx;
    }
    // Check normal function: Function(
    else if (
      nonWS[i].type === TokenType.Function &&
      i + 1 < nonWS.length &&
      nonWS[i + 1].type === TokenType.OpenParen
    ) {
      funcName = nonWS[i].value;
      funcStartToken = nonWS[i];
      funcEndToken = nonWS[i];
      parenIdx = i + 1;
    }

    if (!funcName || !funcStartToken || !funcEndToken || parenIdx === null) continue;

    // Look up function definition
    const funcDef = getFunctionByName(funcName);
    if (!funcDef) {
      // Unknown function — handled by unknown-function rule
      if (dotFn) i += 3;
      continue;
    }

    // Parse arguments
    const args = parseFunctionArgs(nonWS, parenIdx);
    if (args === null) {
      // Couldn't find closing paren — skip
      if (dotFn) i += 3;
      continue;
    }

    const argCount = args.length;

    // Determine required minimum and maximum
    const requiredMin = funcDef.params.filter((p) => p.required !== false).length;
    const isVariadic = VARIADIC_FUNCTIONS.has(funcName.toUpperCase());
    const maxArgs = isVariadic ? Infinity : funcDef.params.length;

    // Check for too few arguments
    if (argCount < requiredMin) {
      diagnostics.push({
        severity: 'error',
        message: t('lint.too_few_args', {
          name: funcName.toUpperCase(),
          min: String(requiredMin),
          count: String(argCount),
        }),
        startLine: funcStartToken.line,
        startCol: funcStartToken.col,
        endLine: funcEndToken.endLine,
        endCol: funcEndToken.endCol,
        ruleId: 'wrong-argument-count',
      });
    }

    // Check for too many arguments
    if (argCount > maxArgs) {
      diagnostics.push({
        severity: 'error',
        message: t('lint.too_many_args', {
          name: funcName.toUpperCase(),
          max: String(maxArgs),
          count: String(argCount),
        }),
        startLine: funcStartToken.line,
        startCol: funcStartToken.col,
        endLine: funcEndToken.endLine,
        endCol: funcEndToken.endCol,
        ruleId: 'wrong-argument-count',
      });
    }

    // Skip past dot-function tokens
    if (dotFn) i += 3;
  }

  return diagnostics;
};
