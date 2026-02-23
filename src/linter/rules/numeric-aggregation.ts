import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import * as store from '../../model/store';

/**
 * Rule: numeric-aggregation
 *
 * Detects when a numeric-only aggregation function (SUM, AVERAGE, etc.)
 * is called on a non-numeric column (string, dateTime, boolean).
 *
 * Example:
 *   SUM('Assignment'[Contract_BK])  →  warning: Contract_BK is string
 *   SUM('Payroll'[Amount])          →  OK: Amount is decimal
 *
 * Skips columns with dataType 'unknown' (can't validate).
 */

/** Functions that require a numeric column argument */
const NUMERIC_FUNCTIONS = new Set([
  'SUM', 'AVERAGE', 'AVERAGEA',
  'STDEV.S', 'STDEV.P',
  'VAR.S', 'VAR.P',
]);

/** Data types considered numeric */
const NUMERIC_TYPES = new Set(['int64', 'decimal', 'double']);

export const numericAggregation = (tokens: Token[]): LintDiagnostic[] => {
  const model = store.getModel();
  if (!model) return []; // Only active when model is loaded

  const diagnostics: LintDiagnostic[] = [];
  const nonWS = tokens.filter(
    (tk) => tk.type !== TokenType.Whitespace &&
            tk.type !== TokenType.LineComment &&
            tk.type !== TokenType.BlockComment &&
            tk.type !== TokenType.EOF,
  );

  for (let i = 0; i < nonWS.length; i++) {
    const token = nonWS[i];

    // Look for a numeric aggregation function
    if (token.type !== TokenType.Function) continue;
    if (!NUMERIC_FUNCTIONS.has(token.value.toUpperCase())) continue;

    // Expect: FUNC ( [optional table ref] columnRef ... )
    // Next token should be OpenParen
    if (i + 1 >= nonWS.length || nonWS[i + 1].type !== TokenType.OpenParen) continue;

    // Find the column reference inside the function call
    // It should be right after the open paren, optionally preceded by a table ref
    let tableRefIdx = -1;
    let colRefIdx = -1;

    for (let j = i + 2; j < nonWS.length && j <= i + 4; j++) {
      if (nonWS[j].type === TokenType.TableRef) {
        tableRefIdx = j;
      } else if (nonWS[j].type === TokenType.ColumnRef) {
        colRefIdx = j;
        break;
      } else if (nonWS[j].type === TokenType.CloseParen ||
                 nonWS[j].type === TokenType.Comma ||
                 nonWS[j].type === TokenType.Function) {
        break; // Not a simple column reference
      }
    }

    if (colRefIdx === -1) continue;

    // Extract column name
    let colName = nonWS[colRefIdx].value;
    if (colName.startsWith('[')) colName = colName.slice(1);
    if (colName.endsWith(']')) colName = colName.slice(0, -1);
    if (!colName) continue;

    // Extract table name (if present)
    let tableName: string | null = null;
    if (tableRefIdx !== -1 && tableRefIdx === colRefIdx - 1) {
      let tName = nonWS[tableRefIdx].value;
      if (tName.startsWith("'") && tName.endsWith("'")) {
        tName = tName.slice(1, -1).replace(/''/g, "'");
      }
      tableName = tName;
    }

    // Skip if no table context — can't look up the column type
    if (!tableName) continue;

    const table = store.getTable(tableName);
    if (!table) continue;

    // Find the column in the table
    const colUpper = colName.toUpperCase();
    const column = table.columns.find((c) => c.name.toUpperCase() === colUpper);
    if (!column) continue; // Unknown column handled by unknown-column rule

    // Skip 'unknown' data types — can't validate
    if (column.dataType === 'unknown') continue;

    // Check if the data type is numeric
    if (!NUMERIC_TYPES.has(column.dataType)) {
      const funcName = token.value.toUpperCase();
      const colToken = nonWS[colRefIdx];
      diagnostics.push({
        severity: 'warning',
        message: t('lint.numeric_aggregation', {
          func: funcName,
          table: tableName,
          column: colName,
          dataType: column.dataType,
        }),
        startLine: token.line,
        startCol: token.col,
        endLine: colToken.endLine,
        endCol: colToken.endCol,
        ruleId: 'numeric-aggregation',
      });
    }
  }

  return diagnostics;
};
