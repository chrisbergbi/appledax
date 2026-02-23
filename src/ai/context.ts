/* ── AI Context Builder ────────────────────────────────── */

/**
 * Builds a system prompt that gives the AI full context about
 * the user's current DAX code, data model, and diagnostics.
 *
 * Prioritizes tables referenced in the current code (full detail),
 * then summarizes others to stay within token limits.
 */

import * as store from '../model/store';
import { getLastDiagnostics } from '../editor/cm/dax-lint';
import type { EditorAdapter } from '../editor/editor-interface';
import { getPersonaPrompt } from './personas';

const MAX_CODE_CHARS = 3000;
const MAX_MODEL_TABLES = 40;
const MAX_COLS_PER_TABLE = 20;

/**
 * Build a rich system prompt for the AI assistant.
 */
export function buildSystemPrompt(editor: EditorAdapter): string {
  const parts: string[] = [];

  // Use the selected persona's system prompt
  parts.push(getPersonaPrompt(), '');

  // Current editor code
  const code = editor.getValue().trim();
  if (code) {
    const truncated = code.length > MAX_CODE_CHARS
      ? code.slice(0, MAX_CODE_CHARS) + '\n// ... (truncated)'
      : code;
    parts.push('## Current DAX code in the editor:', '```dax', truncated, '```', '');
  }

  // Data model summary
  const model = store.getModel();
  if (model) {
    const stats = store.getModelStats();
    const isDefault = store.isDefaultModel();
    const modelLabel = isDefault ? '(built-in default model)' : '(user-uploaded model)';
    parts.push(`## Loaded data model ${modelLabel}: ${stats.tables} tables, ${stats.columns} columns, ${stats.measures} measures, ${stats.relationships} relationships`);
    parts.push('');

    // Identify tables referenced in the current code for priority inclusion
    const referencedTables = new Set<string>();
    if (code) {
      for (const table of model.tables) {
        if (code.includes(`'${table.name}'`) || code.includes(`${table.name}[`)) {
          referencedTables.add(table.name.toUpperCase());
        }
      }
    }

    // Build model context: referenced tables first (full detail), then others (summary)
    const referencedList = model.tables.filter((t) => referencedTables.has(t.name.toUpperCase()));
    const otherTables = model.tables.filter((t) => !referencedTables.has(t.name.toUpperCase()));

    // Full detail for referenced tables
    if (referencedList.length > 0) {
      parts.push('### Tables referenced in current code:');
      for (const table of referencedList) {
        parts.push(formatTableFull(table));
      }
      parts.push('');
    }

    // Summary for other tables (limited to avoid token overflow)
    const remaining = otherTables.slice(0, MAX_MODEL_TABLES);
    if (remaining.length > 0) {
      parts.push('### Other tables in the model:');
      for (const table of remaining) {
        parts.push(formatTableSummary(table));
      }
      if (otherTables.length > MAX_MODEL_TABLES) {
        parts.push(`... and ${otherTables.length - MAX_MODEL_TABLES} more tables`);
      }
      parts.push('');
    }

    // Relationships
    const rels = store.getAllRelationships();
    if (rels.length > 0) {
      parts.push('### Relationships:');
      const relLines = rels.slice(0, 30).map((r) =>
        `  '${r.fromTable}'[${r.fromColumn}] → '${r.toTable}'[${r.toColumn}]${r.crossFilteringBehavior === 'bothDirections' ? ' (bi-di)' : ''}${r.isActive === false ? ' (inactive)' : ''}`
      );
      parts.push(...relLines);
      if (rels.length > 30) {
        parts.push(`  ... and ${rels.length - 30} more relationships`);
      }
      parts.push('');
    }
  }

  // Active diagnostics
  const diags = getLastDiagnostics();
  if (diags.length > 0) {
    const summary = diags.slice(0, 10).map((d) =>
      `[${d.severity}] Line ${d.startLine}: ${d.message}`
    ).join('\n');
    parts.push('## Current diagnostics:', summary, '');
  }

  return parts.join('\n');
}

/**
 * Full detail for a table (used for tables referenced in code).
 */
function formatTableFull(table: { name: string; columns: Array<{ name: string; dataType: string }>; measures: Array<{ name: string; expression: string }> }): string {
  const lines: string[] = [];
  lines.push(`**'${table.name}'**`);

  if (table.columns.length > 0) {
    const cols = table.columns.map((c) => `${c.name} (${c.dataType})`).join(', ');
    lines.push(`  Columns: ${cols}`);
  }
  if (table.measures.length > 0) {
    for (const m of table.measures) {
      const expr = m.expression ? ` = ${m.expression.slice(0, 100)}${m.expression.length > 100 ? '...' : ''}` : '';
      lines.push(`  Measure: ${m.name}${expr}`);
    }
  }

  return lines.join('\n');
}

/**
 * Summary for a table (column names only, no types).
 */
function formatTableSummary(table: { name: string; columns: Array<{ name: string }>; measures: Array<{ name: string }> }): string {
  const colCount = table.columns.length;
  const colPreview = table.columns.slice(0, MAX_COLS_PER_TABLE).map((c) => c.name).join(', ');
  const suffix = colCount > MAX_COLS_PER_TABLE ? `, ... (${colCount} total)` : '';
  let line = `'${table.name}' — ${colCount} cols: ${colPreview}${suffix}`;
  if (table.measures.length > 0) {
    line += ` | Measures: ${table.measures.map((m) => m.name).join(', ')}`;
  }
  return line;
}
