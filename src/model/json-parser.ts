import type { DataModel, ModelTable, ModelColumn, ModelMeasure } from './types';

export function parseJsonModel(json: string): DataModel {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON format');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Expected a JSON object with a "tables" array');
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.tables)) {
    throw new Error('Expected a "tables" array in the JSON object');
  }

  const tables: ModelTable[] = [];

  for (const rawTable of obj.tables) {
    if (!rawTable || typeof rawTable !== 'object') continue;
    const tbl = rawTable as Record<string, unknown>;

    const name = typeof tbl.name === 'string' ? tbl.name : '';
    if (!name) continue;

    const columns: ModelColumn[] = [];
    if (Array.isArray(tbl.columns)) {
      for (const rawCol of tbl.columns) {
        if (!rawCol || typeof rawCol !== 'object') continue;
        const col = rawCol as Record<string, unknown>;
        const colName = typeof col.name === 'string' ? col.name : '';
        if (!colName) continue;
        columns.push({
          name: colName,
          dataType: typeof col.dataType === 'string' ? col.dataType : 'string',
          description: typeof col.description === 'string' ? col.description : undefined,
          isCalculated: typeof col.isCalculated === 'boolean' ? col.isCalculated : undefined,
          isHidden: typeof col.isHidden === 'boolean' ? col.isHidden : undefined,
        });
      }
    }

    const measures: ModelMeasure[] = [];
    if (Array.isArray(tbl.measures)) {
      for (const rawMeasure of tbl.measures) {
        if (!rawMeasure || typeof rawMeasure !== 'object') continue;
        const m = rawMeasure as Record<string, unknown>;
        const mName = typeof m.name === 'string' ? m.name : '';
        if (!mName) continue;
        measures.push({
          name: mName,
          expression: typeof m.expression === 'string' ? m.expression : '',
          formatString: typeof m.formatString === 'string' ? m.formatString : undefined,
          displayFolder: typeof m.displayFolder === 'string' ? m.displayFolder : undefined,
          description: typeof m.description === 'string' ? m.description : undefined,
        });
      }
    }

    tables.push({
      name,
      columns,
      measures,
      isHidden: typeof tbl.isHidden === 'boolean' ? tbl.isHidden : undefined,
    });
  }

  return { tables, relationships: [] };
}
