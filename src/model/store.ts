import type { DataModel, ModelTable, ModelColumn, ModelMeasure, ModelRelationship } from './types';

export interface RelatedTableInfo {
  table: string;
  viaColumn: string;
  relatedColumn: string;
  isActive: boolean;
  direction: 'from' | 'to';
}

let model: DataModel | null = null;
let tableMap = new Map<string, ModelTable>();
let relationshipsByTable = new Map<string, RelatedTableInfo[]>();
const listeners: Array<(model: DataModel | null) => void> = [];

function buildMaps(): void {
  tableMap = new Map();
  relationshipsByTable = new Map();
  if (!model) return;
  for (const table of model.tables) {
    tableMap.set(table.name.toUpperCase(), table);
  }
  // Build relationship index by table name
  for (const rel of model.relationships) {
    // From table → related to table
    const fromKey = rel.fromTable.toUpperCase();
    if (!relationshipsByTable.has(fromKey)) {
      relationshipsByTable.set(fromKey, []);
    }
    relationshipsByTable.get(fromKey)!.push({
      table: rel.toTable,
      viaColumn: rel.fromColumn,
      relatedColumn: rel.toColumn,
      isActive: rel.isActive ?? true,
      direction: 'to',
    });

    // To table → related from table
    const toKey = rel.toTable.toUpperCase();
    if (!relationshipsByTable.has(toKey)) {
      relationshipsByTable.set(toKey, []);
    }
    relationshipsByTable.get(toKey)!.push({
      table: rel.fromTable,
      viaColumn: rel.toColumn,
      relatedColumn: rel.fromColumn,
      isActive: rel.isActive ?? true,
      direction: 'from',
    });
  }
}

export function getModel(): DataModel | null {
  return model;
}

export function setModel(newModel: DataModel): void {
  model = newModel;
  buildMaps();
  notify();
}

export function clearModel(): void {
  model = null;
  tableMap.clear();
  relationshipsByTable.clear();
  notify();
}

export function onModelChange(fn: (model: DataModel | null) => void): void {
  listeners.push(fn);
}

function notify(): void {
  for (const fn of listeners) {
    fn(model);
  }
}

export function getTable(name: string): ModelTable | undefined {
  return tableMap.get(name.toUpperCase());
}

export function getColumns(tableName: string): ModelColumn[] {
  return getTable(tableName)?.columns ?? [];
}

export function getMeasures(tableName: string): ModelMeasure[] {
  return getTable(tableName)?.measures ?? [];
}

export function getAllTableNames(): string[] {
  if (!model) return [];
  return model.tables.map((tk) => tk.name);
}

export function getAllMeasureNames(): Array<{ table: string; name: string }> {
  if (!model) return [];
  const result: Array<{ table: string; name: string }> = [];
  for (const table of model.tables) {
    for (const measure of table.measures) {
      result.push({ table: table.name, name: measure.name });
    }
  }
  return result;
}

export function getAllColumnNames(): Array<{ table: string; name: string; dataType: string }> {
  if (!model) return [];
  const result: Array<{ table: string; name: string; dataType: string }> = [];
  for (const table of model.tables) {
    for (const col of table.columns) {
      result.push({ table: table.name, name: col.name, dataType: col.dataType });
    }
  }
  return result;
}

export function getRelatedTables(tableName: string): RelatedTableInfo[] {
  return relationshipsByTable.get(tableName.toUpperCase()) ?? [];
}

export function getAllRelationships(): ModelRelationship[] {
  if (!model) return [];
  return model.relationships;
}

export function getModelStats(): { tables: number; columns: number; measures: number; relationships: number } {
  if (!model) return { tables: 0, columns: 0, measures: 0, relationships: 0 };
  let columns = 0;
  let measures = 0;
  for (const table of model.tables) {
    columns += table.columns.length;
    measures += table.measures.length;
  }
  return { tables: model.tables.length, columns, measures, relationships: model.relationships.length };
}
