import * as monaco from 'monaco-editor';
import { getAllFunctions } from '../knowledge/lookup';
import { t } from '../i18n/index';
import * as store from '../model/store';

// Context boost map: when inside a function, prioritize these categories
const CONTEXT_BOOST_MAP: Record<string, string[]> = {
  'CALCULATE': ['Filter', 'Information'],
  'CALCULATETABLE': ['Filter', 'Information'],
  'SUMX': ['Aggregation', 'Math'],
  'AVERAGEX': ['Aggregation', 'Math'],
  'MINX': ['Aggregation', 'Math'],
  'MAXX': ['Aggregation', 'Math'],
  'COUNTAX': ['Aggregation', 'Math'],
  'RANKX': ['Aggregation', 'Math'],
  'FILTER': ['Logical', 'Information'],
  'ADDCOLUMNS': ['Aggregation', 'Math', 'Text', 'Date/Time'],
  'SELECTCOLUMNS': ['Aggregation', 'Math', 'Text'],
  'SUMMARIZE': ['Aggregation'],
  'SUMMARIZECOLUMNS': ['Aggregation', 'Filter'],
  'GENERATE': ['Table manipulation'],
};

/**
 * Walk backward through the line to find the enclosing function name.
 */
function getEnclosingFunction(text: string): string | null {
  let depth = 0;
  let pos = text.length - 1;
  while (pos >= 0) {
    const ch = text[pos];
    if (ch === ')') depth++;
    if (ch === '(') {
      if (depth === 0) {
        // Found enclosing open paren — extract function name before it
        let nameEnd = pos;
        pos--;
        while (pos >= 0 && /\s/.test(text[pos])) pos--;
        let nameStart = pos;
        while (nameStart >= 0 && /[a-zA-Z_.\w]/.test(text[nameStart])) nameStart--;
        nameStart++;
        const funcName = text.substring(nameStart, nameEnd).trim().toUpperCase();
        return funcName || null;
      }
      depth--;
    }
    pos--;
  }
  return null;
}

/**
 * Extract VAR variable names declared above the cursor position.
 */
function extractVarNames(model: monaco.editor.ITextModel, position: monaco.Position): string[] {
  const vars: string[] = [];
  for (let lineNum = 1; lineNum <= position.lineNumber; lineNum++) {
    const line = model.getLineContent(lineNum);
    const match = line.match(/\bVAR\s+(\w+)\s*=/i);
    if (match) {
      vars.push(match[1]);
    }
  }
  return vars;
}

export function registerCompletionProvider(): void {
  monaco.languages.registerCompletionItemProvider('dax', {
    triggerCharacters: ['(', ',', "'", '[', '.'],

    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: monaco.languages.CompletionItem[] = [];

      // Check text before cursor for context
      const lineContent = model.getLineContent(position.lineNumber);
      const textBeforeCursor = lineContent.substring(0, position.column - 1);

      // Determine enclosing function for context-aware boosting
      const enclosingFunc = getEnclosingFunction(textBeforeCursor);
      const boostedCategories = new Set(
        enclosingFunc ? (CONTEXT_BOOST_MAP[enclosingFunc] ?? []) : []
      );

      // Model-aware suggestions
      const dataModel = store.getModel();
      if (dataModel) {
        // Check if we're inside a table reference: 'TableName'[PartialCol
        const tableColMatch = textBeforeCursor.match(/'([^']+)'\s*\[([^\]]*)$/);
        if (tableColMatch) {
          // Suggest columns + measures for the specific table
          const tableName = tableColMatch[1];
          const partial = tableColMatch[2];
          const colRange: monaco.IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - partial.length,
            endColumn: position.column,
          };

          const columns = store.getColumns(tableName);
          for (const col of columns) {
            suggestions.push({
              label: {
                label: col.name,
                detail: ` (${col.dataType})`,
                description: t('ac.column'),
              },
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: `${col.name}]`,
              detail: `${t('ac.column')} - ${col.dataType}`,
              range: colRange,
              sortText: `0_model_col_${col.name}`,
            });
          }

          const measures = store.getMeasures(tableName);
          for (const m of measures) {
            suggestions.push({
              label: {
                label: m.name,
                detail: ` (${t('ac.measure')})`,
                description: 'fx',
              },
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: `${m.name}]`,
              detail: t('ac.measure'),
              documentation: m.expression ? { value: `= ${m.expression}` } : undefined,
              range: colRange,
              sortText: `0_model_meas_${m.name}`,
            });
          }

          // Related table columns (via relationships)
          const relatedTables = store.getRelatedTables(tableName);
          for (const rel of relatedTables) {
            if (!rel.isActive) continue; // Skip inactive relationships by default
            const relColumns = store.getColumns(rel.table);
            for (const col of relColumns) {
              suggestions.push({
                label: {
                  label: col.name,
                  detail: ` (${col.dataType} - ${rel.table})`,
                  description: t('ac.related'),
                },
                kind: monaco.languages.CompletionItemKind.Reference,
                insertText: `${col.name}]`,
                detail: `${t('ac.column')} via ${rel.table} (${rel.viaColumn} → ${rel.relatedColumn})`,
                range: colRange,
                sortText: `1_related_${rel.table}_${col.name}`,
              });
            }
          }

          return { suggestions };
        }

        // Check if we're after a standalone bracket [PartialName
        const bracketMatch = textBeforeCursor.match(/\[([^\]]*)$/);
        if (bracketMatch) {
          const partial = bracketMatch[1];
          const bracketRange: monaco.IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - partial.length,
            endColumn: position.column,
          };

          // Suggest all measures first, then all columns
          const allMeasures = store.getAllMeasureNames();
          for (const m of allMeasures) {
            suggestions.push({
              label: {
                label: m.name,
                detail: ` (${t('ac.measure')} - ${m.table})`,
              },
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: `${m.name}]`,
              detail: `${t('ac.measure')} - ${m.table}`,
              range: bracketRange,
              sortText: `0_model_0_${m.name}`,
            });
          }

          const allColumns = store.getAllColumnNames();
          for (const col of allColumns) {
            suggestions.push({
              label: {
                label: col.name,
                detail: ` (${col.dataType} - ${col.table})`,
              },
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: `${col.name}]`,
              detail: `${t('ac.column')} - ${col.table}`,
              range: bracketRange,
              sortText: `0_model_1_${col.table}_${col.name}`,
            });
          }

          return { suggestions };
        }

        // Suggest table names (always available when model is loaded)
        const tableNames = store.getAllTableNames();
        for (const name of tableNames) {
          const table = store.getTable(name)!;
          const stats = `${table.columns.length}c / ${table.measures.length}m`;
          suggestions.push({
            label: {
              label: `'${name}'`,
              detail: ` (${t('ac.table')})`,
              description: stats,
            },
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: `'${name}'`,
            detail: `${t('ac.table')} - ${stats}`,
            range,
            sortText: `0_model_table_${name}`,
          });
        }

        // General column/measure suggestions only when user has typed ≥2 chars
        // This prevents flooding the list on every keystroke
        if (word.word.length >= 2) {
          const allColumns = store.getAllColumnNames();
          for (const col of allColumns) {
            suggestions.push({
              label: {
                label: col.name,
                detail: ` (${col.dataType} - ${col.table})`,
                description: t('ac.column'),
              },
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: `'${col.table}'[${col.name}]`,
              detail: `${t('ac.column')} - ${col.table}`,
              range,
              sortText: `0_model_gcol_${col.table}_${col.name}`,
            });
          }

          const allMeasures = store.getAllMeasureNames();
          for (const m of allMeasures) {
            suggestions.push({
              label: {
                label: m.name,
                detail: ` (${t('ac.measure')} - ${m.table})`,
                description: 'fx',
              },
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: `[${m.name}]`,
              detail: `${t('ac.measure')} - ${m.table}`,
              range,
              sortText: `0_model_gmeas_${m.name}`,
            });
          }
        }
      }

      // VAR variable suggestions (top priority)
      const varNames = extractVarNames(model, position);
      for (const varName of varNames) {
        suggestions.push({
          label: {
            label: varName,
            detail: ` (${t('ac.var')})`,
          },
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: varName,
          detail: t('ac.var'),
          range,
          sortText: `0_var_${varName}`,
        });
      }

      // Function suggestions with snippet placeholders
      for (const func of getAllFunctions()) {
        const snippetParams = func.params
          .filter((p) => p.required !== false)
          .map((p, i) => `\${${i + 1}:${p.name}}`)
          .join(', ');

        const insertSnippet = snippetParams
          ? `${func.name}(${snippetParams})`
          : `${func.name}($0)`;

        // Context-aware sorting: boost functions matching the enclosing context
        const isBoosted = boostedCategories.has(func.category);

        suggestions.push({
          label: {
            label: func.name,
            detail: ` (${func.category})`,
            description: func.returns,
          },
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: insertSnippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: func.signatures[0],
          documentation: {
            value: `${func.description_short}\n\n**${t('hover.returns')}** ${func.returns}${
              func.notes.length > 0 ? '\n\n' + func.notes[0] : ''
            }`,
          },
          range,
          sortText: isBoosted ? `0_func_${func.name}` : `1_${func.name}`,
        });
      }

      // Keyword suggestions
      const keywords = [
        { label: 'VAR', snippet: 'VAR ${1:name} = ${2:expression}', detail: t('ac.var') },
        { label: 'RETURN', snippet: 'RETURN\n    $0', detail: t('ac.return') },
        { label: 'TRUE', snippet: 'TRUE', detail: t('ac.true') },
        { label: 'FALSE', snippet: 'FALSE', detail: t('ac.false') },
        { label: 'BLANK', snippet: 'BLANK()', detail: t('ac.blank') },
        { label: 'DEFINE', snippet: 'DEFINE\n    MEASURE ${1:table}[${2:name}] = ${3:expression}', detail: t('ac.define') },
        { label: 'EVALUATE', snippet: 'EVALUATE\n    $0', detail: t('ac.evaluate') },
        { label: 'ORDER BY', snippet: 'ORDER BY ${1:column} ${2|ASC,DESC|}', detail: t('ac.order_by') },
        { label: 'IN', snippet: 'IN {${1:values}}', detail: t('ac.in') },
      ];

      for (const kw of keywords) {
        suggestions.push({
          label: kw.label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: kw.detail,
          range,
          sortText: `2_${kw.label}`,
        });
      }

      // Common snippet patterns
      const snippets = [
        {
          label: 'VAR...RETURN',
          snippet: 'VAR ${1:name} = ${2:expression}\nRETURN\n    ${3:result}',
          detail: t('ac.var_return'),
        },
        {
          label: 'CALCULATE pattern',
          snippet: 'CALCULATE(\n    ${1:expression},\n    ${2:filter}\n)',
          detail: t('ac.calc_pattern'),
        },
        {
          label: 'SWITCH TRUE pattern',
          snippet: 'SWITCH(\n    TRUE(),\n    ${1:condition1}, ${2:result1},\n    ${3:condition2}, ${4:result2},\n    ${5:defaultResult}\n)',
          detail: t('ac.switch_pattern'),
        },
        {
          label: 'Year-over-Year',
          snippet: 'VAR CurrentValue = ${1:[Measure]}\nVAR PriorYearValue = CALCULATE(${1:[Measure]}, SAMEPERIODLASTYEAR(${2:Date[Date]}))\nRETURN\n    DIVIDE(CurrentValue - PriorYearValue, PriorYearValue)',
          detail: t('ac.yoy_pattern'),
        },
        {
          label: 'Running Total',
          snippet: 'CALCULATE(\n    ${1:[Measure]},\n    FILTER(\n        ALL(${2:Date[Date]}),\n        ${2:Date[Date]} <= MAX(${2:Date[Date]})\n    )\n)',
          detail: t('ac.running_total'),
        },
      ];

      for (const snip of snippets) {
        suggestions.push({
          label: {
            label: snip.label,
            detail: ` ${t('ac.snippet')}`,
          },
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snip.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: snip.detail,
          range,
          sortText: `3_${snip.label}`,
        });
      }

      return { suggestions };
    },
  });
}
