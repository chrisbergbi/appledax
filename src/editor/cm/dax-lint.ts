import { linter, type Diagnostic } from '@codemirror/lint';
import { tokenize } from '../../linter/lexer';
import { allRules } from '../../linter/rules/index';
import { applyLintConfig } from '../../linter/config';
import { recordLintRun } from '../../linter/metrics';
import type { LintDiagnostic } from '../../types';

/* ── Severity mapping ───────────────────────────────────── */

function toSeverity(s: string): 'error' | 'warning' | 'info' | 'hint' {
  switch (s) {
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'info': return 'info';
    default: return 'hint';
  }
}

/* ── Convert line/col positions to absolute offsets ────── */

function posToOffset(doc: { line(n: number): { from: number } }, line: number, col: number): number {
  try {
    const lineInfo = doc.line(line);
    return lineInfo.from + col - 1;
  } catch {
    return 0;
  }
}

/* ── Quick fix actions ──────────────────────────────────── */

function createActions(diag: LintDiagnostic, doc: { line(n: number): { from: number; text: string }; lineAt(pos: number): { from: number; text: string }; toString(): string }): Array<{ name: string; apply: (view: { dispatch: (spec: unknown) => void }) => void }> {
  const actions: Array<{ name: string; apply: (view: { dispatch: (spec: unknown) => void }) => void }> = [];

  if (diag.ruleId === 'divide-suggestion') {
    const lineInfo = doc.line(diag.startLine);
    const line = lineInfo.text;
    const divCol = diag.startCol - 1; // 0-based

    if (line[divCol] === '/') {
      // Scan backward for left operand
      let leftStart = divCol - 1;
      while (leftStart >= 0 && line[leftStart] === ' ') leftStart--;
      const leftTrimEnd = leftStart + 1;
      const leftChar = line[leftStart];
      if (leftChar === ')' || leftChar === ']') {
        let depth = 1;
        const open = leftChar === ')' ? '(' : '[';
        leftStart--;
        while (leftStart >= 0 && depth > 0) {
          if (line[leftStart] === leftChar) depth++;
          if (line[leftStart] === open) depth--;
          if (depth > 0) leftStart--;
        }
        if (open === '(' && leftStart > 0) {
          let fnStart = leftStart - 1;
          while (fnStart >= 0 && /[a-zA-Z_\w]/.test(line[fnStart])) fnStart--;
          leftStart = fnStart + 1;
        }
      } else {
        while (leftStart >= 0 && /[a-zA-Z0-9_.'[\]]/.test(line[leftStart])) leftStart--;
        leftStart++;
      }

      // Scan forward for right operand
      let rightStart = divCol + 1;
      while (rightStart < line.length && line[rightStart] === ' ') rightStart++;
      let rightEnd = rightStart;
      const rightChar = line[rightStart];
      if (rightChar === '(' || rightChar === '[') {
        let depth = 1;
        const close = rightChar === '(' ? ')' : ']';
        rightEnd++;
        while (rightEnd < line.length && depth > 0) {
          if (line[rightEnd] === rightChar) depth++;
          if (line[rightEnd] === close) depth--;
          rightEnd++;
        }
      } else {
        while (rightEnd < line.length && /[a-zA-Z0-9_.'[\]]/.test(line[rightEnd])) rightEnd++;
      }

      const leftOperand = line.substring(leftStart, leftTrimEnd).trim();
      const rightOperand = line.substring(rightStart, rightEnd).trim();

      if (leftOperand && rightOperand) {
        const replaceFrom = lineInfo.from + leftStart;
        const replaceTo = lineInfo.from + rightEnd;

        actions.push({
          name: `Fix: DIVIDE(${leftOperand}, ${rightOperand})`,
          apply(view) {
            view.dispatch({
              changes: { from: replaceFrom, to: replaceTo, insert: `DIVIDE(${leftOperand}, ${rightOperand})` },
            });
          },
        });
      }
    }
  }

  if (diag.ruleId === 'var-without-return') {
    const insertPos = posToOffset(doc, diag.startLine + 1, 1);
    actions.push({
      name: 'Fix: Add RETURN',
      apply(view) {
        view.dispatch({
          changes: { from: insertPos, to: insertPos, insert: 'RETURN\n    ' },
        });
      },
    });
  }

  // QuickFix from the diagnostic itself (if available)
  if (diag.quickFix) {
    const qf = diag.quickFix;
    const prefix = qf.safety === 'review' ? '[Review] ' : qf.safety === 'risky' ? '[Risky] ' : '';
    actions.push({
      name: `Fix: ${prefix}${qf.title}`,
      apply(view) {
        const changes = qf.edits.map((edit) => ({
          from: posToOffset(doc, edit.range.startLine, edit.range.startCol),
          to: posToOffset(doc, edit.range.endLine, edit.range.endCol),
          insert: edit.text,
        }));
        view.dispatch({ changes });
      },
    });
  }

  return actions;
}

/* ── Lint diagnostics cache for external consumption ───── */

let lastDiagnostics: LintDiagnostic[] = [];
const listeners: Array<(diags: LintDiagnostic[]) => void> = [];

export function getLastDiagnostics(): LintDiagnostic[] {
  return lastDiagnostics;
}

export function onDiagnosticsChanged(fn: (diags: LintDiagnostic[]) => void): void {
  listeners.push(fn);
}

function notifyListeners(): void {
  for (const fn of listeners) {
    fn(lastDiagnostics);
  }
}

/* ── CM6 linter extension ───────────────────────────────── */

export const daxLinter = linter((view) => {
  const doc = view.state.doc;
  const source = doc.toString();

  let tokens;
  try {
    tokens = tokenize(source);
  } catch {
    lastDiagnostics = [];
    notifyListeners();
    return [];
  }

  const lintDiags: LintDiagnostic[] = [];
  for (const rule of allRules) {
    try {
      lintDiags.push(...rule(tokens, source));
    } catch {
      // Skip failing rules
    }
  }

  // Sort by position
  lintDiags.sort((a, b) => a.startLine - b.startLine || a.startCol - b.startCol);
  const configuredDiags = applyLintConfig(lintDiags);
  recordLintRun(configuredDiags);

  // Store for external consumption (DiagnosticsPanel)
  lastDiagnostics = configuredDiags;
  notifyListeners();

  // Convert to CM6 Diagnostics
  const diagnostics: Diagnostic[] = [];
  for (const d of configuredDiags) {
    try {
      const from = posToOffset(doc, d.startLine, d.startCol);
      const to = posToOffset(doc, d.endLine, d.endCol);
      if (from >= to) continue;

      const actions = createActions(d, doc);

      diagnostics.push({
        from,
        to,
        severity: toSeverity(d.severity),
        message: d.message,
        source: d.ruleId,
        actions: actions.length > 0 ? actions as Diagnostic['actions'] : undefined,
      });
    } catch {
      // Skip diagnostics that can't be mapped
    }
  }

  return diagnostics;
}, {
  delay: 180,
});
