import { t } from '../i18n/index';
import { QueryStateStore } from '../query/state';
import { executeQuery, benchmarkQuery, isQueryErrorDetails } from '../query/executors/rest-executor';
import { loadQueryHistory, saveQueryHistoryItem, searchQueryHistory, togglePinnedHistoryItem } from '../query/history';
import { exportResultAsCsv } from '../query/export';
import {
  createProfile,
  deleteProfile,
  ensureProfiles,
  getActiveProfileId,
  setActiveProfileId,
  upsertProfile,
} from '../query/profile-store';
import type {
  BenchmarkResult,
  QueryConnection,
  QueryErrorDetails,
  QueryProfile,
  QueryRequest,
  QueryRunResult,
  QueryTab,
} from '../query/types';

interface WorkspaceItem {
  id: string;
  name: string;
}

interface DatasetItem {
  id: string;
  name: string;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class QueryWorkspacePanel {
  private container: HTMLElement;
  private state = new QueryStateStore();
  private runAbortController: AbortController | null = null;
  private latestResult: QueryRunResult | null = null;
  private latestBenchmark: BenchmarkResult | null = null;
  private latestError: QueryErrorDetails | null = null;
  private latestErrorRaw = '';
  private workspaces: WorkspaceItem[] = [];
  private datasets: DatasetItem[] = [];
  private profiles: QueryProfile[] = [];
  private activeProfileId = '';
  private setupStep = 1;
  private preflightStatus: { ok: boolean; message: string } | null = null;
  private historySearch = '';
  private selectedHistoryCompareLeftId = '';
  private selectedHistoryCompareRightId = '';
  private pageSize = 50;
  private currentResultPage = 1;
  private rowCap = 500;

  constructor() {
    this.container = document.getElementById('query-workspace-panel')!;
    this.profiles = ensureProfiles(this.defaultRedirectUri());
    this.activeProfileId = getActiveProfileId() || this.profiles[0]?.id || '';
    if (!this.activeProfileId && this.profiles[0]) {
      this.activeProfileId = this.profiles[0].id;
      setActiveProfileId(this.activeProfileId);
    }
    void this.handleAuthCallback();
    this.render();
    void this.refreshWorkspaces();
  }

  public render(): void {
    const active = this.state.getActiveTab();
    const status = this.state.getRunStatus();
    const history = searchQueryHistory(this.historySearch).slice(0, 20);
    const profile = this.getActiveProfile();

    const workspaceOptions = this.workspaces
      .map((w) => `<option value="${esc(w.id)}"${w.id === profile.workspaceId ? ' selected' : ''}>${esc(w.name)}</option>`)
      .join('');
    const datasetOptions = this.datasets
      .map((d) => `<option value="${esc(d.id)}"${d.id === profile.datasetId ? ' selected' : ''}>${esc(d.name)}</option>`)
      .join('');

    const tabsHtml = this.state.getTabs().map((tab) => this.renderTab(tab)).join('');
    const compareHtml = this.renderComparisonSummary(history);
    const resultHtml = this.latestResult ? this.renderResultTable(this.latestResult) : '';
    const benchmarkHtml = this.latestBenchmark ? this.renderBenchmark(this.latestBenchmark) : '';
    const warningHtml = this.latestResult && this.latestResult.warnings.length > 0
      ? `<div class="qw-warning">${this.latestResult.warnings.map((w) => esc(w.message)).join('<br>')}</div>`
      : '';
    const errorHtml = this.latestError
      ? `<div class="qw-error"><strong>${esc(this.latestError.code)}</strong>: ${esc(this.latestError.message)}${this.latestError.suggestion ? `<br>${esc(this.latestError.suggestion)}` : ''}${this.latestErrorRaw ? `<details><summary>${esc(t('qw.error_details'))}</summary><pre>${esc(this.latestErrorRaw)}</pre></details>` : ''}</div>`
      : '';
    const historyHtml = history.map((item) =>
      `<div class="qw-history-item">
        <button class="qw-history-open" data-history-id="${esc(item.id)}">${new Date(item.createdAt).toLocaleString()} · ${esc(item.datasetName || item.datasetId)} · ${item.elapsedMs}ms</button>
        <div class="qw-history-actions">
          <button class="qw-mini-btn" data-history-new-tab="${esc(item.id)}">${esc(t('qw.history_open_new_tab'))}</button>
          <button class="qw-mini-btn" data-history-pin="${esc(item.id)}">${item.pinned ? esc(t('qw.history_unpin')) : esc(t('qw.history_pin'))}</button>
          <button class="qw-mini-btn" data-compare-left="${esc(item.id)}">${esc(t('qw.history_compare_left'))}</button>
          <button class="qw-mini-btn" data-compare-right="${esc(item.id)}">${esc(t('qw.history_compare_right'))}</button>
        </div>
      </div>`
    ).join('');

    this.container.innerHTML = `
      <div class="qw-root">
        <div class="qw-tabs">
          ${tabsHtml}
          <button id="qw-tab-add" class="qw-tab-add">+</button>
        </div>

        <div class="qw-setup">
          <div class="qw-setup-steps">
            ${this.renderStep(1, 'qw.step_profile', this.isProfileReady(profile))}
            ${this.renderStep(2, 'qw.step_auth', this.isAuthReady(profile))}
            ${this.renderStep(3, 'qw.step_connection', this.isConnectionReady(profile))}
            ${this.renderStep(4, 'qw.step_ready', !!this.preflightStatus?.ok)}
          </div>

          <div class="qw-profile-row">
            <select id="qw-profile-select" class="qw-input">
              ${this.profiles.map((p) => `<option value="${esc(p.id)}"${p.id === profile.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
            <button id="qw-profile-new" class="qw-btn-secondary">${esc(t('qw.profile_new'))}</button>
            <button id="qw-profile-rename" class="qw-btn-secondary">${esc(t('qw.profile_rename'))}</button>
            <button id="qw-profile-delete" class="qw-btn-secondary"${this.profiles.length <= 1 ? ' disabled' : ''}>${esc(t('qw.profile_delete'))}</button>
          </div>

          <div class="qw-auth">
            <select id="qw-mode" class="qw-input">
              <option value="delegated"${profile.mode === 'delegated' ? ' selected' : ''}>${esc(t('qw.mode_delegated'))}</option>
              <option value="service-principal"${profile.mode === 'service-principal' ? ' selected' : ''}>${esc(t('qw.mode_service_principal'))}</option>
            </select>
            <input id="qw-tenant-id" class="qw-input" placeholder="${esc(t('qw.tenant_id'))}" value="${esc(profile.tenantId)}">
            <input id="qw-client-id" class="qw-input" placeholder="${esc(t('qw.client_id'))}" value="${esc(profile.clientId)}">
            <input id="qw-redirect-uri" class="qw-input" placeholder="${esc(t('qw.redirect_uri'))}" value="${esc(profile.redirectUri)}">
            <button id="qw-signin" class="qw-btn"${profile.mode === 'service-principal' ? ' disabled' : ''}>${esc(t('qw.sign_in'))}</button>
          </div>

          <div class="qw-connection">
            <select id="qw-workspace" class="qw-input">
              <option value="">${esc(t('qw.select_workspace'))}</option>
              ${workspaceOptions}
            </select>
            <select id="qw-dataset" class="qw-input">
              <option value="">${esc(t('qw.select_dataset'))}</option>
              ${datasetOptions}
            </select>
            <button id="qw-refresh-connections" class="qw-btn-secondary">${esc(t('qw.refresh'))}</button>
          </div>

          <div class="qw-preflight-row">
            <button id="qw-check-readiness" class="qw-btn-secondary">${esc(t('qw.check_readiness'))}</button>
            <div class="qw-preflight-status ${this.preflightStatus?.ok ? 'ok' : ''}">${esc(this.preflightStatus?.message ?? t('qw.preflight_not_checked'))}</div>
          </div>
        </div>

        <textarea id="qw-editor" class="qw-editor">${esc(active.queryText)}</textarea>

        <div class="qw-actions">
          <button id="qw-run" class="qw-btn" ${status === 'running' ? 'disabled' : ''}>${esc(t('qw.run'))}</button>
          <button id="qw-cancel" class="qw-btn-secondary" ${status === 'running' ? '' : 'disabled'}>${esc(t('qw.cancel'))}</button>
          <button id="qw-benchmark" class="qw-btn-secondary" ${status === 'running' ? 'disabled' : ''}>${esc(t('qw.benchmark'))}</button>
          <button id="qw-export" class="qw-btn-secondary" ${this.latestResult ? '' : 'disabled'}>${esc(t('qw.export_csv'))}</button>
          <label class="qw-inline">
            ${esc(t('qw.page_size'))}
            <select id="qw-page-size" class="qw-input qw-small-input">
              ${[50, 100, 250].map((size) => `<option value="${size}"${size === this.pageSize ? ' selected' : ''}>${size}</option>`).join('')}
            </select>
          </label>
          <label class="qw-inline">
            ${esc(t('qw.row_cap'))}
            <select id="qw-row-cap" class="qw-input qw-small-input">
              ${[200, 500, 1000, 2500].map((size) => `<option value="${size}"${size === this.rowCap ? ' selected' : ''}>${size}</option>`).join('')}
            </select>
          </label>
          <span class="qw-status">${esc(t(`qw.status_${status}`))}</span>
        </div>

        <div class="qw-diagnostics">
          ${warningHtml}
          ${errorHtml}
          ${this.latestResult ? `<div class="qw-meta">${esc(t('qw.elapsed'))}: ${this.latestResult.elapsedMs}ms · ${esc(t('qw.rows'))}: ${this.latestResult.rows.length} · ${esc(t('qw.truncated'))}: ${this.latestResult.truncated ? esc(t('qw.yes')) : esc(t('qw.no'))} · ${esc(t('qw.request_id'))}: ${esc(this.latestResult.requestId)}</div>` : ''}
          ${resultHtml}
          ${benchmarkHtml}
        </div>

        <div class="qw-history">
          <div class="qw-history-title">${esc(t('qw.recent_runs'))}</div>
          <input id="qw-history-search" class="qw-input" placeholder="${esc(t('qw.history_search_placeholder'))}" value="${esc(this.historySearch)}">
          ${compareHtml}
          ${historyHtml || `<div class="qw-history-empty">${esc(t('qw.no_history'))}</div>`}
        </div>
      </div>
    `;

    this.attachHandlers();
  }

  private renderStep(step: number, labelKey: string, completed: boolean): string {
    const active = this.setupStep === step;
    return `<button class="qw-step ${active ? 'active' : ''} ${completed ? 'completed' : ''}" data-step="${step}">${step}. ${esc(t(labelKey))}</button>`;
  }

  private renderTab(tab: QueryTab): string {
    const active = tab.id === this.state.getActiveTabId();
    const canClose = this.state.getTabs().length > 1;
    const dirtyBadge = tab.dirty ? '*' : '';
    const statusBadge = tab.lastRunStatus === 'idle' ? '' : ` <span class="qw-tab-status">${esc(tab.lastRunStatus)}</span>`;
    return `<div class="qw-tab ${active ? 'active' : ''}" data-tab-id="${esc(tab.id)}">
      <button class="qw-tab-select" data-tab-id="${esc(tab.id)}">${esc(tab.name)}${dirtyBadge}${statusBadge}</button>
      <button class="qw-tab-dup" data-tab-dup="${esc(tab.id)}" title="${esc(t('qw.tab_duplicate'))}">⧉</button>
      <button class="qw-tab-close" data-tab-close="${esc(tab.id)}"${canClose ? '' : ' disabled'}>&times;</button>
    </div>`;
  }

  private renderResultTable(result: QueryRunResult): string {
    if (result.rows.length === 0) {
      return `<div class="qw-empty">${esc(t('qw.no_rows'))}</div>`;
    }
    const totalRows = result.rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / this.pageSize));
    const page = Math.min(this.currentResultPage, totalPages);
    const start = (page - 1) * this.pageSize;
    const end = Math.min(totalRows, start + this.pageSize);
    const headers = result.columns.map((c) => `<th>${esc(c.name)}</th>`).join('');
    const rows = result.rows.slice(start, end).map((row) => {
      const cells = result.columns.map((c) => `<td>${esc(String(row[c.name] ?? ''))}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `
      <div class="qw-pagination">
        <button class="qw-mini-btn" id="qw-page-prev" ${page <= 1 ? 'disabled' : ''}>${esc(t('qw.page_prev'))}</button>
        <span>${esc(t('qw.page_label'))}: ${page}/${totalPages} (${start + 1}-${end} / ${totalRows})</span>
        <button class="qw-mini-btn" id="qw-page-next" ${page >= totalPages ? 'disabled' : ''}>${esc(t('qw.page_next'))}</button>
      </div>
      <table class="qw-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
    `;
  }

  private renderBenchmark(result: BenchmarkResult): string {
    const runs = result.runs.map((run) => `<li>#${run.run}: ${run.elapsedMs}ms</li>`).join('');
    return `<div class="qw-benchmark">
      <div>${esc(t('qw.benchmark_median'))}: ${result.medianMs.toFixed(1)}ms</div>
      <div>${esc(t('qw.benchmark_p95'))}: ${result.p95Ms.toFixed(1)}ms</div>
      <div>${esc(t('qw.benchmark_stddev'))}: ${result.stdDevMs.toFixed(1)}ms</div>
      <ul>${runs}</ul>
    </div>`;
  }

  private renderComparisonSummary(history: Array<{ id: string; elapsedMs: number; rowCount: number; warnings: string[] }>): string {
    const left = history.find((item) => item.id === this.selectedHistoryCompareLeftId);
    const right = history.find((item) => item.id === this.selectedHistoryCompareRightId);
    if (!left || !right) {
      return `<div class="qw-compare">${esc(t('qw.compare_hint'))}</div>`;
    }
    const elapsedDelta = right.elapsedMs - left.elapsedMs;
    const rowDelta = right.rowCount - left.rowCount;
    const warningDelta = right.warnings.length - left.warnings.length;
    return `<div class="qw-compare">
      <strong>${esc(t('qw.compare_title'))}</strong> · Δms: ${elapsedDelta >= 0 ? '+' : ''}${elapsedDelta} · Δrows: ${rowDelta >= 0 ? '+' : ''}${rowDelta} · Δwarnings: ${warningDelta >= 0 ? '+' : ''}${warningDelta}
    </div>`;
  }

  private attachHandlers(): void {
    this.container.querySelectorAll<HTMLElement>('[data-step]').forEach((el) => {
      el.addEventListener('click', () => {
        this.setupStep = Number(el.dataset.step ?? '1');
        this.render();
      });
    });

    this.container.querySelector('#qw-tab-add')?.addEventListener('click', () => {
      this.state.createTab(`Query ${this.state.getTabs().length + 1}`);
      this.render();
    });

    this.container.querySelectorAll<HTMLElement>('[data-tab-dup]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = el.dataset.tabDup;
        if (!id) return;
        this.state.duplicateTab(id);
        this.render();
      });
    });

    this.container.querySelectorAll<HTMLElement>('[data-tab-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.tabId;
        if (!id) return;
        this.state.setActiveTab(id);
        this.render();
      });
      el.addEventListener('dblclick', () => {
        const id = el.dataset.tabId;
        if (!id) return;
        const current = this.state.getTabs().find((t) => t.id === id);
        const next = window.prompt(t('qw.rename_tab_prompt'), current?.name ?? 'Query');
        if (next !== null) {
          this.state.renameTab(id, next);
          this.render();
        }
      });
    });

    this.container.querySelectorAll<HTMLElement>('[data-tab-close]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.tabClose;
        if (!id) return;
        if (this.state.getTabs().length <= 1) return;
        this.state.closeTab(id);
        this.render();
      });
    });

    const profileSelect = this.container.querySelector('#qw-profile-select') as HTMLSelectElement | null;
    profileSelect?.addEventListener('change', async () => {
      const nextId = profileSelect.value;
      if (!nextId || nextId === this.activeProfileId) return;
      this.activeProfileId = nextId;
      setActiveProfileId(nextId);
      this.resetConnectionState();
      await this.refreshWorkspaces();
      this.render();
    });

    this.container.querySelector('#qw-profile-new')?.addEventListener('click', async () => {
      const nextName = window.prompt(t('qw.profile_name_prompt'), `Profile ${this.profiles.length + 1}`);
      if (nextName === null) return;
      const profile = createProfile(nextName, 'delegated', this.defaultRedirectUri());
      this.profiles = upsertProfile(profile);
      this.activeProfileId = profile.id;
      setActiveProfileId(profile.id);
      this.resetConnectionState();
      await this.refreshWorkspaces();
      this.render();
    });

    this.container.querySelector('#qw-profile-rename')?.addEventListener('click', () => {
      const profile = this.getActiveProfile();
      const nextName = window.prompt(t('qw.profile_rename_prompt'), profile.name);
      if (nextName === null) return;
      this.updateActiveProfile({ name: nextName.trim() || profile.name });
      this.render();
    });

    this.container.querySelector('#qw-profile-delete')?.addEventListener('click', async () => {
      const profile = this.getActiveProfile();
      if (this.profiles.length <= 1) return;
      const confirmed = window.confirm(t('qw.profile_delete_confirm').replace('{name}', profile.name));
      if (!confirmed) return;
      this.profiles = deleteProfile(profile.id);
      this.activeProfileId = getActiveProfileId() || this.profiles[0]?.id || '';
      setActiveProfileId(this.activeProfileId);
      this.resetConnectionState();
      await this.refreshWorkspaces();
      this.render();
    });

    const modeSelect = this.container.querySelector('#qw-mode') as HTMLSelectElement | null;
    modeSelect?.addEventListener('change', async () => {
      const nextMode = modeSelect.value === 'service-principal' ? 'service-principal' : 'delegated';
      this.updateActiveProfile({
        mode: nextMode,
        workspaceId: '',
        datasetId: '',
        accessToken: nextMode === 'service-principal' ? '' : this.getActiveProfile().accessToken,
      });
      this.resetConnectionState();
      await this.refreshWorkspaces();
      this.render();
    });

    const tenantInput = this.container.querySelector('#qw-tenant-id') as HTMLInputElement | null;
    const clientInput = this.container.querySelector('#qw-client-id') as HTMLInputElement | null;
    const redirectInput = this.container.querySelector('#qw-redirect-uri') as HTMLInputElement | null;
    tenantInput?.addEventListener('change', () => this.updateActiveProfile({ tenantId: tenantInput.value.trim() }));
    clientInput?.addEventListener('change', () => this.updateActiveProfile({ clientId: clientInput.value.trim() }));
    redirectInput?.addEventListener('change', () => this.updateActiveProfile({ redirectUri: redirectInput.value.trim() || this.defaultRedirectUri() }));

    const editor = this.container.querySelector('#qw-editor') as HTMLTextAreaElement | null;
    editor?.addEventListener('input', () => {
      this.state.setQueryText(this.state.getActiveTabId(), editor.value);
    });

    const workspaceSelect = this.container.querySelector('#qw-workspace') as HTMLSelectElement | null;
    const datasetSelect = this.container.querySelector('#qw-dataset') as HTMLSelectElement | null;
    workspaceSelect?.addEventListener('change', async () => {
      this.updateActiveProfile({ workspaceId: workspaceSelect.value, datasetId: '' });
      await this.refreshDatasets(workspaceSelect.value);
      this.render();
    });
    datasetSelect?.addEventListener('change', () => {
      this.updateActiveProfile({ datasetId: datasetSelect.value });
    });

    this.container.querySelector('#qw-refresh-connections')?.addEventListener('click', async () => {
      await this.refreshWorkspaces();
      this.render();
    });

    const pageSizeSelect = this.container.querySelector('#qw-page-size') as HTMLSelectElement | null;
    pageSizeSelect?.addEventListener('change', () => {
      this.pageSize = Math.max(1, Number(pageSizeSelect.value || '50'));
      this.currentResultPage = 1;
      this.render();
    });

    const rowCapSelect = this.container.querySelector('#qw-row-cap') as HTMLSelectElement | null;
    rowCapSelect?.addEventListener('change', () => {
      this.rowCap = Math.max(1, Number(rowCapSelect.value || '500'));
      this.render();
    });

    this.container.querySelector('#qw-signin')?.addEventListener('click', async () => {
      await this.beginDelegatedSignIn();
    });

    this.container.querySelector('#qw-check-readiness')?.addEventListener('click', async () => {
      const profile = this.getActiveProfile();
      const connection = this.getConnection(profile);
      const active = this.state.getActiveTab();
      const ok = await this.runPreflight(connection, active.queryText, true);
      if (ok) {
        this.preflightStatus = { ok: true, message: t('qw.preflight_ok') };
        this.setupStep = 4;
      }
      this.render();
    });

    this.container.querySelector('#qw-run')?.addEventListener('click', async () => {
      await this.runCurrentQuery();
    });

    this.container.querySelector('#qw-cancel')?.addEventListener('click', () => {
      this.runAbortController?.abort();
      this.state.setRunStatus('cancelled');
      this.render();
    });

    this.container.querySelector('#qw-benchmark')?.addEventListener('click', async () => {
      await this.runBenchmark();
    });

    this.container.querySelector('#qw-export')?.addEventListener('click', () => {
      if (!this.latestResult) return;
      exportResultAsCsv(`query-result-${Date.now()}`, this.latestResult);
    });

    this.container.querySelector('#qw-page-prev')?.addEventListener('click', () => {
      this.currentResultPage = Math.max(1, this.currentResultPage - 1);
      this.render();
    });
    this.container.querySelector('#qw-page-next')?.addEventListener('click', () => {
      this.currentResultPage += 1;
      this.render();
    });

    const historySearch = this.container.querySelector('#qw-history-search') as HTMLInputElement | null;
    historySearch?.addEventListener('input', () => {
      this.historySearch = historySearch.value;
      this.render();
    });

    this.container.querySelectorAll<HTMLElement>('[data-history-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const history = loadQueryHistory();
        const selected = history.find((h) => h.id === el.dataset.historyId);
        if (!selected) return;
        this.state.setQueryText(this.state.getActiveTabId(), selected.queryText);
        this.render();
      });
    });

    this.container.querySelectorAll<HTMLElement>('[data-history-new-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        const history = loadQueryHistory();
        const selected = history.find((h) => h.id === el.dataset.historyNewTab);
        if (!selected) return;
        const tab = this.state.createTab(`Query ${this.state.getTabs().length + 1}`);
        this.state.setQueryText(tab.id, selected.queryText);
        this.render();
      });
    });

    this.container.querySelectorAll<HTMLElement>('[data-history-pin]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.historyPin;
        if (!id) return;
        togglePinnedHistoryItem(id);
        this.render();
      });
    });

    this.container.querySelectorAll<HTMLElement>('[data-compare-left]').forEach((el) => {
      el.addEventListener('click', () => {
        this.selectedHistoryCompareLeftId = el.dataset.compareLeft ?? '';
        this.render();
      });
    });

    this.container.querySelectorAll<HTMLElement>('[data-compare-right]').forEach((el) => {
      el.addEventListener('click', () => {
        this.selectedHistoryCompareRightId = el.dataset.compareRight ?? '';
        this.render();
      });
    });
  }

  private async runCurrentQuery(): Promise<void> {
    const profile = this.getActiveProfile();
    if (profile.mode === 'delegated') {
      const refreshed = await this.ensureAccessToken();
      if (!refreshed) return;
    }

    const connection = this.getConnection(this.getActiveProfile());
    if (!connection.workspaceId || !connection.datasetId) {
      this.latestError = { status: 400, code: 'MISSING_CONNECTION', message: t('qw.error_missing_connection') };
      this.latestErrorRaw = '';
      this.render();
      return;
    }

    const active = this.state.getActiveTab();
    const preflightOk = await this.runPreflight(connection, active.queryText, false);
    if (!preflightOk) {
      return;
    }

    const request: QueryRequest = {
      queryText: active.queryText,
      workspaceId: connection.workspaceId,
      datasetId: connection.datasetId,
      mode: connection.mode,
      connectionRef: connection.connectionRef,
    };

    this.latestError = null;
    this.latestErrorRaw = '';
    this.latestBenchmark = null;
    this.state.setRunStatus('running');
    this.state.setTabRunStatus(active.id, 'running');
    this.runAbortController = new AbortController();
    this.render();

    try {
      const result = await executeQuery(request, connection, this.runAbortController.signal);
      const cappedRows = result.rows.slice(0, this.rowCap);
      const localWarnings = [...result.warnings];
      if (result.rows.length > this.rowCap) {
        localWarnings.push({ code: 'ROW_CAP', message: t('qw.warning_row_cap') });
      }
      this.latestResult = {
        ...result,
        rows: cappedRows,
        warnings: localWarnings,
      };
      this.currentResultPage = 1;
      saveQueryHistoryItem(active.queryText, connection, this.latestResult);
      this.state.setRunStatus('success');
      this.state.setTabRunStatus(active.id, 'success');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.state.setRunStatus('cancelled');
        this.state.setTabRunStatus(active.id, 'cancelled');
      } else if (isQueryErrorDetails(err)) {
        this.latestError = err;
        this.latestErrorRaw = '';
        this.state.setRunStatus('error');
        this.state.setTabRunStatus(active.id, 'error');
      } else {
        this.latestError = { status: 500, code: 'UNKNOWN', message: t('qw.error_unknown') };
        this.latestErrorRaw = String(err);
        this.state.setRunStatus('error');
        this.state.setTabRunStatus(active.id, 'error');
      }
    } finally {
      this.runAbortController = null;
      this.render();
    }
  }

  private async runPreflight(connection: QueryConnection, queryText: string, manualCheck: boolean): Promise<boolean> {
    try {
      const response = await fetch('/api/query/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: connection.workspaceId,
          datasetId: connection.datasetId,
          queryText,
          mode: connection.mode,
          connectionRef: connection.connectionRef,
        }),
      });
      if (response.ok) {
        this.preflightStatus = { ok: true, message: t('qw.preflight_ok') };
        return true;
      }
      const payload = await response.json().catch(() => null) as { checks?: Array<{ code: string; message: string; hint?: string }>; error?: string } | null;
      const check = payload?.checks?.[0];
      const guidance = this.mapPreflightGuidance(check?.code);
      this.latestError = {
        status: response.status,
        code: check?.code ?? 'PREFLIGHT',
        message: guidance.message || check?.message || payload?.error || t('qw.error_preflight'),
        suggestion: guidance.suggestion || check?.hint,
      };
      this.latestErrorRaw = payload ? JSON.stringify(payload, null, 2) : '';
      this.preflightStatus = { ok: false, message: this.latestError.message };
      this.state.setRunStatus('error');
      if (!manualCheck) this.render();
      return false;
    } catch {
      this.latestError = { status: 500, code: 'PREFLIGHT', message: t('qw.error_preflight') };
      this.latestErrorRaw = '';
      this.preflightStatus = { ok: false, message: t('qw.error_preflight') };
      this.state.setRunStatus('error');
      if (!manualCheck) this.render();
      return false;
    }
  }

  private mapPreflightGuidance(code?: string): { message?: string; suggestion?: string } {
    if (code === 'MISSING_BUILD') {
      return {
        message: t('qw.preflight_missing_build'),
        suggestion: t('qw.preflight_missing_build_hint'),
      };
    }
    if (code === 'TENANT_SETTING') {
      return {
        message: t('qw.preflight_tenant_setting'),
        suggestion: t('qw.preflight_tenant_setting_hint'),
      };
    }
    if (code === 'AUTH') {
      return {
        message: t('qw.preflight_auth'),
        suggestion: t('qw.preflight_auth_hint'),
      };
    }
    return {};
  }

  private async runBenchmark(): Promise<void> {
    const profile = this.getActiveProfile();
    if (profile.mode === 'delegated') {
      const refreshed = await this.ensureAccessToken();
      if (!refreshed) return;
    }
    const connection = this.getConnection(this.getActiveProfile());
    if (!connection.workspaceId || !connection.datasetId) {
      this.latestError = { status: 400, code: 'MISSING_CONNECTION', message: t('qw.error_missing_connection') };
      this.latestErrorRaw = '';
      this.render();
      return;
    }
    const active = this.state.getActiveTab();
    const request: QueryRequest = {
      queryText: active.queryText,
      workspaceId: connection.workspaceId,
      datasetId: connection.datasetId,
      mode: connection.mode,
      connectionRef: connection.connectionRef,
    };

    this.latestError = null;
    this.latestErrorRaw = '';
    this.latestResult = null;
    this.state.setRunStatus('running');
    this.state.setTabRunStatus(active.id, 'running');
    this.runAbortController = new AbortController();
    this.render();

    try {
      this.latestBenchmark = await benchmarkQuery(request, connection, 5, 1, this.runAbortController.signal);
      this.state.setRunStatus('success');
      this.state.setTabRunStatus(active.id, 'success');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.state.setRunStatus('cancelled');
        this.state.setTabRunStatus(active.id, 'cancelled');
      } else if (isQueryErrorDetails(err)) {
        this.latestError = err;
        this.latestErrorRaw = '';
        this.state.setRunStatus('error');
        this.state.setTabRunStatus(active.id, 'error');
      } else {
        this.latestError = { status: 500, code: 'UNKNOWN', message: t('qw.error_unknown') };
        this.latestErrorRaw = String(err);
        this.state.setRunStatus('error');
        this.state.setTabRunStatus(active.id, 'error');
      }
    } finally {
      this.runAbortController = null;
      this.render();
    }
  }

  private async refreshWorkspaces(): Promise<void> {
    const profile = this.getActiveProfile();
    if (profile.mode === 'delegated') {
      const refreshed = await this.ensureAccessToken();
      if (!refreshed || !this.getActiveProfile().accessToken) return;
    }
    const response = await fetch('/api/query/workspaces', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({
        mode: profile.mode,
        connectionRef: profile.mode === 'delegated' ? { accessToken: this.getActiveProfile().accessToken } : undefined,
      }),
    });
    if (!response.ok) return;
    const payload = await response.json() as { workspaces: WorkspaceItem[] };
    this.workspaces = payload.workspaces;

    const current = this.getActiveProfile();
    if (!this.workspaces.some((w) => w.id === current.workspaceId)) {
      this.updateActiveProfile({ workspaceId: '', datasetId: '' });
      this.datasets = [];
      return;
    }
    await this.refreshDatasets(current.workspaceId);
  }

  private async refreshDatasets(workspaceId: string): Promise<void> {
    if (!workspaceId) {
      this.datasets = [];
      return;
    }

    const profile = this.getActiveProfile();
    if (profile.mode === 'delegated') {
      const refreshed = await this.ensureAccessToken();
      if (!refreshed || !this.getActiveProfile().accessToken) {
        this.datasets = [];
        return;
      }
    }

    const response = await fetch('/api/query/datasets', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({
        workspaceId,
        mode: profile.mode,
        connectionRef: profile.mode === 'delegated' ? { accessToken: this.getActiveProfile().accessToken } : undefined,
      }),
    });
    if (!response.ok) {
      this.datasets = [];
      return;
    }
    const payload = await response.json() as { datasets: DatasetItem[] };
    this.datasets = payload.datasets;

    const current = this.getActiveProfile();
    if (!this.datasets.some((d) => d.id === current.datasetId)) {
      this.updateActiveProfile({ datasetId: '' });
    }
  }

  private async beginDelegatedSignIn(): Promise<void> {
    const profile = this.getActiveProfile();
    if (!profile.tenantId || !profile.clientId || !profile.redirectUri) {
      this.latestError = { status: 400, code: 'AUTH_CONFIG', message: t('qw.error_auth_config') };
      this.latestErrorRaw = '';
      this.render();
      return;
    }

    const codeVerifier = randomString(64);
    const state = randomString(32);
    const challenge = await sha256Base64Url(codeVerifier);
    localStorage.setItem('appledax-query-code-verifier', codeVerifier);
    localStorage.setItem('appledax-query-auth-state', state);
    localStorage.setItem('appledax-query-auth-profile-id', profile.id);

    const scope = encodeURIComponent('https://analysis.windows.net/powerbi/api/Dataset.Read.All https://analysis.windows.net/powerbi/api/Workspace.Read.All offline_access');
    const authorize = `https://login.microsoftonline.com/${encodeURIComponent(profile.tenantId)}/oauth2/v2.0/authorize` +
      `?client_id=${encodeURIComponent(profile.clientId)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(profile.redirectUri)}` +
      `&response_mode=query` +
      `&scope=${scope}` +
      `&state=${encodeURIComponent(state)}` +
      `&code_challenge=${encodeURIComponent(challenge)}` +
      `&code_challenge_method=S256`;
    window.location.href = authorize;
  }

  private async handleAuthCallback(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return;

    const expectedState = localStorage.getItem('appledax-query-auth-state');
    const codeVerifier = localStorage.getItem('appledax-query-code-verifier');
    const callbackProfileId = localStorage.getItem('appledax-query-auth-profile-id') ?? this.activeProfileId;
    const profile = this.profiles.find((item) => item.id === callbackProfileId) ?? this.getActiveProfile();

    if (!expectedState || state !== expectedState || !codeVerifier || !profile.clientId || !profile.redirectUri || !profile.tenantId) {
      this.latestError = { status: 400, code: 'AUTH_STATE', message: t('qw.error_auth_state') };
      this.latestErrorRaw = '';
      return;
    }

    const response = await fetch('/api/query/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: profile.tenantId,
        clientId: profile.clientId,
        redirectUri: profile.redirectUri,
        code,
        codeVerifier,
      }),
    });

    if (response.ok) {
      const payload = await response.json() as { accessToken: string; expiresIn: number; sessionId: string };
      const expiresAt = Date.now() + Math.max(60, Number(payload.expiresIn || 3600) - 60) * 1000;
      const next: QueryProfile = {
        ...profile,
        accessToken: payload.accessToken,
        sessionId: payload.sessionId,
        expiresAt,
      };
      this.profiles = upsertProfile(next);
      this.activeProfileId = next.id;
      setActiveProfileId(next.id);
      this.preflightStatus = null;
      params.delete('code');
      params.delete('state');
      window.history.replaceState({}, document.title, `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
      await this.refreshWorkspaces();
      this.render();
    } else {
      this.latestError = { status: response.status, code: 'AUTH_EXCHANGE', message: t('qw.error_auth_exchange') };
      this.latestErrorRaw = await response.text().catch(() => '');
      this.render();
    }
  }

  private async ensureAccessToken(): Promise<boolean> {
    const profile = this.getActiveProfile();
    if (profile.mode === 'service-principal') return true;
    if (!profile.accessToken || !profile.sessionId) {
      this.latestError = { status: 401, code: 'AUTH_REQUIRED', message: t('qw.error_auth_required') };
      this.latestErrorRaw = '';
      this.state.setRunStatus('error');
      this.render();
      return false;
    }
    if (Date.now() < profile.expiresAt) return true;

    const response = await fetch('/api/query/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: profile.sessionId }),
    });

    if (!response.ok) {
      this.latestError = { status: response.status, code: 'AUTH_REFRESH', message: t('qw.error_auth_refresh') };
      this.latestErrorRaw = await response.text().catch(() => '');
      this.state.setRunStatus('error');
      this.render();
      return false;
    }

    const payload = await response.json() as { accessToken: string; expiresIn: number; sessionId: string };
    const expiresAt = Date.now() + Math.max(60, Number(payload.expiresIn || 3600) - 60) * 1000;
    this.updateActiveProfile({
      accessToken: payload.accessToken,
      sessionId: payload.sessionId,
      expiresAt,
    });
    return true;
  }

  private isProfileReady(profile: QueryProfile): boolean {
    return Boolean(profile.name.trim());
  }

  private isAuthReady(profile: QueryProfile): boolean {
    if (profile.mode === 'service-principal') return true;
    return Boolean(profile.tenantId && profile.clientId && profile.redirectUri && profile.accessToken);
  }

  private isConnectionReady(profile: QueryProfile): boolean {
    return Boolean(profile.workspaceId && profile.datasetId);
  }

  private getConnection(profile: QueryProfile): QueryConnection {
    const workspace = this.workspaces.find((w) => w.id === profile.workspaceId);
    const dataset = this.datasets.find((d) => d.id === profile.datasetId);
    return {
      mode: profile.mode,
      workspaceId: profile.workspaceId,
      datasetId: profile.datasetId,
      workspaceName: workspace?.name,
      datasetName: dataset?.name,
      connectionRef: profile.mode === 'delegated' ? { accessToken: profile.accessToken } : undefined,
    };
  }

  private updateActiveProfile(patch: Partial<QueryProfile>): void {
    const current = this.getActiveProfile();
    const next: QueryProfile = {
      ...current,
      ...patch,
      redirectUri: (patch.redirectUri ?? current.redirectUri) || this.defaultRedirectUri(),
    };
    this.profiles = upsertProfile(next);
  }

  private getActiveProfile(): QueryProfile {
    let profile = this.profiles.find((item) => item.id === this.activeProfileId);
    if (profile) return profile;

    this.profiles = ensureProfiles(this.defaultRedirectUri());
    profile = this.profiles[0];
    this.activeProfileId = profile.id;
    setActiveProfileId(profile.id);
    return profile;
  }

  private resetConnectionState(): void {
    this.workspaces = [];
    this.datasets = [];
    this.preflightStatus = null;
  }

  private defaultRedirectUri(): string {
    return `${window.location.origin}${window.location.pathname}`;
  }
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) result += chars[bytes[i] % chars.length];
  return result;
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
