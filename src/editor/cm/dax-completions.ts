import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { snippetCompletion } from '@codemirror/autocomplete';
import { getAllFunctions, getFunctionByName } from '../../knowledge/lookup';
import { t } from '../../i18n/index';
import * as store from '../../model/store';
import { fuzzyMatchScore, loadRecencyMap, recordCompletionUsage, recencyBoost } from './completion-scoring';

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

interface ArgContextInfo {
  functionName: string;
  argIndex: number;
  expectedType: string | null;
}

function inferArgContext(textBefore: string): ArgContextInfo | null {
  let depth = 0;
  for (let pos = textBefore.length - 1; pos >= 0; pos--) {
    const ch = textBefore[pos];
    if (ch === ')') {
      depth++;
      continue;
    }
    if (ch !== '(') continue;
    if (depth > 0) {
      depth--;
      continue;
    }

    let fnEnd = pos;
    let p = pos - 1;
    while (p >= 0 && /\s/.test(textBefore[p])) p--;
    let fnStart = p;
    while (fnStart >= 0 && /[a-zA-Z0-9_.]/.test(textBefore[fnStart])) fnStart--;
    fnStart++;
    const functionName = textBefore.slice(fnStart, fnEnd).trim().toUpperCase();
    if (!functionName) return null;

    let argIndex = 0;
    let localDepth = 0;
    for (let i = pos + 1; i < textBefore.length; i++) {
      const c = textBefore[i];
      if (c === '(') localDepth++;
      else if (c === ')') localDepth = Math.max(0, localDepth - 1);
      else if (c === ',' && localDepth === 0) argIndex++;
    }

    const fn = getFunctionByName(functionName);
    const expectedType = fn?.params?.[Math.min(argIndex, Math.max(0, fn.params.length - 1))]?.type ?? null;
    return { functionName, argIndex, expectedType };
  }

  return null;
}

function trackCompletion(completion: Completion): Completion {
  const apply = completion.apply;
  const tracked = { ...completion };
  if (typeof apply === 'function') {
    tracked.apply = (view, comp, from, to) => {
      recordCompletionUsage(completion.label);
      apply(view, comp, from, to);
    };
    return tracked;
  }
  tracked.apply = (view, _comp, from, to) => {
    recordCompletionUsage(completion.label);
    const text = typeof apply === 'string' ? apply : completion.label;
    view.dispatch({ changes: { from, to, insert: text } });
  };
  return tracked;
}

/* ── DAX completion source ──────────────────────────────── */

export function daxCompletionSource(context: CompletionContext): CompletionResult | null {
  const doc = context.state.doc;
  const pos = context.pos;
  const line = doc.lineAt(pos);
  const textBefore = line.text.slice(0, pos - line.from);

  const options: Completion[] = [];
  const argContext = inferArgContext(doc.sliceString(0, pos));
  const recency = loadRecencyMap();

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
        boost: (argContext?.expectedType?.toLowerCase().includes('table') ? 12 : 8) + recencyBoost(`'${name}'`, recency) + fuzzyMatchScore(name, word),
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
            boost: (argContext?.expectedType?.toLowerCase().includes('column') ? 10 : 6) + recencyBoost(`'${col.table}'[${col.name}]`, recency) + fuzzyMatchScore(col.name, word),
          });
      }
      const allMeasures = store.getAllMeasureNames();
      for (const m of allMeasures) {
          options.push({
            label: `[${m.name}]`,
            detail: `${t('ac.measure')} - ${m.table}`,
            type: 'method',
            boost: (argContext?.expectedType?.toLowerCase().includes('scalar') ? 9 : 6) + recencyBoost(`[${m.name}]`, recency) + fuzzyMatchScore(m.name, word),
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
      boost: 12 + recencyBoost(v, recency) + fuzzyMatchScore(v, word),
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
    const expected = argContext?.expectedType?.toLowerCase() ?? '';
    const argTypeBoost = expected.includes('table') && func.returns.toLowerCase().includes('table')
      ? 9
      : expected.includes('scalar') && func.returns.toLowerCase().includes('scalar')
        ? 8
        : isBoosted
          ? 7
          : 3;

    options.push(snippetCompletion(template, {
      label: func.name,
      detail: `${func.category} • returns ${func.returns}`,
      info: func.description_short,
      type: 'function',
      boost: argTypeBoost + recencyBoost(func.name, recency) + fuzzyMatchScore(func.name, word),
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
      boost: 2 + recencyBoost(kw.label, recency) + fuzzyMatchScore(kw.label, word),
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
    {
      label: 'Safe DIVIDE',
      template: 'DIVIDE(${numerator}, ${denominator}, ${alternate_result})',
      detail: t('ac.divide_pattern'),
    },
    {
      label: 'SELECTEDVALUE default',
      template: 'SELECTEDVALUE(${column}, ${default_value})',
      detail: t('ac.selectedvalue_pattern'),
    },
    {
      label: 'Running total by date',
      template: 'CALCULATE(\n    ${measure},\n    FILTER(\n        ALL(${date_column}),\n        ${date_column} <= MAX(${date_column})\n    )\n)',
      detail: t('ac.running_total'),
    },
  ];

  for (const p of patterns) {
    options.push(snippetCompletion(p.template, {
      label: p.label,
      detail: p.detail,
      type: 'text',
      boost: 1 + recencyBoost(p.label, recency) + fuzzyMatchScore(p.label, word),
    }));
  }

  return { from, options: options.map(trackCompletion), validFor: /^[a-zA-Z_]\w*$/ };
}
