import type { LintDiagnostic } from '../types';
import type { EditorAdapter } from '../editor/editor-interface';
import { onDiagnosticsChanged } from '../editor/cm/dax-lint';
import { t } from '../i18n/index';

const SEVERITY_ICONS: Record<string, string> = {
  error: '\u2716',   // heavy X
  warning: '\u26A0', // warning sign
  info: '\u24D8',    // circled i
};

export class DiagnosticsPanel {
  private container: HTMLElement;
  private editor: EditorAdapter;
  private currentFilter = 'all';
  private diagnostics: LintDiagnostic[] = [];
  private statusText: HTMLElement | null;

  constructor(editor: EditorAdapter) {
    this.container = document.getElementById('diagnostics-list')!;
    this.editor = editor;
    this.statusText = document.getElementById('status-text');

    onDiagnosticsChanged((diags) => {
      this.diagnostics = diags;
      this.render();
      this.updateBadges();
      this.updateStatusBar();
    });

    // Tab click handling
    document.querySelectorAll<HTMLElement>('#diagnostics-tabs .diag-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#diagnostics-tabs .diag-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentFilter = tab.dataset.severity ?? 'all';
        this.render();
      });
    });
  }

  private updateStatusBar(): void {
    if (!this.statusText) return;

    const total = this.diagnostics.length;
    let errors = 0;

    for (const d of this.diagnostics) {
      if (d.severity === 'error') errors++;
    }

    // Remove all status classes
    this.statusText.classList.remove('status-clean', 'status-has-issues', 'status-has-errors');

    if (total === 0) {
      this.statusText.textContent = t('status.all_good');
      this.statusText.classList.add('status-clean');
    } else if (errors > 0) {
      this.statusText.textContent = t('status.suggestions', { count: total });
      this.statusText.classList.add('status-has-errors');
    } else {
      this.statusText.textContent = t('status.suggestions', { count: total });
      this.statusText.classList.add('status-has-issues');
    }
  }

  private render(): void {
    const filtered = this.currentFilter === 'all'
      ? this.diagnostics
      : this.diagnostics.filter((d) => d.severity === this.currentFilter);

    this.container.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'diag-empty';
      empty.textContent = this.diagnostics.length === 0
        ? t('diag.no_problems')
        : t('diag.no_filtered', { severity: this.currentFilter });
      this.container.appendChild(empty);
      return;
    }

    for (const diag of filtered) {
      const row = document.createElement('div');
      row.className = `diag-row diag-${diag.severity}`;

      const icon = document.createElement('span');
      icon.className = 'diag-icon';
      icon.textContent = SEVERITY_ICONS[diag.severity] ?? '';

      const message = document.createElement('span');
      message.className = 'diag-message';
      message.textContent = diag.message;

      const location = document.createElement('span');
      location.className = 'diag-location';
      location.textContent = t('diag.location', { line: diag.startLine, col: diag.startCol });

      row.appendChild(icon);
      row.appendChild(message);
      row.appendChild(location);

      row.addEventListener('click', () => {
        this.editor.setCursorPosition(diag.startLine, diag.startCol);
        this.editor.revealLine(diag.startLine);
        this.editor.focus();
      });

      this.container.appendChild(row);
    }
  }

  private updateBadges(): void {
    let errors = 0;
    let warnings = 0;
    let infos = 0;

    for (const d of this.diagnostics) {
      if (d.severity === 'error') errors++;
      else if (d.severity === 'warning') warnings++;
      else if (d.severity === 'info') infos++;
    }

    const total = errors + warnings + infos;

    this.setBadge('badge-all', total);
    this.setBadge('badge-errors', errors);
    this.setBadge('badge-warnings', warnings);
    this.setBadge('badge-info', infos);
  }

  private setBadge(id: string, count: number): void {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = parseInt(el.textContent || '0', 10);
    el.textContent = String(count);
    if (count !== prev && count > 0) {
      el.classList.remove('badge-pulse');
      void el.offsetWidth; // force reflow to restart animation
      el.classList.add('badge-pulse');
    }
  }
}
