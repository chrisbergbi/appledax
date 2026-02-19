import * as monaco from 'monaco-editor';
import { createEditor } from './editor/setup';
import { LintEngine } from './linter/engine';
import { DiagnosticsPanel } from './panels/diagnostics';
import { FunctionHelpPanel } from './panels/function-help';
import { BestPracticesPanel } from './panels/best-practices';
import { ModelBrowserPanel } from './panels/model-browser';
import { ExpressionLibraryPanel } from './panels/expression-library';
import { setLocale, applyTranslations, t } from './i18n/index';
import './styles/main.css';

// Initialize i18n (Dutch by default)
setLocale('nl');

// Theme: restore saved preference
const THEME_KEY = 'dax-validator-theme';
const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
if (savedTheme === 'light') {
  document.documentElement.setAttribute('data-theme', 'light');
}

// Initialize editor
const editorContainer = document.getElementById('editor-pane')!;
const editor = createEditor(editorContainer);

// Apply saved theme to Monaco editor + button icon
const themeBtn = document.getElementById('btn-theme');
if (savedTheme === 'light') {
  monaco.editor.setTheme('dax-light');
  if (themeBtn) themeBtn.innerHTML = '&#9728;'; // ☀ sun
}

// Theme toggle handler
function applyTheme(theme: string): void {
  document.documentElement.classList.add('theme-transitioning');
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    monaco.editor.setTheme('dax-light');
    if (themeBtn) themeBtn.innerHTML = '&#9728;'; // ☀ sun
  } else {
    document.documentElement.removeAttribute('data-theme');
    monaco.editor.setTheme('dax-dark');
    if (themeBtn) themeBtn.innerHTML = '&#9790;'; // ☾ moon
  }
  localStorage.setItem(THEME_KEY, theme);
  setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 350);
}

themeBtn?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'light' ? 'dark' : 'light');
});

// Initialize linter
const lintEngine = new LintEngine(editor);

// Initialize panels
new DiagnosticsPanel(editor, lintEngine);
new FunctionHelpPanel(editor);
new BestPracticesPanel();
new ModelBrowserPanel(editor);
const expressionLibrary = new ExpressionLibraryPanel(editor);

// Apply translations to data-i18n elements
applyTranslations();

// Ctrl+S to save expression
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    expressionLibrary.saveCurrentExpression();
  }
});

// Side panel tab switching
document.querySelectorAll<HTMLElement>('#side-tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    // Deactivate all tabs and panels
    document.querySelectorAll('#side-tabs .tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('#side-content .panel-content').forEach((p) => p.classList.remove('active'));

    // Activate clicked tab and corresponding panel
    tab.classList.add('active');
    const panelId = tab.dataset.panel;
    if (panelId) {
      document.getElementById(`${panelId}-panel`)?.classList.add('active');
    }
  });
});

// Toolbar: Copy button
document.getElementById('btn-copy')?.addEventListener('click', () => {
  const model = editor.getModel();
  if (model) {
    navigator.clipboard.writeText(model.getValue()).then(() => {
      const btn = document.getElementById('btn-copy');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = t('app.copied');
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    });
  }
});

// Toolbar: Format button (basic indentation formatting)
document.getElementById('btn-format')?.addEventListener('click', () => {
  const model = editor.getModel();
  if (!model) return;

  const source = model.getValue();
  const formatted = formatDax(source);
  editor.executeEdits('format', [{
    range: model.getFullModelRange(),
    text: formatted,
  }]);
});

function formatDax(source: string): string {
  // Step 1: Normalize — collapse to a single line per logical statement,
  // preserving comment lines and blank line separators.
  const rawLines = source.split('\n');
  const chunks: string[] = [];
  let buf = '';

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (buf) { chunks.push(buf); buf = ''; }
      chunks.push('');
      continue;
    }
    if (trimmed.startsWith('//')) {
      if (buf) { chunks.push(buf); buf = ''; }
      chunks.push(trimmed);
      continue;
    }
    buf = buf ? buf + ' ' + trimmed : trimmed;
  }
  if (buf) chunks.push(buf);

  // Step 2: Expand — split on structural tokens and re-indent
  const output: string[] = [];
  let indent = 0;
  const TAB = '    ';

  for (const chunk of chunks) {
    if (!chunk) { output.push(''); continue; }
    if (chunk.startsWith('//')) { output.push(TAB.repeat(indent) + chunk); continue; }

    // Tokenize into meaningful pieces, respecting strings and brackets
    const tokens = tokenizeForFormat(chunk);
    formatTokens(tokens, output, indent);

    // Indent tracking is handled inside formatTokens
  }

  return output.join('\n');
}

function tokenizeForFormat(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // String literal
    if (ch === '"') {
      current += ch; i++;
      while (i < input.length && input[i] !== '"') { current += input[i]; i++; }
      if (i < input.length) { current += input[i]; i++; }
      continue;
    }

    // Table ref 'name'
    if (ch === "'") {
      current += ch; i++;
      while (i < input.length && input[i] !== "'") { current += input[i]; i++; }
      if (i < input.length) { current += input[i]; i++; }
      continue;
    }

    // Column ref [name]
    if (ch === '[') {
      current += ch; i++;
      while (i < input.length && input[i] !== ']') { current += input[i]; i++; }
      if (i < input.length) { current += input[i]; i++; }
      continue;
    }

    // Open paren — emit what we have, then emit '('
    if (ch === '(') {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      tokens.push('(');
      i++; continue;
    }

    // Close paren
    if (ch === ')') {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      tokens.push(')');
      i++; continue;
    }

    // Comma — emit what we have, then emit ','
    if (ch === ',') {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      tokens.push(',');
      i++; continue;
    }

    current += ch;
    i++;
  }

  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

function formatTokens(tokens: string[], output: string[], startIndent: number): void {
  const TAB = '    ';
  let indent = startIndent;
  let lineBuffer = '';
  let parenDepth = 0;

  function flushLine(): void {
    if (lineBuffer.trim()) {
      output.push(TAB.repeat(indent) + lineBuffer.trim());
    }
    lineBuffer = '';
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const upper = tok.toUpperCase();

    if (tok === '(') {
      parenDepth++;
      lineBuffer += '(';
      flushLine();
      indent++;
      continue;
    }

    if (tok === ')') {
      parenDepth--;
      flushLine();
      indent = Math.max(startIndent, indent - 1);
      lineBuffer = ')';
      // If next token is comma or another close paren, don't flush yet
      const next = tokens[i + 1];
      if (!next || (next !== ',' && next !== ')')) {
        flushLine();
      }
      continue;
    }

    if (tok === ',') {
      lineBuffer += ',';
      flushLine();
      continue;
    }

    // Keywords that should start a new line: VAR, RETURN
    if (upper === 'VAR' || upper.startsWith('VAR ')) {
      flushLine();
      lineBuffer = tok;
      flushLine();
      indent = Math.max(startIndent, indent);
      continue;
    }

    if (upper === 'RETURN' || upper.startsWith('RETURN ')) {
      flushLine();
      // RETURN should be at same level as its VAR
      const retIndent = Math.max(startIndent, indent);
      output.push(TAB.repeat(retIndent) + tok);
      indent = retIndent + 1;
      continue;
    }

    // Regular content
    if (lineBuffer) {
      lineBuffer += ' ' + tok;
    } else {
      lineBuffer = tok;
    }
  }

  flushLine();
}
