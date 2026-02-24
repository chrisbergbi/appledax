import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { snippetCompletion } from '@codemirror/autocomplete';
import { getAllFunctions } from '../../knowledge/lookup';
import { t } from '../../i18n/index';
import * as store from '../../model/store';

/* ── Context boost map ──────────────────────────────────── */

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

/* ── Helper functions (pure, reusable) ──────────────────── */

function getEnclosingFunction(text: string): string | null {
  let depth = 0;
  let pos = text.length - 1;
  while (pos >= 0) {
    const ch = text[pos];
    if (ch === ')') depth++;
    if (ch === '(') {
      if (depth === 0) {
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

function extractVarNames(textBefore: string): string[] {
  const vars: string[] = [];
  const re = /\bVAR\s+(\w+)\s*=/gi;
  let match;
  while ((match = re.exec(textBefore)) !== null) {
    vars.push(match[1]);
  }
  return vars;
}

/* ── DAX completion source ──────────────────────────────── */

export function daxCompletionSource(context: CompletionContext): CompletionResult | null {
  const doc = context.state.doc;
  const pos = context.pos;
  const line = doc.lineAt(pos);
  const textBefore = line.text.slice(0, pos - line.from);

  const options: Completion[] = [];

  // Check enclosing function for context boost
  const enclosingFunc = getEnclosingFunction(textBefore);
  const boostedCategories = new Set(
    enclosingFunc ? (CONTEXT_BOOST_MAP[enclosingFunc] ?? []) : []
  );

  // ── Table'[Column context ──
  const tableColMatch = textBefore.match(/'([^']+)'\s*\[([^\]]*)$/);
  if (tableColMatch) {
    const tableName = tableColMatch[1];
    const partial = tableColMatch[2];
    const from = pos - partial.length;

    const columns = store.getColumns(tableName);
    for (const col of columns) {
      options.push({
        label: col.name + ']',
        displayLabel: col.name,
        detail: `${col.dataType}`,
        type: 'property',
        boost: 10,
        apply: col.name + ']',
      });
    }

    const measures = store.getMeasures(tableName);
    for (const m of measures) {
      options.push({
        label: m.name + ']',
        displayLabel: m.name,
        detail: t('ac.measure'),
        type: 'method',
        info: m.expression ? `= ${m.expression}` : undefined,
        boost: 9,
        apply: m.name + ']',
      });
    }

    // Related table columns
    const relatedTables = store.getRelatedTables(tableName);
    for (const rel of relatedTables) {
      if (!rel.isActive) continue;
      const relColumns = store.getColumns(rel.table);
      for (const col of relColumns) {
        options.push({
          label: col.name + ']',
          displayLabel: col.name,
          detail: `${col.dataType} (${rel.table})`,
          type: 'property',
          boost: 5,
          apply: col.name + ']',
        });
      }
    }

    return options.length > 0 ? { from, options } : null;
  }

  // ── Standalone [Column context ──
  const bracketMatch = textBefore.match(/\[([^\]]*)$/);
  if (bracketMatch) {
    const partial = bracketMatch[1];
    const from = pos - partial.length;

    const allMeasures = store.getAllMeasureNames();
    for (const m of allMeasures) {
      options.push({
        label: m.name + ']',
        displayLabel: m.name,
        detail: `${t('ac.measure')} - ${m.table}`,
        type: 'method',
        boost: 10,
        apply: m.name + ']',
      });
    }

    const allColumns = store.getAllColumnNames();
    for (const col of allColumns) {
      options.push({
        label: col.name + ']',
        displayLabel: col.name,
        detail: `${col.dataType} - ${col.table}`,
        type: 'property',
        boost: 8,
        apply: col.name + ']',
      });
    }

    return options.length > 0 ? { from, options } : null;
  }

  // ── Word-based completions ──
  const wordMatch = textBefore.match(/[a-zA-Z_]\w*$/);
  if (!wordMatch && !context.explicit) return null;

  const from = wordMatch ? pos - wordMatch[0].length : pos;
  const word = wordMatch ? wordMatch[0] : '';

  // Model tables
  const dataModel = store.getModel();
  if (dataModel) {
    const tableNames = store.getAllTableNames();
    for (const name of tableNames) {
      const table = store.getTable(name)!;
      const stats = `${table.columns.length}c / ${table.measures.length}m`;
      options.push({
        label: `'${name}'`,
        detail: `${t('ac.table')} - ${stats}`,
        type: 'class',
        boost: 8,
      });
    }

    // General column/measure suggestions when typed ≥2 chars
    if (word.length >= 2) {
      const allColumns = store.getAllColumnNames();
      for (const col of allColumns) {
        options.push({
          label: `'${col.table}'[${col.name}]`,
          detail: `${t('ac.column')} - ${col.dataType}`,
          type: 'property',
          boost: 6,
        });
      }
      const allMeasures = store.getAllMeasureNames();
      for (const m of allMeasures) {
        options.push({
          label: `[${m.name}]`,
          detail: `${t('ac.measure')} - ${m.table}`,
          type: 'method',
          boost: 6,
        });
      }
    }
  }

  // VAR variable suggestions
  const varNames = extractVarNames(doc.sliceString(0, pos));
  for (const v of varNames) {
    options.push({
      label: v,
      detail: t('ac.var'),
      type: 'variable',
      boost: 12,
    });
  }

  // Function suggestions with snippets
  for (const func of getAllFunctions()) {
    const params = func.params
      .filter((p) => p.required !== false)
      .map((p) => `\${${p.name}}`);

    const template = params.length > 0
      ? `${func.name}(${params.join(', ')})`
      : `${func.name}(\${})`;

    const isBoosted = boostedCategories.has(func.category);

    options.push(snippetCompletion(template, {
      label: func.name,
      detail: func.category,
      info: func.description_short,
      type: 'function',
      boost: isBoosted ? 7 : 3,
    }));
  }

  // Keyword suggestions with snippets
  const keywordSnippets: Array<{ label: string; template: string; detail: string }> = [
    { label: 'VAR', template: 'VAR ${name} = ${expression}', detail: t('ac.var') },
    { label: 'RETURN', template: 'RETURN\n    ${}', detail: t('ac.return') },
    { label: 'TRUE', template: 'TRUE', detail: t('ac.true') },
    { label: 'FALSE', template: 'FALSE', detail: t('ac.false') },
    { label: 'BLANK', template: 'BLANK()', detail: t('ac.blank') },
    { label: 'DEFINE', template: 'DEFINE\n    MEASURE ${table}[${name}] = ${expression}', detail: t('ac.define') },
    { label: 'EVALUATE', template: 'EVALUATE\n    ${}', detail: t('ac.evaluate') },
  ];

  for (const kw of keywordSnippets) {
    options.push(snippetCompletion(kw.template, {
      label: kw.label,
      detail: kw.detail,
      type: 'keyword',
      boost: 2,
    }));
  }

  // Common patterns
  const patterns: Array<{ label: string; template: string; detail: string }> = [
    {
      label: 'VAR...RETURN',
      template: 'VAR ${name} = ${expression}\nRETURN\n    ${result}',
      detail: t('ac.var_return'),
    },
    {
      label: 'CALCULATE pattern',
      template: 'CALCULATE(\n    ${expression},\n    ${filter}\n)',
      detail: t('ac.calc_pattern'),
    },
    {
      label: 'SWITCH TRUE pattern',
      template: 'SWITCH(\n    TRUE(),\n    ${condition1}, ${result1},\n    ${condition2}, ${result2},\n    ${default}\n)',
      detail: t('ac.switch_pattern'),
    },
  ];

  for (const p of patterns) {
    options.push(snippetCompletion(p.template, {
      label: p.label,
      detail: p.detail,
      type: 'text',
      boost: 1,
    }));
  }

  return { from, options, validFor: /^[a-zA-Z_]\w*$/ };
}
