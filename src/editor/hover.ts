import * as monaco from 'monaco-editor';
import { getFunctionByName, getKeywordHelp } from '../knowledge/lookup';
import { t } from '../i18n/index';
import * as store from '../model/store';

export function registerHoverProvider(): void {
  monaco.languages.registerHoverProvider('dax', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const wordText = word.word.toUpperCase();
      const range = new monaco.Range(
        position.lineNumber, word.startColumn,
        position.lineNumber, word.endColumn,
      );

      // Model-aware hover: check for table references and column references
      const dataModel = store.getModel();
      if (dataModel) {
        const lineContent = model.getLineContent(position.lineNumber);

        // Check if cursor is inside a table reference: 'TableName'
        const tableRefResult = getTableRefAtPosition(lineContent, position.column);
        if (tableRefResult) {
          const table = store.getTable(tableRefResult);
          if (table) {
            const tableRange = getTableRefRange(lineContent, position.lineNumber, position.column);
            return {
              range: tableRange ?? range,
              contents: [
                { value: `**${table.name}** _(${t('hover.table')})_` },
                { value: `${t('hover.columns', { count: table.columns.length })}, ${t('hover.measures', { count: table.measures.length })}` },
              ],
            };
          }
        }

        // Check if cursor is inside a column reference: [ColumnName]
        const colRefResult = getColumnRefAtPosition(lineContent, position.column);
        if (colRefResult) {
          // Try to find the preceding table ref
          const tableName = getPrecedingTableRef(lineContent, colRefResult.bracketStart);
          if (tableName) {
            const table = store.getTable(tableName);
            if (table) {
              // Check if it's a column
              const col = table.columns.find((c) => c.name.toUpperCase() === colRefResult.name.toUpperCase());
              if (col) {
                return {
                  range: colRefResult.range ? new monaco.Range(
                    position.lineNumber, colRefResult.range.start,
                    position.lineNumber, colRefResult.range.end,
                  ) : range,
                  contents: [
                    { value: `**${col.name}** _(${t('hover.column_in', { table: tableName })})_` },
                    { value: t('hover.type', { type: col.dataType }) },
                    ...(col.description ? [{ value: col.description }] : []),
                  ],
                };
              }

              // Check if it's a measure
              const measure = table.measures.find((m) => m.name.toUpperCase() === colRefResult.name.toUpperCase());
              if (measure) {
                return {
                  range: colRefResult.range ? new monaco.Range(
                    position.lineNumber, colRefResult.range.start,
                    position.lineNumber, colRefResult.range.end,
                  ) : range,
                  contents: [
                    { value: `**${measure.name}** _(${t('hover.measure_in', { table: tableName })})_` },
                    { value: `= ${measure.expression}` },
                    ...(measure.description ? [{ value: measure.description }] : []),
                  ],
                };
              }
            }
          }
        }
      }

      // Function hover
      const func = getFunctionByName(wordText);
      if (func) {
        const contents: monaco.IMarkdownString[] = [
          { value: `**${func.name}** _(${func.category})_` },
          { value: '```dax\n' + func.signatures.join('\n') + '\n```' },
          { value: func.description_short },
        ];

        if (func.params.length > 0) {
          const paramsText = func.params
            .map((p) => `- \`${p.name}\` _(${p.type})_ — ${p.description}`)
            .join('\n');
          contents.push({ value: `${t('hover.parameters')}\n` + paramsText });
        }

        contents.push({ value: `${t('hover.returns')} ${func.returns}` });

        if (func.notes.length > 0) {
          contents.push({ value: `${t('hover.notes')} ` + func.notes[0] });
        }

        if (func.pitfalls.length > 0) {
          contents.push({ value: `${t('hover.pitfall')} ` + func.pitfalls[0] });
        }

        return { range, contents };
      }

      // Keyword hover
      const kwHelp = getKeywordHelp(wordText);
      if (kwHelp) {
        return {
          range,
          contents: [
            { value: `**${wordText}** _${t('hover.keyword')}_` },
            { value: kwHelp },
          ],
        };
      }

      return null;
    },
  });
}

/** Extract table name if cursor is inside 'TableName' */
function getTableRefAtPosition(line: string, column: number): string | null {
  const col = column - 1; // 0-based
  // Walk backward to find opening quote
  let start = col;
  while (start >= 0 && line[start] !== "'") start--;
  if (start < 0) return null;

  // Walk forward to find closing quote
  let end = col;
  while (end < line.length && line[end] !== "'") end++;
  // If we didn't start on a quote, we need to check boundaries
  if (line[start] !== "'" || end >= line.length) return null;

  // Check that cursor is actually inside the quotes
  if (col <= start || col > end) return null;

  return line.substring(start + 1, end);
}

/** Get the Monaco range for a 'TableName' reference */
function getTableRefRange(line: string, lineNumber: number, column: number): monaco.Range | null {
  const col = column - 1;
  let start = col;
  while (start >= 0 && line[start] !== "'") start--;
  if (start < 0) return null;

  let end = col;
  while (end < line.length && line[end] !== "'") end++;
  if (end >= line.length) return null;

  return new monaco.Range(lineNumber, start + 1, lineNumber, end + 2); // +1 for 1-based, +1 to include closing quote
}

/** Extract column name if cursor is inside [ColumnName] */
function getColumnRefAtPosition(line: string, column: number): { name: string; bracketStart: number; range: { start: number; end: number } } | null {
  const col = column - 1;
  let start = col;
  while (start >= 0 && line[start] !== '[') start--;
  if (start < 0) return null;

  let end = col;
  while (end < line.length && line[end] !== ']') end++;
  if (end >= line.length) return null;

  if (col <= start || col > end) return null;

  return {
    name: line.substring(start + 1, end),
    bracketStart: start,
    range: { start: start + 1, end: end + 2 }, // 1-based, inclusive of brackets
  };
}

/** Look for 'TableName' immediately before [ */
function getPrecedingTableRef(line: string, bracketStart: number): string | null {
  // bracketStart is 0-based position of [
  // Look backward: 'TableName'[
  let pos = bracketStart - 1;
  if (pos < 0 || line[pos] !== "'") return null;
  pos--;
  let end = pos;
  while (pos >= 0 && line[pos] !== "'") pos--;
  if (pos < 0) return null;
  return line.substring(pos + 1, end + 1);
}
