import * as monaco from 'monaco-editor';
import { tokenize } from './lexer';
import { allRules } from './rules/index';
import type { LintDiagnostic } from '../types';
import { onModelChange } from '../model/store';

export class LintEngine {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _diagnostics: LintDiagnostic[] = [];
  private listeners: Array<(diagnostics: LintDiagnostic[]) => void> = [];

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor;

    editor.onDidChangeModelContent(() => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.lint(), 300);
    });

    // Re-lint when model data changes (e.g. TMDL upload)
    onModelChange(() => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.lint(), 100);
    });

    // Initial lint
    setTimeout(() => this.lint(), 100);
  }

  private lint(): void {
    const model = this.editor.getModel();
    if (!model) return;

    const source = model.getValue();

    let tokens;
    try {
      tokens = tokenize(source);
    } catch {
      // If tokenizer fails, clear diagnostics
      this._diagnostics = [];
      monaco.editor.setModelMarkers(model, 'dax-linter', []);
      this.notify();
      return;
    }

    this._diagnostics = [];
    for (const rule of allRules) {
      try {
        const results = rule(tokens, source);
        this._diagnostics.push(...results);
      } catch {
        // Skip failing rules silently
      }
    }

    // Sort diagnostics by line then column
    this._diagnostics.sort((a, b) => a.startLine - b.startLine || a.startCol - b.startCol);

    // Convert to Monaco markers
    const markers: monaco.editor.IMarkerData[] = this._diagnostics.map((d) => ({
      severity: this.toMonacoSeverity(d.severity),
      message: d.message,
      startLineNumber: d.startLine,
      startColumn: d.startCol,
      endLineNumber: d.endLine,
      endColumn: d.endCol,
      source: 'dax-linter',
      code: d.ruleId,
    }));

    monaco.editor.setModelMarkers(model, 'dax-linter', markers);
    this.notify();
  }

  private toMonacoSeverity(severity: string): monaco.MarkerSeverity {
    switch (severity) {
      case 'error': return monaco.MarkerSeverity.Error;
      case 'warning': return monaco.MarkerSeverity.Warning;
      case 'info': return monaco.MarkerSeverity.Info;
      default: return monaco.MarkerSeverity.Hint;
    }
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn(this._diagnostics);
    }
  }

  onDiagnosticsChanged(fn: (diagnostics: LintDiagnostic[]) => void): void {
    this.listeners.push(fn);
  }

  get diagnostics(): LintDiagnostic[] {
    return this._diagnostics;
  }
}
