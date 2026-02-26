import type { LintRule } from '../../types';
import { unbalancedParens } from './unbalanced-parens';
import { unbalancedQuotes } from './unbalanced-quotes';
import { missingComma } from './missing-comma';
import { varReturn } from './var-return';
import { unusedVar } from './unused-var';
import { nestedIf } from './nested-if';
import { divideSuggestion } from './divide-suggestion';
import { calculateNoFilter } from './calculate-no-filter';
import { filterAllPattern } from './filter-all-pattern';
import { unknownTable } from './unknown-table';
import { unknownColumn } from './unknown-column';
import { calculateNakedColumn } from './calculate-naked-column';
import { numericAggregation } from './numeric-aggregation';
import { unknownFunction } from './unknown-function';
import { wrongArgumentCount } from './wrong-argument-count';
import { deprecatedFunction } from './deprecated-function';
import { redundantIf } from './redundant-if';
import { isblankPreference } from './isblank-preference';
import { countrowsFilterPattern } from './countrows-filter-pattern';
import { ifMissingElse } from './if-missing-else';
import { duplicateVar } from './duplicate-var';
import { iferrorWarning } from './iferror-warning';
import { allVsRemovefilters } from './all-vs-removefilters';
import { functionCasing } from './function-casing';
import { selectedvalueSuggestion } from './selectedvalue-suggestion';
import { relatedValidation } from './related-validation';

export const allRules: LintRule[] = [
  unbalancedParens,
  unbalancedQuotes,
  missingComma,
  varReturn,
  unusedVar,
  duplicateVar,
  unknownFunction,
  wrongArgumentCount,
  deprecatedFunction,
  ifMissingElse,
  nestedIf,
  redundantIf,
  divideSuggestion,
  isblankPreference,
  iferrorWarning,
  calculateNoFilter,
  calculateNakedColumn,
  filterAllPattern,
  countrowsFilterPattern,
  allVsRemovefilters,
  selectedvalueSuggestion,
  functionCasing,
  relatedValidation,
  unknownTable,
  unknownColumn,
  numericAggregation,
];
