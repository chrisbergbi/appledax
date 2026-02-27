import type { DataModel, ModelTable, ModelColumn, ModelMeasure, ModelRelationship } from './types';

interface ParsedFile {
  name: string;
  content: string;
}

interface ParseResult {
  tables: ModelTable[];
  relationships: ModelRelationship[];
}

interface CultureResult {
  culture: string;
  translations: Map<string, { caption?: string; description?: string; displayFolder?: string }>;
}

export function parseTmdlFiles(files: ParsedFile[]): DataModel {
  const allTables: ModelTable[] = [];
  const allRelationships: ModelRelationship[] = [];
  const allCultures: CultureResult[] = [];

  for (const file of files) {
    const firstLine = file.content.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
    if (/^cultureInfo?\s+/i.test(firstLine)) {
      const cr = parseCultureTmdl(file.content);
      if (cr) allCultures.push(cr);
      continue;
    }
    const result = parseSingleTmdl(file.content);
    allTables.push(...result.tables);
    allRelationships.push(...result.relationships);
  }

  // Merge/deduplicate tables by name (case-insensitive)
  const merged = mergeTables(allTables);

  // Apply culture translations to model objects
  for (const cr of allCultures) {
    for (const table of merged) {
      const tableKey = table.name.toUpperCase();
      const tableTr = cr.translations.get(tableKey);
      if (tableTr) {
        if (!table.translations) table.translations = [];
        table.translations.push({ culture: cr.culture, ...tableTr });
      }
      for (const col of table.columns) {
        const colKey = `${tableKey}.${col.name.toUpperCase()}`;
        const colTr = cr.translations.get(colKey);
        if (colTr) {
          if (!col.translations) col.translations = [];
          col.translations.push({ culture: cr.culture, ...colTr });
        }
      }
      for (const meas of table.measures) {
        const measKey = `${tableKey}.[${meas.name.toUpperCase()}]`;
        const measTr = cr.translations.get(measKey);
        if (measTr) {
          if (!meas.translations) meas.translations = [];
          meas.translations.push({ culture: cr.culture, ...measTr });
        }
      }
    }
  }

  return { tables: merged, relationships: allRelationships };
}

/**
 * Detect file type from content and route to the appropriate parser.
 */
function parseSingleTmdl(content: string): ParseResult {
  const firstLine = content.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';

  if (/^model\s+/i.test(firstLine)) {
    return { tables: parseRootModelTmdl(content), relationships: parseRelationshipsTmdl(content) };
  }
  if (/^perspective\s+/i.test(firstLine)) {
    return { tables: parsePerspectiveTmdl(content), relationships: [] };
  }
  // Check if this is a relationships file
  if (/^relationship\s+/i.test(firstLine)) {
    return { tables: [], relationships: parseRelationshipsTmdl(content) };
  }
  // Default: individual table file (existing parser)
  return { tables: parseTableFileTmdl(content), relationships: [] };
}

/**
 * Parse a root model.tmdl file that contains `ref table` entries.
 * Creates empty ModelTable shells (table names only, no columns/measures).
 */
function parseRootModelTmdl(content: string): ModelTable[] {
  const tables: ModelTable[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^ref\s+table\s+(.+)$/i);
    if (match) {
      const name = extractName(match[1]);
      tables.push({ name, columns: [], measures: [] });
    }
  }

  return tables;
}

/**
 * Parse a perspective TMDL file that contains perspectiveTable/Column/Measure entries.
 * Builds tables with columns and measures (dataType defaults to 'unknown').
 */
function parsePerspectiveTmdl(content: string): ModelTable[] {
  const tables: ModelTable[] = [];
  const lines = content.split('\n');

  let currentTable: ModelTable | null = null;

  for (const line of lines) {
    const indent = getIndentLevel(line);
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('///')) continue;

    // perspectiveTable at indent 1
    if (indent === 1 && /^perspectiveTable\s+/i.test(trimmed)) {
      const name = extractName(trimmed.replace(/^perspectiveTable\s+/i, ''));
      currentTable = { name, columns: [], measures: [] };
      tables.push(currentTable);
      continue;
    }

    // perspectiveColumn at indent 2
    if (indent === 2 && /^perspectiveColumn\s+/i.test(trimmed) && currentTable) {
      const name = extractName(trimmed.replace(/^perspectiveColumn\s+/i, ''));
      const col: ModelColumn = { name, dataType: 'unknown' };
      currentTable.columns.push(col);
      continue;
    }

    // perspectiveMeasure at indent 2
    if (indent === 2 && /^perspectiveMeasure\s+/i.test(trimmed) && currentTable) {
      const name = extractName(trimmed.replace(/^perspectiveMeasure\s+/i, ''));
      const measure: ModelMeasure = { name, expression: '' };
      currentTable.measures.push(measure);
      continue;
    }

    // perspectiveHierarchy — skip
  }

  return tables;
}

/**
 * Parse an individual table TMDL file (existing logic, unchanged).
 */
function parseTableFileTmdl(content: string): ModelTable[] {
  const tables: ModelTable[] = [];
  const lines = content.split('\n');

  let currentTable: ModelTable | null = null;
  let currentColumn: ModelColumn | null = null;
  let currentMeasure: ModelMeasure | null = null;
  let collectingExpression = false;
  let expressionLines: string[] = [];
  let expressionBaseIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const indent = getIndentLevel(rawLine);
    const trimmed = rawLine.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('///')) {
      // Collect description comments
      if (trimmed.startsWith('///') && trimmed.length > 3) {
        const descText = trimmed.slice(3).trim();
        if (currentMeasure && indent >= 2) {
          currentMeasure.description = (currentMeasure.description ?? '') + descText + ' ';
        } else if (currentColumn && indent >= 2) {
          currentColumn.description = (currentColumn.description ?? '') + descText + ' ';
        }
      }
      continue;
    }

    // If collecting a multi-line expression
    if (collectingExpression) {
      if (indent > expressionBaseIndent) {
        // Strip the base indentation and collect
        const stripped = rawLine.replace(/^\t*/, (m) => m.slice(Math.min(m.length, expressionBaseIndent + 1)));
        expressionLines.push(stripped.trimStart());
        continue;
      } else {
        // End of expression block
        finishExpression();
        // Fall through to process current line
      }
    }

    // Table declaration (indent 0)
    if (indent === 0 && /^table\s+/i.test(trimmed)) {
      finishCurrentItems();
      const name = extractName(trimmed.replace(/^table\s+/i, ''));
      currentTable = { name, columns: [], measures: [] };
      tables.push(currentTable);
      currentColumn = null;
      currentMeasure = null;
      continue;
    }

    // Column declaration (indent 1, inside table)
    if (indent === 1 && /^column\s+/i.test(trimmed) && currentTable) {
      finishCurrentItems();
      const name = extractName(trimmed.replace(/^column\s+/i, ''));
      currentColumn = { name, dataType: 'string' };
      currentTable.columns.push(currentColumn);
      currentMeasure = null;
      continue;
    }

    // Measure declaration (indent 1, inside table)
    if (indent === 1 && /^measure\s+/i.test(trimmed) && currentTable) {
      finishCurrentItems();
      const name = extractName(trimmed.replace(/^measure\s+/i, ''));
      // Check for inline expression: measure 'Name' = <expr>
      const eqIndex = trimmed.indexOf('=');
      let expression = '';
      if (eqIndex !== -1) {
        // Check if there's an = after the name
        const afterName = trimmed.slice(trimmed.indexOf(name) + name.length).trim();
        if (afterName.startsWith('=')) {
          expression = afterName.slice(1).trim();
        }
      }
      currentMeasure = { name, expression };
      currentTable.measures.push(currentMeasure);
      currentColumn = null;
      continue;
    }

    // Properties (indent 2+)
    if (indent >= 2) {
      const propMatch = trimmed.match(/^(\w+)\s*[:=]\s*(.*)$/);
      if (propMatch) {
        const [, propName, propValue] = propMatch;
        const propLower = propName.toLowerCase();

        if (currentColumn) {
          if (propLower === 'datatype') {
            currentColumn.dataType = propValue.trim();
          } else if (propLower === 'ishidden') {
            currentColumn.isHidden = propValue.trim().toLowerCase() === 'true';
          } else if (propLower === 'expression') {
            if (propValue.trim()) {
              currentColumn.isCalculated = true;
            } else {
              // Multi-line expression starts next line
              collectingExpression = true;
              expressionBaseIndent = indent;
              expressionLines = [];
              currentColumn.isCalculated = true;
            }
          }
        } else if (currentMeasure) {
          if (propLower === 'expression') {
            if (propValue.trim()) {
              currentMeasure.expression = propValue.trim();
            } else {
              // Multi-line expression starts next line
              collectingExpression = true;
              expressionBaseIndent = indent;
              expressionLines = [];
            }
          } else if (propLower === 'formatstring') {
            currentMeasure.formatString = propValue.trim();
          } else if (propLower === 'displayfolder') {
            currentMeasure.displayFolder = propValue.trim();
          }
        } else if (currentTable && propLower === 'ishidden') {
          currentTable.isHidden = propValue.trim().toLowerCase() === 'true';
        }
      }
      continue;
    }

    // Anything else at indent 0 or 1 that's not table/column/measure
    // Could be relationships, partitions, etc. — skip
  }

  finishCurrentItems();
  return tables;

  function finishExpression(): void {
    if (!collectingExpression) return;
    collectingExpression = false;
    const expr = expressionLines.join('\n').trim();
    if (currentMeasure && !currentMeasure.expression) {
      currentMeasure.expression = expr;
    }
    expressionLines = [];
  }

  function finishCurrentItems(): void {
    finishExpression();
    // Trim descriptions
    if (currentColumn?.description) {
      currentColumn.description = currentColumn.description.trim();
    }
    if (currentMeasure?.description) {
      currentMeasure.description = currentMeasure.description.trim();
    }
  }
}

/**
 * Parse relationships from a TMDL file.
 * Format:
 *   relationship <uuid>
 *     fromColumn: 'Table1'[Column1]  OR  'Table1'.Column1
 *     toColumn: 'Table2'[Column2]    OR  'Table2'.Column2
 *     crossFilteringBehavior: bothDirections
 *     isActive: false
 */
function parseRelationshipsTmdl(content: string): ModelRelationship[] {
  const relationships: ModelRelationship[] = [];
  const lines = content.split('\n');

  let currentRel: Partial<ModelRelationship> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('///')) continue;

    // New relationship block
    const relMatch = trimmed.match(/^relationship\s+(.+)$/i);
    if (relMatch) {
      // Finish previous
      if (currentRel?.fromTable && currentRel?.toTable) {
        relationships.push({
          id: currentRel.id ?? '',
          fromTable: currentRel.fromTable,
          fromColumn: currentRel.fromColumn ?? '',
          toTable: currentRel.toTable,
          toColumn: currentRel.toColumn ?? '',
          crossFilteringBehavior: currentRel.crossFilteringBehavior,
          isActive: currentRel.isActive ?? true,
        });
      }
      currentRel = { id: relMatch[1].trim(), isActive: true };
      continue;
    }

    if (!currentRel) continue;

    // fromColumn / toColumn — supports these formats:
    //   'Table Name'.Column   'Table Name'[Column]   'Table Name'.'Column Name'
    //   TableName.Column      TableName.'Column Name'   TableName[Column]
    const fromToMatch = trimmed.match(/^(fromColumn|toColumn)\s*:\s*(.+)$/i);
    if (fromToMatch) {
      const [, prop, rawValue] = fromToMatch;
      const ref = parseColumnRef(rawValue.trim());
      if (ref) {
        if (prop.toLowerCase() === 'fromcolumn') {
          currentRel.fromTable = ref.table;
          currentRel.fromColumn = ref.column;
        } else {
          currentRel.toTable = ref.table;
          currentRel.toColumn = ref.column;
        }
      }
      continue;
    }

    // crossFilteringBehavior
    const cfMatch = trimmed.match(/^crossFilteringBehavior\s*:\s*(\w+)/i);
    if (cfMatch) {
      currentRel.crossFilteringBehavior = cfMatch[1].toLowerCase() === 'bothdirections'
        ? 'bothDirections'
        : 'oneDirection';
      continue;
    }

    // isActive
    const activeMatch = trimmed.match(/^isActive\s*:\s*(true|false)/i);
    if (activeMatch) {
      currentRel.isActive = activeMatch[1].toLowerCase() === 'true';
      continue;
    }
  }

  // Finish last relationship
  if (currentRel?.fromTable && currentRel?.toTable) {
    relationships.push({
      id: currentRel.id ?? '',
      fromTable: currentRel.fromTable,
      fromColumn: currentRel.fromColumn ?? '',
      toTable: currentRel.toTable,
      toColumn: currentRel.toColumn ?? '',
      crossFilteringBehavior: currentRel.crossFilteringBehavior,
      isActive: currentRel.isActive ?? true,
    });
  }

  return relationships;
}

/**
 * Parse a TMDL culture file that contains translations.
 * Format:
 *   cultureInfo pt-PT
 *     translations
 *       model Model
 *         table Sales
 *           caption: Vendas
 *           column ProductKey
 *             caption: Chave de Produto
 *           measure 'Sales Amount'
 *             caption: Total de Vendas
 */
function parseCultureTmdl(content: string): CultureResult | null {
  const lines = content.split('\n');
  const firstLine = lines.find((l) => l.trim().length > 0)?.trim() ?? '';
  const cultureMatch = firstLine.match(/^cultureInfo?\s+(.+)$/i);
  if (!cultureMatch) return null;

  const culture = cultureMatch[1].trim();
  const translations = new Map<string, { caption?: string; description?: string; displayFolder?: string }>();

  let currentTable = '';
  let currentItemKey = '';

  for (const rawLine of lines) {
    const indent = getIndentLevel(rawLine);
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('///')) continue;

    // culture declaration (indent 0) — skip
    if (indent === 0) continue;

    // translations header (indent 1) — skip
    if (/^translations$/i.test(trimmed)) continue;

    // model header (indent ~2) — skip
    if (/^model\s+/i.test(trimmed)) continue;

    // table declaration
    if (/^table\s+/i.test(trimmed)) {
      currentTable = extractName(trimmed.replace(/^table\s+/i, ''));
      currentItemKey = currentTable.toUpperCase();
      continue;
    }

    // column declaration
    if (/^column\s+/i.test(trimmed) && currentTable) {
      const colName = extractName(trimmed.replace(/^column\s+/i, ''));
      currentItemKey = `${currentTable.toUpperCase()}.${colName.toUpperCase()}`;
      continue;
    }

    // measure declaration
    if (/^measure\s+/i.test(trimmed) && currentTable) {
      const measName = extractName(trimmed.replace(/^measure\s+/i, ''));
      currentItemKey = `${currentTable.toUpperCase()}.[${measName.toUpperCase()}]`;
      continue;
    }

    // Property lines (caption, description, displayFolder)
    const propMatch = trimmed.match(/^(caption|description|displayFolder)\s*:\s*(.*)$/i);
    if (propMatch && currentItemKey) {
      const propName = propMatch[1].toLowerCase();
      const propValue = propMatch[2].trim();
      const existing = translations.get(currentItemKey) ?? {};
      if (propName === 'caption') existing.caption = propValue;
      else if (propName === 'description') existing.description = propValue;
      else if (propName === 'displayfolder') existing.displayFolder = propValue;
      translations.set(currentItemKey, existing);
    }
  }

  return { culture, translations };
}

/**
 * Merge tables by name (case-insensitive).
 * When duplicates exist, keep the one with more columns/measures.
 */
function mergeTables(allTables: ModelTable[]): ModelTable[] {
  const map = new Map<string, ModelTable>();

  for (const table of allTables) {
    const key = table.name.toUpperCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, table);
    } else {
      // Keep the version with more detail
      const existingCount = existing.columns.length + existing.measures.length;
      const newCount = table.columns.length + table.measures.length;
      if (newCount > existingCount) {
        map.set(key, table);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Parse a column reference in various TMDL formats:
 *   'Table Name'.Column   'Table Name'[Column]   'Table Name'.'Column Name'
 *   TableName.Column      TableName.'Column Name' TableName[Column]
 */
function parseColumnRef(value: string): { table: string; column: string } | null {
  const v = value.trim();
  let tableName: string;
  let colName: string;

  if (v.startsWith("'")) {
    // Quoted table name
    const endQuote = v.indexOf("'", 1);
    if (endQuote === -1) return null;
    tableName = v.slice(1, endQuote);
    const rest = v.slice(endQuote + 1);

    if (rest.startsWith('.')) {
      const colPart = rest.slice(1).trim();
      if (colPart.startsWith("'")) {
        const colEnd = colPart.indexOf("'", 1);
        colName = colEnd !== -1 ? colPart.slice(1, colEnd) : colPart.slice(1);
      } else {
        colName = colPart;
      }
    } else if (rest.startsWith('[')) {
      const bracketEnd = rest.indexOf(']');
      colName = bracketEnd !== -1 ? rest.slice(1, bracketEnd) : rest.slice(1);
    } else {
      return null;
    }
  } else {
    // Unquoted table name: TableName.Column or TableName.'Column' or TableName[Column]
    const bracketIdx = v.indexOf('[');
    const dotIdx = v.indexOf('.');
    if (bracketIdx !== -1 && (dotIdx === -1 || bracketIdx < dotIdx)) {
      tableName = v.slice(0, bracketIdx);
      const bracketEnd = v.indexOf(']', bracketIdx);
      colName = bracketEnd !== -1 ? v.slice(bracketIdx + 1, bracketEnd) : v.slice(bracketIdx + 1);
    } else if (dotIdx !== -1) {
      tableName = v.slice(0, dotIdx);
      const colPart = v.slice(dotIdx + 1).trim();
      if (colPart.startsWith("'")) {
        const colEnd = colPart.indexOf("'", 1);
        colName = colEnd !== -1 ? colPart.slice(1, colEnd) : colPart.slice(1);
      } else {
        colName = colPart;
      }
    } else {
      return null;
    }
  }

  return tableName && colName ? { table: tableName, column: colName } : null;
}

function getIndentLevel(line: string): number {
  let tabs = 0;
  for (const ch of line) {
    if (ch === '\t') tabs++;
    else if (ch === ' ') {
      // Count 4 spaces as 1 tab (some editors convert)
      continue;
    } else break;
  }
  // Also handle space-based indentation (count groups of spaces)
  if (tabs === 0) {
    let spaces = 0;
    for (const ch of line) {
      if (ch === ' ') spaces++;
      else break;
    }
    return Math.floor(spaces / 4);
  }
  return tabs;
}

function extractName(raw: string): string {
  const trimmed = raw.trim();

  // Handle single-quoted names: 'My Table Name'
  if (trimmed.startsWith("'")) {
    const endQuote = trimmed.indexOf("'", 1);
    if (endQuote !== -1) {
      return trimmed.slice(1, endQuote).replace(/''/g, "'");
    }
    return trimmed.slice(1);
  }

  // Handle inline measure with =: measure Total = SUM(...)
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex !== -1) {
    return trimmed.slice(0, eqIndex).trim();
  }

  // Plain name: first word (up to whitespace or end)
  const spaceIndex = trimmed.search(/\s/);
  if (spaceIndex !== -1) {
    return trimmed.slice(0, spaceIndex);
  }

  return trimmed;
}
