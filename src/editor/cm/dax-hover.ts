import { hoverTooltip, type Tooltip } from '@codemirror/view';
import { getFunctionByName, getKeywordHelp } from '../../knowledge/lookup';
import { t } from '../../i18n/index';
import * as store from '../../model/store';

/* ── Pure helper functions (reused from old hover.ts) ───── */

function getTableRefAtPosition(line: string, col0: number): string | null {
  let start = col0;
  while (start >= 0 && line[start] !== "'") start--;
  if (start < 0) return null;

  let end = col0;
  while (end < line.length && line[end] !== "'") end++;
  if (line[start] !== "'" || end >= line.length) return null;
  if (col0 <= start || col0 > end) return null;

  return line.substring(start + 1, end);
}

function getColumnRefAtPosition(line: string, col0: number): { name: string; bracketStart: number } | null {
  let start = col0;
  while (start >= 0 && line[start] !== '[') start--;
  if (start < 0) return null;

  let end = col0;
  while (end < line.length && line[end] !== ']') end++;
  if (end >= line.length) return null;
  if (col0 <= start || col0 > end) return null;

  return {
    name: line.substring(start + 1, end),
    bracketStart: start,
  };
}

function getPrecedingTableRef(line: string, bracketStart: number): string | null {
  let pos = bracketStart - 1;
  if (pos < 0 || line[pos] !== "'") return null;
  pos--;
  const end = pos;
  while (pos >= 0 && line[pos] !== "'") pos--;
  if (pos < 0) return null;
  return line.substring(pos + 1, end + 1);
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── CM6 hover tooltip provider ─────────────────────────── */

export const daxHoverTooltip = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const col0 = pos - line.from; // 0-based column
  const lineText = line.text;

  // ── Model-aware hover: table references ──
  const dataModel = store.getModel();
  if (dataModel) {
    const tableRefName = getTableRefAtPosition(lineText, col0);
    if (tableRefName) {
      const table = store.getTable(tableRefName);
      if (table) {
        return {
          pos,
          above: true,
          create() {
            const dom = document.createElement('div');
            dom.className = 'cm-dax-hover';
            dom.innerHTML = `
              <strong>${esc(table.name)}</strong> <em>${t('hover.table')}</em><br/>
              ${t('hover.columns', { count: table.columns.length })}, ${t('hover.measures', { count: table.measures.length })}
            `;
            return { dom };
          },
        } as Tooltip;
      }
    }

    // Column references
    const colRef = getColumnRefAtPosition(lineText, col0);
    if (colRef) {
      const tableName = getPrecedingTableRef(lineText, colRef.bracketStart);
      if (tableName) {
        const table = store.getTable(tableName);
        if (table) {
          const col = table.columns.find((c) => c.name.toUpperCase() === colRef.name.toUpperCase());
          if (col) {
            return {
              pos,
              above: true,
              create() {
                const dom = document.createElement('div');
                dom.className = 'cm-dax-hover';
                dom.innerHTML = `
                  <strong>${esc(col.name)}</strong> <em>${t('hover.column_in', { table: tableName })}</em><br/>
                  ${t('hover.type', { type: col.dataType })}
                  ${col.description ? `<br/>${esc(col.description)}` : ''}
                `;
                return { dom };
              },
            } as Tooltip;
          }

          const measure = table.measures.find((m) => m.name.toUpperCase() === colRef.name.toUpperCase());
          if (measure) {
            return {
              pos,
              above: true,
              create() {
                const dom = document.createElement('div');
                dom.className = 'cm-dax-hover';
                dom.innerHTML = `
                  <strong>${esc(measure.name)}</strong> <em>${t('hover.measure_in', { table: tableName })}</em><br/>
                  <code>= ${esc(measure.expression)}</code>
                  ${measure.description ? `<br/>${esc(measure.description)}` : ''}
                `;
                return { dom };
              },
            } as Tooltip;
          }
        }
      }
    }
  }

  // ── Find word at position ──
  const wordRegex = /[a-zA-Z_]\w*/g;
  let match;
  while ((match = wordRegex.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (col0 >= start && col0 <= end) {
      const word = match[0];
      const wordUpper = word.toUpperCase();

      // Function hover
      const func = getFunctionByName(wordUpper);
      if (func) {
        return {
          pos: line.from + start,
          end: line.from + end,
          above: true,
          create() {
            const dom = document.createElement('div');
            dom.className = 'cm-dax-hover';

            let html = `<strong>${esc(func.name)}</strong> <em>(${esc(func.category)})</em><br/>`;
            html += `<code class="cm-dax-hover-sig">${esc(func.signatures.join('\n'))}</code><br/>`;
            html += `<span>${esc(func.description_short)}</span>`;

            if (func.params.length > 0) {
              html += `<br/><strong>${t('hover.parameters')}</strong>`;
              html += '<ul class="cm-dax-hover-params">';
              for (const p of func.params) {
                html += `<li><code>${esc(p.name)}</code> <em>(${esc(p.type)})</em> — ${esc(p.description)}</li>`;
              }
              html += '</ul>';
            }

            html += `<br/><strong>${t('hover.returns')}</strong> ${esc(func.returns)}`;

            if (func.notes.length > 0) {
              html += `<br/><em>${t('hover.notes')} ${esc(func.notes[0])}</em>`;
            }

            if (func.pitfalls.length > 0) {
              html += `<br/><em class="cm-dax-hover-pitfall">${t('hover.pitfall')} ${esc(func.pitfalls[0])}</em>`;
            }

            dom.innerHTML = html;
            return { dom };
          },
        } as Tooltip;
      }

      // Keyword hover
      const kwHelp = getKeywordHelp(wordUpper);
      if (kwHelp) {
        return {
          pos: line.from + start,
          end: line.from + end,
          above: true,
          create() {
            const dom = document.createElement('div');
            dom.className = 'cm-dax-hover';
            dom.innerHTML = `<strong>${esc(wordUpper)}</strong> <em>${t('hover.keyword')}</em><br/>${esc(kwHelp)}`;
            return { dom };
          },
        } as Tooltip;
      }

      break; // Only check the word under cursor
    }
  }

  return null;
});
