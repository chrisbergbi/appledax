import { createEditor } from './editor/cm/setup';
import { DiagnosticsPanel } from './panels/diagnostics';
import { FunctionHelpPanel } from './panels/function-help';
import { BestPracticesPanel } from './panels/best-practices';
import { ModelBrowserPanel } from './panels/model-browser';
import { ExpressionLibraryPanel } from './panels/expression-library';
import { detectLocale, setLocale, getLocale, applyTranslations, t } from './i18n/index';
import type { Locale } from './i18n/index';
import './styles/main.css';

// Initialize i18n (detect from saved preference → browser language → 'en')
const initialLocale = detectLocale();
setLocale(initialLocale);

// Theme: restore saved preference
const THEME_KEY = 'appledax-theme';
const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
if (savedTheme === 'light') {
  document.documentElement.setAttribute('data-theme', 'light');
}

// Initialize editor
const editorContainer = document.getElementById('editor-pane')!;
const editor = createEditor(editorContainer, savedTheme as 'dark' | 'light');

// Apply saved theme to button icon
const themeBtn = document.getElementById('btn-theme');
if (savedTheme === 'light' && themeBtn) {
  themeBtn.innerHTML = '&#9728;'; // sun
}

// Theme toggle handler
function applyTheme(theme: string): void {
  document.documentElement.classList.add('theme-transitioning');
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    editor.setTheme('light');
    if (themeBtn) themeBtn.innerHTML = '&#9728;'; // sun
  } else {
    document.documentElement.removeAttribute('data-theme');
    editor.setTheme('dark');
    if (themeBtn) themeBtn.innerHTML = '&#9790;'; // moon
  }
  localStorage.setItem(THEME_KEY, theme);
  setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 350);
}

themeBtn?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'light' ? 'dark' : 'light');
});

/* ── Language toggle ────────────────────────────────── */
const LOCALE_LABELS: Record<Locale, string> = { nl: 'NL', en: 'EN' };
const langBtn = document.getElementById('btn-lang');

function updateLangButton(): void {
  if (langBtn) langBtn.textContent = LOCALE_LABELS[getLocale()] ?? 'EN';
}
updateLangButton();

// Re-render callback list — panels register here to refresh on locale change
const onLocaleChangeCallbacks: Array<() => void> = [];

langBtn?.addEventListener('click', () => {
  const next: Locale = getLocale() === 'nl' ? 'en' : 'nl';
  setLocale(next);
  updateLangButton();
  applyTranslations();
  for (const cb of onLocaleChangeCallbacks) cb();
});

// Initialize panels
const diagnosticsPanel = new DiagnosticsPanel(editor);
new FunctionHelpPanel(editor);
const bestPracticesPanel = new BestPracticesPanel();
const modelBrowserPanel = new ModelBrowserPanel(editor);
const expressionLibrary = new ExpressionLibraryPanel(editor);

// Register panels for locale change re-rendering
onLocaleChangeCallbacks.push(
  () => bestPracticesPanel.render(),
  () => modelBrowserPanel.render(),
  () => diagnosticsPanel.refresh(),
);

// Apply translations to data-i18n elements
applyTranslations();

// Ctrl+S to save expression
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    expressionLibrary.saveCurrentExpression();
  }
});

/* ── Status bar: toggle diagnostics dropdown ────────── */
const statusBar = document.getElementById('status-bar');
const statusToggle = document.getElementById('status-toggle');
const diagDropdown = document.getElementById('diagnostics-dropdown');

statusBar?.addEventListener('click', () => {
  const isHidden = diagDropdown?.classList.contains('hidden');
  if (isHidden) {
    diagDropdown?.classList.remove('hidden');
    statusToggle?.classList.add('open');
  } else {
    diagDropdown?.classList.add('hidden');
    statusToggle?.classList.remove('open');
  }
});

/* ── Drawer: tab switching + expand/collapse ─────────── */
const DRAWER_KEY = 'appledax-drawer';
const drawer = document.getElementById('drawer')!;
const drawerTabs = document.querySelectorAll<HTMLElement>('#drawer-tabs .drawer-tab');
let activeDrawerPanel: string | null = null;

function openDrawer(panelId: string): void {
  // Activate the correct panel
  document.querySelectorAll('#drawer-content .drawer-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById(`${panelId}-panel`)?.classList.add('active');

  // Expand the drawer
  drawer.classList.remove('collapsed');
  drawer.classList.add('expanded');
  activeDrawerPanel = panelId;

  // Highlight tab
  drawerTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.drawer === panelId);
  });

  localStorage.setItem(DRAWER_KEY, panelId);
}

function closeDrawer(): void {
  drawer.classList.remove('expanded');
  drawer.classList.add('collapsed');
  drawerTabs.forEach((tab) => tab.classList.remove('active'));
  activeDrawerPanel = null;
  localStorage.removeItem(DRAWER_KEY);
}

drawerTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const panelId = tab.dataset.drawer;
    if (!panelId) return;

    // If clicking the same tab, toggle the drawer
    if (activeDrawerPanel === panelId) {
      closeDrawer();
    } else {
      openDrawer(panelId);
    }
  });
});

// Restore drawer state from localStorage
const savedDrawer = localStorage.getItem(DRAWER_KEY);
if (savedDrawer) {
  openDrawer(savedDrawer);
}

/* ── Drawer: drag handle to resize ─────────────────── */
const drawerHandle = document.getElementById('drawer-handle');
let isDragging = false;
let startY = 0;
let startHeight = 0;

drawerHandle?.addEventListener('mousedown', (e) => {
  if (drawer.classList.contains('collapsed')) return;
  isDragging = true;
  startY = e.clientY;
  startHeight = drawer.offsetHeight;
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const delta = startY - e.clientY;
  const newHeight = Math.max(100, Math.min(startHeight + delta, window.innerHeight * 0.6));
  drawer.style.height = newHeight + 'px';
});

document.addEventListener('mouseup', () => {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

/* ── Welcome overlay ─────────────────────────────────── */
const WELCOME_KEY = 'appledax-welcome-dismissed';
const welcomeOverlay = document.getElementById('welcome-overlay');

if (!localStorage.getItem(WELCOME_KEY) && welcomeOverlay) {
  welcomeOverlay.classList.remove('hidden');

  // Template definitions
  const templates: Record<string, string> = {
    simple: `Total Sales =\nSUM('Sales'[Amount])`,
    yoy: `YoY Growth % =\nVAR CurrentYear = [Total Sales]\nVAR PreviousYear =\n    CALCULATE(\n        [Total Sales],\n        SAMEPERIODLASTYEAR('Calendar'[Date])\n    )\nRETURN\n    DIVIDE(\n        CurrentYear - PreviousYear,\n        PreviousYear\n    )`,
    calculate: `Filtered Sales =\nCALCULATE(\n    SUM('Sales'[Amount]),\n    'Product'[Category] = "Electronics",\n    'Calendar'[Year] = 2024\n)`,
  };

  // Template click handlers
  document.querySelectorAll<HTMLElement>('.welcome-template').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.template;
      if (key && templates[key]) {
        editor.setValue(templates[key]);
        editor.focus();
      }
      dismissWelcome();
    });
  });

  // Dismiss button
  document.getElementById('welcome-dismiss')?.addEventListener('click', () => {
    dismissWelcome();
    editor.focus();
  });
}

function dismissWelcome(): void {
  localStorage.setItem(WELCOME_KEY, '1');
  welcomeOverlay?.classList.add('hidden');
}

// Also dismiss welcome if user starts typing
editor.onContentChange(() => {
  if (welcomeOverlay && !welcomeOverlay.classList.contains('hidden')) {
    dismissWelcome();
  }
});

/* ── Toolbar: Copy button ──────────────────────────── */
document.getElementById('btn-copy')?.addEventListener('click', () => {
  const text = editor.getValue();
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btn-copy');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = t('app.copied');
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    });
  }
});

/* ── Toolbar: Format button ────────────────────────── */
document.getElementById('btn-format')?.addEventListener('click', () => {
  const source = editor.getValue();
  if (!source) return;

  const formatted = formatDax(source);
  editor.setValue(formatted);
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

    const tokens = tokenizeForFormat(chunk);
    formatTokens(tokens, output, indent);
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

    // Open paren
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

    // Comma
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
      lineBuffer += '(';
      flushLine();
      indent++;
      continue;
    }

    if (tok === ')') {
      flushLine();
      indent = Math.max(startIndent, indent - 1);
      lineBuffer = ')';
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
