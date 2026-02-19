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

export const allRules: LintRule[] = [
  unbalancedParens,
  unbalancedQuotes,
  missingComma,
  varReturn,
  unusedVar,
  nestedIf,
  divideSuggestion,
  calculateNoFilter,
  calculateNakedColumn,
  filterAllPattern,
  unknownTable,
  unknownColumn,
];
