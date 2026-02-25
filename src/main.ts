import { createEditor } from './editor/cm/setup';
import { DiagnosticsPanel } from './panels/diagnostics';
import { BestPracticesPanel } from './panels/best-practices';
import { ModelBrowserPanel } from './panels/model-browser';
import { ExpressionLibraryPanel } from './panels/expression-library';
import { AIAssistantPanel } from './panels/ai-assistant';
import { loadDefaultModel } from './model/default-model';
import { formatDax } from './formatter/index';
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
const themeIcon = themeBtn?.querySelector('.ab-icon');
if (savedTheme === 'light' && themeIcon) {
  themeIcon.innerHTML = '&#9728;'; // sun
}

// Theme toggle handler
function applyTheme(theme: string): void {
  document.documentElement.classList.add('theme-transitioning');
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    editor.setTheme('light');
    if (themeIcon) themeIcon.innerHTML = '&#9728;'; // sun
  } else {
    document.documentElement.removeAttribute('data-theme');
    editor.setTheme('dark');
    if (themeIcon) themeIcon.innerHTML = '&#9790;'; // moon
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
const langIcon = langBtn?.querySelector('.ab-lang-icon');

function updateLangButton(): void {
  if (langIcon) langIcon.textContent = LOCALE_LABELS[getLocale()] ?? 'EN';
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
const bestPracticesPanel = new BestPracticesPanel();
const modelBrowserPanel = new ModelBrowserPanel(editor);
const expressionLibrary = new ExpressionLibraryPanel(editor);
const aiAssistantPanel = new AIAssistantPanel(editor);

// Register panels for locale change re-rendering
onLocaleChangeCallbacks.push(
  () => bestPracticesPanel.render(),
  () => modelBrowserPanel.render(),
  () => diagnosticsPanel.refresh(),
  () => aiAssistantPanel.render(),
);

// Load the default model so the editor has schema context out of the box
loadDefaultModel();

// Apply translations to data-i18n elements
applyTranslations();

// Global keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl+S to save expression
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    expressionLibrary.saveCurrentExpression();
  }
  // Ctrl+B to toggle left sidebar
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault();
    toggleLeftSidebar();
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

/* ── Left Sidebar: panel switching ───────────────────── */
const LEFT_PANEL_KEY = 'appledax-left-panel';
const app = document.getElementById('app')!;
const leftSidebar = document.getElementById('left-sidebar')!;
const leftSidebarClose = document.getElementById('left-sidebar-close')!;
const activityBarBtns = document.querySelectorAll<HTMLElement>('#activity-bar .ab-btn[data-panel]');
const sidebarTabs = document.querySelectorAll<HTMLElement>('#left-sidebar-tabs .sidebar-tab');
let activeLeftPanel: string | null = null;
let lastLeftPanel: string = 'model-browser';

/** Check if viewport is at tablet/mobile breakpoint */
function isSmallScreen(): boolean {
  return window.matchMedia('(max-width: 1024px)').matches;
}

function switchLeftPanel(panelId: string): void {
  // Activate the correct panel content
  document.querySelectorAll('#left-sidebar-content .sidebar-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById(`${panelId}-panel`)?.classList.add('active');

  // Show sidebar if collapsed
  leftSidebar.classList.remove('collapsed');
  app.classList.remove('left-collapsed');
  activeLeftPanel = panelId;

  // On small screens, only one sidebar at a time
  if (isSmallScreen() && !app.classList.contains('right-collapsed')) {
    closeRightSidebar();
  }
  lastLeftPanel = panelId;

  // Sync activity bar highlights
  activityBarBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.panel === panelId);
  });

  // Sync sidebar tab highlights
  sidebarTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.panel === panelId);
  });

  localStorage.setItem(LEFT_PANEL_KEY, panelId);
}

function closeLeftSidebar(): void {
  leftSidebar.classList.add('collapsed');
  app.classList.add('left-collapsed');
  activityBarBtns.forEach((btn) => btn.classList.remove('active'));
  sidebarTabs.forEach((tab) => tab.classList.remove('active'));
  activeLeftPanel = null;
  localStorage.removeItem(LEFT_PANEL_KEY);
}

function toggleLeftSidebar(): void {
  if (activeLeftPanel) {
    closeLeftSidebar();
  } else {
    switchLeftPanel(lastLeftPanel);
  }
}

// Activity bar buttons: toggle sidebar or switch panel
activityBarBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const panelId = btn.dataset.panel;
    if (!panelId) return;

    if (activeLeftPanel === panelId) {
      closeLeftSidebar();
    } else {
      switchLeftPanel(panelId);
    }
  });
});

// Sidebar tabs: always switch panel (never close)
sidebarTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const panelId = tab.dataset.panel;
    if (!panelId) return;
    switchLeftPanel(panelId);
  });
});

leftSidebarClose.addEventListener('click', closeLeftSidebar);

// Migrate old drawer localStorage
const oldDrawerKey = 'appledax-drawer';
const oldDrawer = localStorage.getItem(oldDrawerKey);
if (oldDrawer) {
  localStorage.removeItem(oldDrawerKey);
  if (oldDrawer === 'ai-assistant') {
    // AI goes to right sidebar — it's open by default
  } else if (oldDrawer !== 'function-help') {
    localStorage.setItem(LEFT_PANEL_KEY, oldDrawer);
  }
}

// Restore left sidebar state from localStorage
const savedLeftPanel = localStorage.getItem(LEFT_PANEL_KEY);
if (savedLeftPanel) {
  switchLeftPanel(savedLeftPanel);
} else {
  // Start collapsed
  closeLeftSidebar();
}

/* ── Right Sidebar: AI assistant ─────────────────────── */
const RIGHT_SIDEBAR_KEY = 'appledax-right-sidebar';
const rightSidebar = document.getElementById('right-sidebar')!;
const rightSidebarClose = document.getElementById('right-sidebar-close')!;
const aiFab = document.getElementById('ai-fab')!;

function openRightSidebar(): void {
  rightSidebar.classList.remove('collapsed');
  app.classList.remove('right-collapsed');
  aiFab.classList.add('hidden');
  localStorage.setItem(RIGHT_SIDEBAR_KEY, 'open');

  // On small screens, only one sidebar at a time
  if (isSmallScreen() && activeLeftPanel) {
    closeLeftSidebar();
  }
}

function closeRightSidebar(): void {
  rightSidebar.classList.add('collapsed');
  app.classList.add('right-collapsed');
  aiFab.classList.remove('hidden');
  localStorage.setItem(RIGHT_SIDEBAR_KEY, 'closed');
}

rightSidebarClose.addEventListener('click', closeRightSidebar);
aiFab.addEventListener('click', openRightSidebar);

// Restore right sidebar state (default: open)
const savedRightSidebar = localStorage.getItem(RIGHT_SIDEBAR_KEY);
if (savedRightSidebar === 'closed') {
  closeRightSidebar();
} else {
  openRightSidebar();
}

/* ── Sidebar backdrop (click-to-close on small screens) */
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
sidebarBackdrop?.addEventListener('click', () => {
  if (activeLeftPanel) closeLeftSidebar();
  if (!app.classList.contains('right-collapsed')) closeRightSidebar();
});

/* ── Sidebar resize handles ──────────────────────────── */
function setupSidebarResize(
  handleId: string,
  side: 'left' | 'right',
  cssVar: string,
  min: number,
  max: number,
): void {
  const handle = document.getElementById(handleId);
  if (!handle) return;

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  function startDrag(x: number): void {
    isDragging = true;
    startX = x;
    const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue(cssVar)) || (side === 'left' ? 280 : 360);
    startWidth = current;
    handle!.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function moveDrag(x: number): void {
    if (!isDragging) return;
    const delta = side === 'left'
      ? x - startX
      : startX - x;
    const newWidth = Math.max(min, Math.min(startWidth + delta, max));
    document.documentElement.style.setProperty(cssVar, newWidth + 'px');
  }

  function endDrag(): void {
    if (!isDragging) return;
    isDragging = false;
    handle!.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  // Mouse events
  handle.addEventListener('mousedown', (e) => {
    startDrag(e.clientX);
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => moveDrag(e.clientX));
  document.addEventListener('mouseup', endDrag);

  // Touch events
  handle.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      startDrag(e.touches[0].clientX);
      e.preventDefault();
    }
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (isDragging && e.touches.length === 1) {
      moveDrag(e.touches[0].clientX);
    }
  });
  document.addEventListener('touchend', endDrag);
  document.addEventListener('touchcancel', endDrag);
}

setupSidebarResize('left-resize-handle', 'left', '--left-sidebar-width', 200, 500);
setupSidebarResize('right-resize-handle', 'right', '--right-sidebar-width', 260, 600);

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

/* ── Editor Header: Copy button ──────────────────────── */
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

/* ── Editor Header: Format button ────────────────────── */
document.getElementById('btn-format')?.addEventListener('click', () => {
  const source = editor.getValue();
  if (!source) return;

  try {
    const formatted = formatDax(source);
    editor.setValue(formatted);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = t('app.format_error', { error: msg });
      setTimeout(() => { statusText.textContent = ''; }, 4000);
    }
  }
});
