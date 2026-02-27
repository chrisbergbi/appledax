export interface EditorRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface EditorAdapter {
  /** Get full editor content */
  getValue(): string;

  /** Replace full editor content */
  setValue(text: string): void;

  /** Get cursor position (1-based line and column) */
  getCursorPosition(): { line: number; col: number };

  /** Set cursor position (1-based) */
  setCursorPosition(line: number, col: number): void;

  /** Scroll to reveal a line */
  revealLine(line: number): void;

  /** Focus the editor */
  focus(): void;

  /** Replace a range of text */
  replaceRange(range: EditorRange, text: string): void;

  /** Insert text at the current cursor position */
  insertAtCursor(text: string): void;

  /** Get the word at a position (1-based) */
  getWordAtPosition(pos: { line: number; col: number }): { word: string; startCol: number; endCol: number } | null;

  /** Get content of a specific line (1-based) */
  getLineContent(line: number): string;

  /** Get total number of lines */
  getLineCount(): number;

  /** Register a callback for content changes */
  onContentChange(fn: () => void): void;

  /** Register a callback for cursor position changes */
  onCursorChange(fn: (pos: { line: number; col: number }) => void): void;

  /** Set the theme */
  setTheme(theme: 'dark' | 'light'): void;

  /** Force diagnostics/lint refresh */
  refreshDiagnostics(): void;

  /** Clean up */
  dispose(): void;
}
