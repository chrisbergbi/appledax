import { EditorState, type Extension, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, highlightSpecialChars } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, acceptCompletion } from '@codemirror/autocomplete';
import { lintGutter } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';

import { daxLanguage } from './dax-language';
import { darkTheme, lightTheme } from './dax-theme';
import { daxCompletionSource } from './dax-completions';
import { daxHoverTooltip } from './dax-hover';
import { daxLinter } from './dax-lint';
import type { EditorAdapter, EditorRange } from '../editor-interface';

/* ── Theme compartment for dynamic switching ────────────── */

const themeCompartment = new Compartment();

/* ── Default DAX code ───────────────────────────────────── */

function getDefaultDaxCode(): string {
  return `// DAX Measure Example - Total Sales with Discount
Total Sales After Discount =
VAR SalesAmount = SUM(Sales[Amount])
VAR TotalDiscount = SUM(Sales[Discount])
VAR NetSales = SalesAmount - TotalDiscount
RETURN
    IF(
        NetSales > 0,
        NetSales,
        BLANK()
    )

// Year-over-Year Growth %
YoY Growth % =
VAR CurrentSales = [Total Sales After Discount]
VAR PriorYearSales =
    CALCULATE(
        [Total Sales After Discount],
        SAMEPERIODLASTYEAR('Date'[Date])
    )
RETURN
    DIVIDE(
        CurrentSales - PriorYearSales,
        PriorYearSales
    )
`;
}

/* ── Create the CM6 editor ──────────────────────────────── */

export function createEditor(container: HTMLElement, initialTheme: 'dark' | 'light' = 'dark'): CodeMirrorAdapter {
  const themeExtension = initialTheme === 'light' ? lightTheme : darkTheme;
  const adapter = new CodeMirrorAdapter();

  // Create the update listener that forwards to the adapter
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      adapter.notifyContentChange();
    }
    if (update.selectionSet) {
      adapter.notifyCursorChange();
    }
  });

  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    drawSelection(),
    highlightSpecialChars(),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({
      override: [daxCompletionSource],
      activateOnTyping: true,
      maxRenderedOptions: 50,
    }),
    highlightSelectionMatches(),
    lintGutter(),
    daxLanguage,
    daxLinter,
    daxHoverTooltip,
    themeCompartment.of(themeExtension),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      indentWithTab,
      { key: 'Tab', run: acceptCompletion },
    ]),
    EditorView.lineWrapping,
    EditorState.tabSize.of(4),
    updateListener,
  ];

  const state = EditorState.create({
    doc: getDefaultDaxCode(),
    extensions,
  });

  const view = new EditorView({
    state,
    parent: container,
  });

  adapter.setView(view);
  return adapter;
}

/* ── EditorAdapter implementation wrapping CM6 ──────────── */

export class CodeMirrorAdapter implements EditorAdapter {
  public view!: EditorView;
  private contentListeners: Array<() => void> = [];
  private cursorListeners: Array<(pos: { line: number; col: number }) => void> = [];

  /** Called from createEditor after view is created */
  setView(view: EditorView): void {
    this.view = view;
  }

  /** Called from the EditorView.updateListener extension */
  notifyContentChange(): void {
    for (const fn of this.contentListeners) fn();
  }

  /** Called from the EditorView.updateListener extension */
  notifyCursorChange(): void {
    if (!this.view) return;
    const pos = this.getCursorPosition();
    for (const fn of this.cursorListeners) fn(pos);
  }

  getValue(): string {
    return this.view.state.doc.toString();
  }

  setValue(text: string): void {
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: text,
      },
    });
  }

  getCursorPosition(): { line: number; col: number } {
    const pos = this.view.state.selection.main.head;
    const line = this.view.state.doc.lineAt(pos);
    return {
      line: line.number,
      col: pos - line.from + 1,
    };
  }

  setCursorPosition(line: number, col: number): void {
    try {
      const lineInfo = this.view.state.doc.line(line);
      const pos = lineInfo.from + Math.min(col - 1, lineInfo.length);
      this.view.dispatch({
        selection: { anchor: pos },
      });
    } catch {
      // Line out of range
    }
  }

  revealLine(line: number): void {
    try {
      const lineInfo = this.view.state.doc.line(line);
      this.view.dispatch({
        effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
      });
    } catch {
      // Line out of range
    }
  }

  focus(): void {
    this.view.focus();
  }

  replaceRange(range: EditorRange, text: string): void {
    try {
      const from = this.view.state.doc.line(range.startLine).from + range.startCol - 1;
      const to = this.view.state.doc.line(range.endLine).from + range.endCol - 1;
      this.view.dispatch({
        changes: { from, to, insert: text },
      });
    } catch {
      // Range out of bounds
    }
  }

  insertAtCursor(text: string): void {
    const pos = this.view.state.selection.main.head;
    this.view.dispatch({
      changes: { from: pos, to: pos, insert: text },
      selection: { anchor: pos + text.length },
    });
  }

  getWordAtPosition(pos: { line: number; col: number }): { word: string; startCol: number; endCol: number } | null {
    try {
      const lineInfo = this.view.state.doc.line(pos.line);
      const lineText = lineInfo.text;
      const col0 = pos.col - 1;

      const wordRegex = /[a-zA-Z_]\w*/g;
      let match;
      while ((match = wordRegex.exec(lineText)) !== null) {
        if (col0 >= match.index && col0 <= match.index + match[0].length) {
          return {
            word: match[0],
            startCol: match.index + 1,
            endCol: match.index + match[0].length + 1,
          };
        }
      }
    } catch {
      // Position out of range
    }
    return null;
  }

  getLineContent(line: number): string {
    try {
      return this.view.state.doc.line(line).text;
    } catch {
      return '';
    }
  }

  getLineCount(): number {
    return this.view.state.doc.lines;
  }

  onContentChange(fn: () => void): void {
    this.contentListeners.push(fn);
  }

  onCursorChange(fn: (pos: { line: number; col: number }) => void): void {
    this.cursorListeners.push(fn);
  }

  setTheme(theme: 'dark' | 'light'): void {
    const ext = theme === 'light' ? lightTheme : darkTheme;
    this.view.dispatch({
      effects: themeCompartment.reconfigure(ext),
    });
  }

  dispose(): void {
    this.view.destroy();
    this.contentListeners = [];
    this.cursorListeners = [];
  }
}
