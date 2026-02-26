/**
 * Rule: related-validation
 *
 * Validates RELATED() and RELATEDTABLE() usage:
 * 1. RELATED() must receive a column reference ('Table'[Column]), not just a table ref
 * 2. RELATEDTABLE() must receive a table reference, not a column ref
 * 3. When a model is loaded, verifies that a relationship exists between the
 *    iterator context table and the referenced table
 */

import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import { filterNonWS, parseFunctionArgs } from './_utils';
import * as store from '../../model/store';

/** Iterator functions that establish a row context over their first (table) argument. */
const ITERATOR_FUNCTIONS = new Set([
  'SUMX', 'AVERAGEX', 'MINX', 'MAXX', 'COUNTAX', 'COUNTX',
  'RANKX', 'PRODUCTX', 'CONCATENATEX',
  'FILTER', 'ADDCOLUMNS', 'SELECTCOLUMNS',
  'GENERATE', 'GENERATEALL',
]);

/** Extract a bare table name from a TableRef token value (strip surrounding quotes). */
function extractTableName(value: string): string {
  let name = value;
  if (name.startsWith("'") && name.endsWith("'")) {
    name = name.slice(1, -1).replace(/''/g, "'");
  }
  return name;
}

/**
 * Find the closing paren token for a function call starting at `funcIdx`.
 * Assumes nonWS[funcIdx+1] is OpenParen.
 */
function findClosingParen(nonWS: Token[], funcIdx: number): Token {
  let depth = 1;
  for (let j = funcIdx + 2; j < nonWS.length; j++) {
    if (nonWS[j].type === TokenType.OpenParen) depth++;
    if (nonWS[j].type === TokenType.CloseParen) {
      depth--;
      if (depth === 0) return nonWS[j];
    }
  }
  return nonWS[nonWS.length - 1];
}

/**
 * Scan backwards from `relatedIdx` to find the nearest enclosing iterator
 * function call and extract its first (table) argument name.
 *
 * Handles nesting: skips over balanced paren groups that don't belong
 * to the enclosing scope.
 */
function findIteratorContext(
  nonWS: Token[],
  relatedIdx: number,
): string | null {
  let depth = 0;
  for (let j = relatedIdx - 1; j >= 0; j--) {
    if (nonWS[j].type === TokenType.CloseParen) {
      depth++;
    } else if (nonWS[j].type === TokenType.OpenParen) {
      if (depth > 0) {
        depth--;
      } else {
        // We're inside this paren group — check the preceding token
        if (j > 0 && nonWS[j - 1].type === TokenType.Function) {
          const funcName = nonWS[j - 1].value.toUpperCase();
          if (ITERATOR_FUNCTIONS.has(funcName)) {
            const args = parseFunctionArgs(nonWS, j);
            if (args && args.length >= 1) {
              const firstArg = args[0];
              if (firstArg.length >= 1 && firstArg[0].type === TokenType.TableRef) {
                return extractTableName(firstArg[0].value);
              }
              // Unquoted table name
              if (firstArg.length === 1 && firstArg[0].type === TokenType.Identifier) {
                return firstArg[0].value;
              }
            }
          }
          // Not an iterator — continue searching outward
        }
        // Keep walking up (not an iterator paren)
      }
    }
  }
  return null;
}

export const relatedValidation = (tokens: Token[]): LintDiagnostic[] => {
  const diagnostics: LintDiagnostic[] = [];
  const nonWS = filterNonWS(tokens);
  const model = store.getModel();

  for (let i = 0; i < nonWS.length; i++) {
    const tok = nonWS[i];
    if (tok.type !== TokenType.Function) continue;

    const upper = tok.value.toUpperCase();
    if (upper !== 'RELATED' && upper !== 'RELATEDTABLE') continue;

    // Must be followed by (
    if (i + 1 >= nonWS.length || nonWS[i + 1].type !== TokenType.OpenParen) continue;

    const args = parseFunctionArgs(nonWS, i + 1);
    if (!args || args.length < 1) continue;

    const arg = args[0];
    const endToken = findClosingParen(nonWS, i);

    if (upper === 'RELATED') {
      // ── Check 1: RELATED() requires a column ref: 'Table'[Column] ──
      const hasColumnRef = arg.some((tk) => tk.type === TokenType.ColumnRef);
      const hasTableRef = arg.some((tk) => tk.type === TokenType.TableRef);

      if (!hasColumnRef) {
        diagnostics.push({
          severity: 'error',
          message: t('lint.related_needs_column'),
          startLine: tok.line,
          startCol: tok.col,
          endLine: endToken.endLine,
          endCol: endToken.endCol,
          ruleId: 'related-validation',
        });
        continue; // No point checking relationships if syntax is wrong
      }

      // ── Check 2: Validate relationship exists (model required) ──
      if (model && hasTableRef) {
        const tableRefToken = arg.find((tk) => tk.type === TokenType.TableRef);
        if (tableRefToken) {
          const relatedTable = extractTableName(tableRefToken.value);

          // Skip if the table itself is unknown — handled by unknown-table rule
          if (!store.getTable(relatedTable)) continue;

          const contextTable = findIteratorContext(nonWS, i);
          if (contextTable && store.getTable(contextTable)) {
            const relationships = store.getRelatedTables(contextTable);
            const hasRelationship = relationships.some(
              (r) => r.table.toUpperCase() === relatedTable.toUpperCase(),
            );

            if (!hasRelationship) {
              diagnostics.push({
                severity: 'error',
                message: t('lint.related_no_relationship', {
                  from: contextTable,
                  to: relatedTable,
                }),
                startLine: tok.line,
                startCol: tok.col,
                endLine: endToken.endLine,
                endCol: endToken.endCol,
                ruleId: 'related-validation',
              });
            }
          }
        }
      }
    } else {
      // ── RELATEDTABLE ──

      // Check 1: RELATEDTABLE() requires a table ref, not a column ref
      const hasColumnRef = arg.some((tk) => tk.type === TokenType.ColumnRef);

      if (hasColumnRef) {
        diagnostics.push({
          severity: 'error',
          message: t('lint.relatedtable_needs_table'),
          startLine: tok.line,
          startCol: tok.col,
          endLine: endToken.endLine,
          endCol: endToken.endCol,
          ruleId: 'related-validation',
        });
        continue;
      }

      // Check 2: Validate relationship exists (model required)
      if (model) {
        const tableRefToken = arg.find((tk) => tk.type === TokenType.TableRef);
        const identToken =
          !tableRefToken && arg.length === 1 && arg[0].type === TokenType.Identifier
            ? arg[0]
            : null;
        const relatedTable = tableRefToken
          ? extractTableName(tableRefToken.value)
          : identToken?.value ?? null;

        if (relatedTable && store.getTable(relatedTable)) {
          const contextTable = findIteratorContext(nonWS, i);
          if (contextTable && store.getTable(contextTable)) {
            const relationships = store.getRelatedTables(contextTable);
            const hasRelationship = relationships.some(
              (r) => r.table.toUpperCase() === relatedTable.toUpperCase(),
            );

            if (!hasRelationship) {
              diagnostics.push({
                severity: 'error',
                message: t('lint.related_no_relationship', {
                  from: contextTable,
                  to: relatedTable,
                }),
                startLine: tok.line,
                startCol: tok.col,
                endLine: endToken.endLine,
                endCol: endToken.endCol,
                ruleId: 'related-validation',
              });
            }
          }
        }
      }
    }
  }

  return diagnostics;
};
