import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import * as store from '../../model/store';

export const unknownColumn = (tokens: Token[]): LintDiagnostic[] => {
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
    if (token.type !== TokenType.ColumnRef) continue;

    // Extract column name: strip [ and ]
    let colName = token.value;
    if (colName.startsWith('[')) colName = colName.slice(1);
    if (colName.endsWith(']')) colName = colName.slice(0, -1);
    if (!colName) continue;

    // Look for preceding table ref: 'Table'[Column]
    let tableName: string | null = null;
    if (i > 0 && nonWS[i - 1].type === TokenType.TableRef) {
      let tName = nonWS[i - 1].value;
      if (tName.startsWith("'") && tName.endsWith("'")) {
        tName = tName.slice(1, -1).replace(/''/g, "'");
      }
      tableName = tName;
    }

    // Only validate if we have a known table
    if (!tableName) continue;

    const table = store.getTable(tableName);
    if (!table) continue; // Unknown table is handled by unknown-table rule

    // Check if column or measure exists in this table
    const colUpper = colName.toUpperCase();
    const hasColumn = table.columns.some((c) => c.name.toUpperCase() === colUpper);
    const hasMeasure = table.measures.some((m) => m.name.toUpperCase() === colUpper);

    if (!hasColumn && !hasMeasure) {
      diagnostics.push({
        severity: 'warning',
        message: t('lint.unknown_column', { column: colName, table: tableName }),
        startLine: token.line,
        startCol: token.col,
        endLine: token.endLine,
        endCol: token.endCol,
        ruleId: 'unknown-column',
      });
    }
  }

  return diagnostics;
};
