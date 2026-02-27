import type { Token, LintDiagnostic } from '../../types';
import { TokenType } from '../../types';
import { t } from '../../i18n/index';
import * as store from '../../model/store';
import { buildSemanticModel, findEnclosingCall, isIteratorFunction } from '../semantic';

export const unknownColumn = (tokens: Token[]): LintDiagnostic[] => {
  const model = store.getModel();
  if (!model) return []; // Only active when model is loaded

  const diagnostics: LintDiagnostic[] = [];
  const semantic = buildSemanticModel(tokens);
  const nonWS = semantic.nonWS;

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

    const colUpper = colName.toUpperCase();

    // Qualified reference: 'Table'[Column]
    if (tableName) {
      const table = store.getTable(tableName);
      if (!table) continue; // Unknown table handled elsewhere

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
      continue;
    }

    // Unqualified [Column] can be a measure reference; if yes, allow.
    const isKnownMeasure = store.getAllMeasureNames().some((m) => m.name.toUpperCase() === colUpper);
    if (isKnownMeasure) continue;

    // Infer possible tables from iterator row context + active related tables.
    const candidateTables = inferContextTablesForColumn(semantic, i);
    if (candidateTables.length === 0) continue; // no reliable context

    const matches = candidateTables.filter((tbl) =>
      store.getColumns(tbl).some((c) => c.name.toUpperCase() === colUpper),
    );

    if (matches.length === 0) {
      diagnostics.push({
        severity: 'warning',
        message: t('lint.unknown_column_unqualified', { column: colName, table: candidateTables[0] }),
        startLine: token.line,
        startCol: token.col,
        endLine: token.endLine,
        endCol: token.endCol,
        ruleId: 'unknown-column',
      });
      continue;
    }

    if (matches.length > 1) {
      diagnostics.push({
        severity: 'info',
        message: t('lint.ambiguous_unqualified_column', { column: colName }),
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

function inferContextTablesForColumn(
  semantic: ReturnType<typeof buildSemanticModel>,
  columnTokenIdx: number,
): string[] {
  const iteratorCall = findEnclosingCall(
    semantic,
    columnTokenIdx,
    (candidate) => isIteratorFunction(candidate.name),
  );
  if (!iteratorCall || iteratorCall.args.length === 0) return [];

  const baseTable = extractTableNameFromArg(iteratorCall.args[0].tokens);
  if (!baseTable || !store.getTable(baseTable)) return [];

  const result = new Set<string>([baseTable]);
  for (const rel of store.getRelatedTables(baseTable)) {
    if (rel.isActive) result.add(rel.table);
  }
  return [...result];
}

function extractTableNameFromArg(argTokens: Token[]): string | null {
  if (argTokens.length !== 1) return null;
  const tk = argTokens[0];
  if (tk.type === TokenType.TableRef) {
    let name = tk.value;
    if (name.startsWith("'") && name.endsWith("'")) {
      name = name.slice(1, -1).replace(/''/g, "'");
    }
    return name;
  }
  if (tk.type === TokenType.Identifier) return tk.value;
  return null;
}
