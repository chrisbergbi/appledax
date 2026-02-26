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

export const allRules: LintRule[] = [
  unbalancedParens,
  unbalancedQuotes,
  missingComma,
  varReturn,
  unusedVar,
  unknownFunction,
  wrongArgumentCount,
  deprecatedFunction,
  nestedIf,
  redundantIf,
  divideSuggestion,
  isblankPreference,
  calculateNoFilter,
  calculateNakedColumn,
  filterAllPattern,
  countrowsFilterPattern,
  unknownTable,
  unknownColumn,
  numericAggregation,
];
