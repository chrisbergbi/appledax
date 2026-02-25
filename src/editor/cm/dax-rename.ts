/* ── Rename Variable ──────────────────────────────────── */

/**
 * Rename a VAR declaration and all its references in one action.
 * Triggered via F2 when cursor is on a VAR name (declaration or usage).
 */

import { type Command, EditorView, keymap, type KeyBinding } from '@codemirror/view';
import { tokenize } from '../../linter/lexer';
import { TokenType } from '../../types';

/* ── Core logic ─────────────────────────────────────── */

interface VarInfo {
  name: string;
  /** Absolute offsets of every occurrence (declaration + usages) */
  occurrences: Array<{ from: number; to: number }>;
}

function findVarOccurrences(source: string): VarInfo[] {
  const tokens = tokenize(source);
  const nonWS = tokens.filter(
    (t) => t.type !== TokenType.Whitespace &&
           t.type !== TokenType.LineComment &&
           t.type !== TokenType.BlockComment &&
           t.type !== TokenType.EOF,
  );

  // Collect VAR declarations
  const varNames: Array<{ name: string; nameUpper: string; declIndex: number }> = [];
  for (let i = 0; i < nonWS.length; i++) {
    if (nonWS[i].type === TokenType.Keyword && nonWS[i].value.toUpperCase() === 'VAR') {
      if (i + 1 < nonWS.length && nonWS[i + 1].type === TokenType.Identifier) {
        varNames.push({
          name: nonWS[i + 1].value,
          nameUpper: nonWS[i + 1].value.toUpperCase(),
          declIndex: i + 1,
        });
      }
    }
  }

  // For each VAR, collect all identifier occurrences with the same name
  return varNames.map((v) => {
    const occurrences: Array<{ from: number; to: number }> = [];
    for (let i = 0; i < nonWS.length; i++) {
      const t = nonWS[i];
      if (t.type === TokenType.Identifier && t.value.toUpperCase() === v.nameUpper) {
        occurrences.push({
          from: lineColToOffset(source, t.line, t.col),
          to: lineColToOffset(source, t.endLine, t.endCol),
        });
      }
    }
    return { name: v.name, occurrences };
  });
}

function lineColToOffset(source: string, line: number, col: number): number {
  let offset = 0;
  let currentLine = 1;
  for (let i = 0; i < source.length; i++) {
    if (currentLine === line) {
      return offset + col - 1;
    }
    if (source[i] === '\n') {
      currentLine++;
      offset = i + 1;
    }
  }
  // Last line
  return offset + col - 1;
}

/* ── Command ────────────────────────────────────────── */

const renameVariable: Command = (view) => {
  const pos = view.state.selection.main.head;
  const source = view.state.doc.toString();

  // Find the word under cursor
  const line = view.state.doc.lineAt(pos);
  const col0 = pos - line.from;
  const lineText = line.text;

  let targetWord: string | null = null;
  const wordRegex = /[a-zA-Z_]\w*/g;
  let match;
  while ((match = wordRegex.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (col0 >= start && col0 <= end) {
      targetWord = match[0];
      break;
    }
  }

  if (!targetWord) return false;

  // Check if this word is a known VAR (declaration or usage)
  const allVars = findVarOccurrences(source);
  const varInfo = allVars.find((v) => v.name.toUpperCase() === targetWord!.toUpperCase());
  if (!varInfo || varInfo.occurrences.length === 0) return false;

  // Prompt for new name
  const newName = prompt(`Rename "${varInfo.name}" to:`, varInfo.name);
  if (!newName || newName === varInfo.name || !/^[a-zA-Z_]\w*$/.test(newName)) return false;

  // Apply all replacements in a single transaction (bottom-to-top to preserve offsets)
  const changes = varInfo.occurrences
    .slice()
    .sort((a, b) => b.from - a.from) // reverse order
    .map((occ) => ({ from: occ.from, to: occ.to, insert: newName }));

  view.dispatch({ changes });
  return true;
};

/* ── Keybinding ─────────────────────────────────────── */

const renameKeymap: KeyBinding[] = [
  { key: 'F2', run: renameVariable },
];

/* ── Export extension ──────────────────────────────── */

export const daxRenameVariable = keymap.of(renameKeymap);
