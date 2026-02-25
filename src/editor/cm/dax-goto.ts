/* ── Go-to-Definition ──────────────────────────────────── */

/**
 * Provides go-to-definition for:
 * - VAR references → jumps to the VAR declaration line
 * - Measure references [Name] → shows measure expression in tooltip
 *
 * Triggered via F12 or Ctrl+Click.
 */

import { type Command, EditorView, keymap, type KeyBinding, showTooltip, type Tooltip } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { tokenize } from '../../linter/lexer';
import { TokenType } from '../../types';
import * as store from '../../model/store';

/* ── Tooltip state for measure definitions ──────────── */

const setGotoTooltip = StateEffect.define<Tooltip | null>();

const gotoTooltipField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setGotoTooltip)) return e.value;
    }
    // Dismiss tooltip on any document or selection change
    if (tr.docChanged || tr.selection) return null;
    return value;
  },
  provide: (field) => showTooltip.computeN([field], (state) => {
    const tip = state.field(field);
    return tip ? [tip] : [];
  }),
});

/* ── Core logic ─────────────────────────────────────── */

interface VarDecl {
  name: string;
  line: number;
  col: number;
}

function findVarDeclarations(source: string): VarDecl[] {
  const tokens = tokenize(source);
  const nonWS = tokens.filter(
    (t) => t.type !== TokenType.Whitespace &&
           t.type !== TokenType.LineComment &&
           t.type !== TokenType.BlockComment &&
           t.type !== TokenType.EOF,
  );

  const vars: VarDecl[] = [];
  for (let i = 0; i < nonWS.length; i++) {
    if (nonWS[i].type === TokenType.Keyword && nonWS[i].value.toUpperCase() === 'VAR') {
      if (i + 1 < nonWS.length && nonWS[i + 1].type === TokenType.Identifier) {
        vars.push({
          name: nonWS[i + 1].value,
          line: nonWS[i].line,
          col: nonWS[i].col,
        });
      }
    }
  }
  return vars;
}

function getWordAtOffset(view: EditorView, pos: number): { word: string; from: number; to: number } | null {
  const line = view.state.doc.lineAt(pos);
  const col0 = pos - line.from;
  const lineText = line.text;

  const wordRegex = /[a-zA-Z_]\w*/g;
  let match;
  while ((match = wordRegex.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (col0 >= start && col0 <= end) {
      return { word: match[0], from: line.from + start, to: line.from + end };
    }
  }
  return null;
}

function getColumnRefAtOffset(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos);
  const col0 = pos - line.from;
  const text = line.text;

  // Find enclosing [...]
  let start = col0;
  while (start >= 0 && text[start] !== '[') start--;
  if (start < 0) return null;

  let end = col0;
  while (end < text.length && text[end] !== ']') end++;
  if (end >= text.length) return null;

  if (col0 <= start || col0 > end) return null;
  return text.substring(start + 1, end);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Command ────────────────────────────────────────── */

const gotoDefinition: Command = (view) => {
  const pos = view.state.selection.main.head;
  const source = view.state.doc.toString();

  // 1. Try VAR go-to-definition
  const wordInfo = getWordAtOffset(view, pos);
  if (wordInfo) {
    const vars = findVarDeclarations(source);
    const target = vars.find((v) => v.name.toUpperCase() === wordInfo.word.toUpperCase());
    if (target) {
      // Don't jump if we're already on the declaration
      const targetLine = view.state.doc.line(target.line);
      const targetPos = targetLine.from + target.col - 1;
      if (targetPos !== wordInfo.from) {
        view.dispatch({
          selection: { anchor: targetPos },
          effects: EditorView.scrollIntoView(targetPos, { y: 'center' }),
        });
        return true;
      }
    }
  }

  // 2. Try measure go-to-definition (show tooltip with expression)
  const colName = getColumnRefAtOffset(view, pos);
  if (colName) {
    const allMeasures = store.getAllMeasureNames();
    const match = allMeasures.find((m) => m.name.toUpperCase() === colName.toUpperCase());
    if (match) {
      const table = store.getTable(match.table);
      const measure = table?.measures.find((m) => m.name.toUpperCase() === colName.toUpperCase());
      if (measure?.expression) {
        view.dispatch({
          effects: setGotoTooltip.of({
            pos,
            above: true,
            create() {
              const dom = document.createElement('div');
              dom.className = 'cm-dax-hover';
              dom.innerHTML = `<strong>${esc(measure.name)}</strong> <em>(${esc(match.table)})</em><br/><code style="white-space:pre-wrap">= ${esc(measure.expression)}</code>`;
              return { dom };
            },
          }),
        });
        return true;
      }
    }
  }

  return false;
};

/* ── Ctrl+Click handler ─────────────────────────────── */

const ctrlClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    if (!(event.ctrlKey || event.metaKey)) return false;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;

    // Place cursor at click position, then run gotoDefinition
    view.dispatch({ selection: { anchor: pos } });
    return gotoDefinition(view);
  },
});

/* ── Keybinding ─────────────────────────────────────── */

const gotoKeymap: KeyBinding[] = [
  { key: 'F12', run: gotoDefinition },
];

/* ── Export extension ──────────────────────────────── */

export const daxGotoDefinition = [
  gotoTooltipField,
  ctrlClickHandler,
  keymap.of(gotoKeymap),
];
