/* ── AI Context Builder ────────────────────────────────── */

/**
 * Builds a system prompt that gives the AI full context about
 * the user's current DAX code, data model, and diagnostics.
 */

import * as store from '../model/store';
import { getLastDiagnostics } from '../editor/cm/dax-lint';
import type { EditorAdapter } from '../editor/editor-interface';

const MAX_CODE_CHARS = 3000;
const MAX_MODEL_CHARS = 2000;

/**
 * Build a rich system prompt for the AI assistant.
 */
export function buildSystemPrompt(editor: EditorAdapter): string {
  const parts: string[] = [];

  parts.push(
    'You are a DAX (Data Analysis Expressions) expert assistant embedded in APPLEDAX, a browser-based DAX editor for Power BI.',
    'Help the user write, debug, and optimize DAX measures and calculated columns.',
    'Be concise. When showing DAX code, use proper formatting with VAR/RETURN patterns.',
    '',
  );

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
    parts.push(`## Loaded data model (${stats.tables} tables, ${stats.columns} columns, ${stats.measures} measures, ${stats.relationships} relationships):`);

    let modelText = '';
    for (const table of model.tables) {
      let tableBlock = `Table: '${table.name}'\n`;
      tableBlock += `  Columns: ${table.columns.map((c) => `${c.name} (${c.dataType})`).join(', ')}\n`;
      if (table.measures.length > 0) {
        tableBlock += `  Measures: ${table.measures.map((m) => m.name).join(', ')}\n`;
      }

      if (modelText.length + tableBlock.length > MAX_MODEL_CHARS) {
        modelText += `... and ${model.tables.length - model.tables.indexOf(table)} more tables\n`;
        break;
      }
      modelText += tableBlock;
    }

    const rels = store.getAllRelationships();
    if (rels.length > 0) {
      const relSummary = rels.slice(0, 10).map((r) =>
        `'${r.fromTable}'[${r.fromColumn}] -> '${r.toTable}'[${r.toColumn}]${r.isActive === false ? ' (inactive)' : ''}`
      ).join('\n  ');
      modelText += `Relationships:\n  ${relSummary}\n`;
    }

    parts.push(modelText, '');
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
