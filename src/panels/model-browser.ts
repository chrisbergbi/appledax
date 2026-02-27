import { t } from '../i18n/index';
import * as store from '../model/store';
import { parseTmdlFiles } from '../model/tmdl-parser';
import { parseJsonModel } from '../model/json-parser';
import { restoreDefaultModel } from '../model/default-model';
import type { EditorAdapter } from '../editor/editor-interface';
import type { ModelTable, ModelColumn, ModelMeasure, ModelTranslation } from '../model/types';
import type { RelatedTableInfo } from '../model/store';

/* ── Helpers ────────────────────────────────────────────── */

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function translationTooltip(translations?: ModelTranslation[]): string {
  if (!translations || translations.length === 0) return '';
  return '\n\ud83c\udf10 ' + translations.map((tr) => `${tr.culture}: ${tr.caption ?? ''}`).filter((s) => s.length > 5).join(' | ');
}

/* ── Render helpers ─────────────────────────────────────── */

function renderColumnItem(table: ModelTable, c: ModelColumn): string {
  const hiddenClass = c.isHidden ? ' mb-hidden' : '';
  const calcBadge = c.isCalculated
    ? `<span class="mb-calc-badge">${esc(t('mb.calculated_indicator'))}</span>`
    : '';

  let tooltip = c.name;
  if (c.dataType) tooltip += ` (${c.dataType})`;
  if (c.isHidden) tooltip += ` ${t('mb.hidden_indicator')}`;
  if (c.description) tooltip += `\n${c.description}`;
  tooltip += translationTooltip(c.translations);

  return `<div class="mb-item mb-column${hiddenClass}" data-insert="'${esc(table.name)}'[${esc(c.name)}]" title="${esc(tooltip)}">
    <span class="mb-item-icon mb-col-icon">&#9638;</span>
    <span class="mb-item-name">${esc(c.name)}</span>
    ${calcBadge}
    <span class="mb-item-type">${esc(c.dataType)}</span>
  </div>`;
}

function renderMeasureItem(_table: ModelTable, m: ModelMeasure): string {
  let tooltip = '';
  if (m.description) tooltip += m.description + '\n\n';
  tooltip += m.expression;
  tooltip += translationTooltip(m.translations);

  return `<div class="mb-item mb-measure" data-insert="[${esc(m.name)}]" title="${esc(tooltip)}">
    <span class="mb-item-icon mb-meas-icon">fx</span>
    <span class="mb-item-name">${esc(m.name)}</span>
  </div>`;
}

function renderRelationshipItem(table: ModelTable, rel: RelatedTableInfo): string {
  const cardinality = rel.direction === 'to'
    ? t('mb.cardinality_many_to_one')
    : t('mb.cardinality_one_to_many');

  const arrow = rel.crossFilteringBehavior === 'bothDirections' ? '\u2194' : '\u2192';
  const inactiveBadge = rel.isActive
    ? ''
    : `<span class="mb-inactive-badge">${esc(t('mb.inactive_badge'))}</span>`;

  const joinText = `${table.name}[${rel.viaColumn}] ${arrow} ${rel.table}[${rel.relatedColumn}]`;

  return `<div class="mb-item mb-relationship" title="${esc(joinText)}">
    <span class="mb-item-icon mb-rel-icon">&#8644;</span>
    <span class="mb-item-name">${esc(rel.table)}</span>
    <span class="mb-rel-cardinality">${esc(cardinality)}</span>
    <span class="mb-rel-join">${esc(rel.viaColumn)} ${arrow} ${esc(rel.relatedColumn)}</span>
    ${inactiveBadge}
  </div>`;
}

function buildCategorySection(
  key: string,
  label: string,
  count: number,
  itemsHtml: string,
): string {
  if (count === 0) return '';
  return `<div class="mb-category">
    <div class="mb-category-header" data-category="${esc(key)}">
      <span class="mb-category-toggle">\u25BC</span>
      <span class="mb-category-name">${esc(label)}</span>
      <span class="mb-category-count">${count}</span>
    </div>
    <div class="mb-category-body">${itemsHtml}</div>
  </div>`;
}

/* ── Panel class ────────────────────────────────────────── */

export class ModelBrowserPanel {
  private container: HTMLElement;
  private editor: EditorAdapter;
  private searchTerm = '';
  private sortAlpha = false;

  constructor(editor: EditorAdapter) {
    this.container = document.getElementById('model-browser-panel')!;
    this.editor = editor;

    store.onModelChange(() => this.render());
    this.render();
  }

  public render(): void {
    const model = store.getModel();

    if (!model) {
      this.renderEmpty();
    } else {
      this.renderModel();
    }
  }

  private renderEmpty(): void {
    this.container.innerHTML = `
      <div class="mb-upload-zone" id="mb-drop-zone">
        <div class="mb-upload-icon">&#128194;</div>
        <p class="mb-upload-text">${esc(t('mb.upload_text'))}</p>
        <div class="mb-upload-buttons">
          <button class="mb-upload-btn" id="mb-upload-btn">${esc(t('mb.upload_files_btn'))}</button>
          <button class="mb-upload-btn mb-upload-folder-btn" id="mb-upload-folder-btn">${esc(t('mb.upload_folder_btn'))}</button>
        </div>
        <input type="file" id="mb-file-input" multiple accept=".tmdl,.json" style="display:none" />
        <input type="file" id="mb-folder-input" webkitdirectory style="display:none" />
      </div>
      <div class="mb-no-model">
        <p>${esc(t('mb.no_model'))}</p>
        <p class="mb-hint">${esc(t('mb.no_model_hint'))}</p>
      </div>
    `;
    this.attachUploadHandlers();
  }

  private renderModel(): void {
    const stats = store.getModelStats();
    const model = store.getModel()!;
    const searchLower = this.searchTerm.toLowerCase();

    // Sort tables
    let tables = [...model.tables];
    if (this.sortAlpha) {
      tables.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }

    // Build tree
    let treeHtml = '';
    for (const table of tables) {
      const tableNameMatches = !searchLower || table.name.toLowerCase().includes(searchLower);

      // Filter children
      let filteredColumns = table.columns;
      let filteredMeasures = table.measures;
      let filteredRels = store.getRelatedTables(table.name);

      if (searchLower && !tableNameMatches) {
        filteredColumns = table.columns.filter((c) => c.name.toLowerCase().includes(searchLower));
        filteredMeasures = table.measures.filter((m) => m.name.toLowerCase().includes(searchLower));
        filteredRels = filteredRels.filter((r) => r.table.toLowerCase().includes(searchLower));

        if (filteredColumns.length === 0 && filteredMeasures.length === 0 && filteredRels.length === 0) continue;
      }

      // Sort within categories
      if (this.sortAlpha) {
        filteredColumns = [...filteredColumns].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        filteredMeasures = [...filteredMeasures].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        filteredRels = [...filteredRels].sort((a, b) => a.table.localeCompare(b.table, undefined, { sensitivity: 'base' }));
      }

      // Build category sections
      const colHtml = filteredColumns.map((c) => renderColumnItem(table, c)).join('');
      const measHtml = filteredMeasures.map((m) => renderMeasureItem(table, m)).join('');
      const relHtml = filteredRels.map((r) => renderRelationshipItem(table, r)).join('');

      const colSection = buildCategorySection('columns', t('mb.columns_section'), filteredColumns.length, colHtml);
      const measSection = buildCategorySection('measures', t('mb.measures_section'), filteredMeasures.length, measHtml);
      const relSection = buildCategorySection('relationships', t('mb.relationships_section'), filteredRels.length, relHtml);

      const bodyDisplay = searchLower ? 'block' : 'none';
      const toggleChar = searchLower ? '\u25BC' : '\u25B6';
      const tableHiddenClass = table.isHidden ? ' mb-hidden' : '';

      let tableTitle = table.name;
      if (table.isHidden) tableTitle += ` ${t('mb.hidden_indicator')}`;
      tableTitle += translationTooltip(table.translations);

      treeHtml += `
        <div class="mb-table">
          <div class="mb-table-header${tableHiddenClass}" data-table="${esc(table.name)}" title="${esc(tableTitle)}">
            <span class="mb-toggle">${toggleChar}</span>
            <span class="mb-table-icon">&#9635;</span>
            <span class="mb-table-name">${esc(table.name)}</span>
            <span class="mb-table-count">${table.columns.length}c / ${table.measures.length}m</span>
          </div>
          <div class="mb-table-body" style="display:${bodyDisplay}">
            ${colSection}
            ${measSection}
            ${relSection}
          </div>
        </div>
      `;
    }

    // No results message
    if (searchLower && treeHtml === '') {
      treeHtml = `<div class="mb-no-results">${esc(t('mb.no_search_results'))}</div>`;
    }

    const isDefault = store.isDefaultModel();
    const defaultBadge = isDefault
      ? `<span class="mb-default-badge">${esc(t('mb.default_model'))}</span>`
      : '';
    const clearBtnLabel = isDefault
      ? ''
      : `<button class="mb-clear-btn" id="mb-clear-btn">${esc(t('mb.clear_model'))}</button>`;

    const sortIcon = this.sortAlpha ? 'A\u2193Z' : '\u2195';
    const sortTitle = this.sortAlpha ? t('mb.sort_default_title') : t('mb.sort_az_title');

    this.container.innerHTML = `
      <div class="mb-upload-zone mb-upload-compact" id="mb-drop-zone">
        <p class="mb-upload-text-small">${isDefault ? esc(t('mb.upload_to_replace')) : esc(t('mb.upload_text'))}</p>
        <input type="file" id="mb-file-input" multiple accept=".tmdl,.json" style="display:none" />
        <input type="file" id="mb-folder-input" webkitdirectory style="display:none" />
      </div>
      <div class="mb-model-info">
        ${defaultBadge}
        <span class="mb-model-stats">${t('mb.model_loaded', {
          tables: stats.tables,
          columns: stats.columns,
          measures: stats.measures,
          relationships: stats.relationships,
        })}</span>
        ${clearBtnLabel}
      </div>
      <div class="mb-toolbar">
        <div class="mb-search-wrap">
          <input type="text" class="mb-search-input" id="mb-search"
                 placeholder="${esc(t('mb.search_placeholder'))}"
                 value="${esc(this.searchTerm)}" />
          ${this.searchTerm ? '<button class="mb-search-clear" id="mb-search-clear">&times;</button>' : ''}
        </div>
        <button class="mb-sort-btn" id="mb-sort-btn" title="${esc(sortTitle)}">${sortIcon}</button>
      </div>
      <div class="mb-tree">${treeHtml}</div>
    `;

    this.attachUploadHandlers();
    this.attachTreeHandlers();
    this.attachToolbarHandlers();
    this.attachClearHandler();
  }

  /* ── Event handlers ───────────────────────────────────── */

  private attachUploadHandlers(): void {
    const dropZone = document.getElementById('mb-drop-zone');
    const fileInput = document.getElementById('mb-file-input') as HTMLInputElement | null;
    const folderInput = document.getElementById('mb-folder-input') as HTMLInputElement | null;
    const uploadBtn = document.getElementById('mb-upload-btn');
    const folderBtn = document.getElementById('mb-upload-folder-btn');

    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('mb-drag-over');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('mb-drag-over');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('mb-drag-over');
        const files = (e as DragEvent).dataTransfer?.files;
        if (files) this.handleFiles(files);
      });
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput?.click();
      });
    }

    if (folderBtn) {
      folderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        folderInput?.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', () => {
        if (fileInput.files) this.handleFiles(fileInput.files);
        fileInput.value = '';
      });
    }

    if (folderInput) {
      folderInput.addEventListener('change', () => {
        if (folderInput.files) this.handleFiles(folderInput.files);
        folderInput.value = '';
      });
    }
  }

  private attachTreeHandlers(): void {
    // Table header toggles
    this.container.querySelectorAll<HTMLElement>('.mb-table-header').forEach((header) => {
      header.addEventListener('click', () => {
        const body = header.nextElementSibling as HTMLElement;
        const toggle = header.querySelector('.mb-toggle') as HTMLElement;
        if (body.style.display === 'none') {
          body.style.display = 'block';
          toggle.textContent = '\u25BC';
        } else {
          body.style.display = 'none';
          toggle.textContent = '\u25B6';
        }
      });
    });

    // Category sub-header toggles
    this.container.querySelectorAll<HTMLElement>('.mb-category-header').forEach((header) => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const body = header.nextElementSibling as HTMLElement;
        const toggle = header.querySelector('.mb-category-toggle') as HTMLElement;
        if (body.style.display === 'none') {
          body.style.display = 'block';
          toggle.textContent = '\u25BC';
        } else {
          body.style.display = 'none';
          toggle.textContent = '\u25B6';
        }
      });
    });

    // Click item to insert reference
    this.container.querySelectorAll<HTMLElement>('.mb-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const insertText = item.dataset.insert;
        if (insertText) {
          this.editor.insertAtCursor(insertText);
          this.editor.focus();
        }
      });
    });
  }

  private attachToolbarHandlers(): void {
    const searchInput = document.getElementById('mb-search') as HTMLInputElement | null;
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;

    searchInput?.addEventListener('input', () => {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.searchTerm = searchInput.value;
        this.render();
        // Restore focus
        const newInput = document.getElementById('mb-search') as HTMLInputElement | null;
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(newInput.value.length, newInput.value.length);
        }
      }, 200);
    });

    document.getElementById('mb-search-clear')?.addEventListener('click', () => {
      this.searchTerm = '';
      this.render();
    });

    document.getElementById('mb-sort-btn')?.addEventListener('click', () => {
      this.sortAlpha = !this.sortAlpha;
      this.render();
    });
  }

  private attachClearHandler(): void {
    const clearBtn = document.getElementById('mb-clear-btn');
    clearBtn?.addEventListener('click', () => restoreDefaultModel());
  }

  /* ── File handling ────────────────────────────────────── */

  private async handleFiles(fileList: FileList): Promise<void> {
    const files: Array<{ name: string; content: string }> = [];

    for (const file of Array.from(fileList)) {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.tmdl') && !lower.endsWith('.json')) continue;

      const content = await file.text();
      files.push({ name: file.name, content });
    }

    if (files.length === 0) return;

    try {
      const jsonFiles = files.filter((f) => f.name.endsWith('.json'));
      const tmdlFiles = files.filter((f) => f.name.endsWith('.tmdl'));

      if (jsonFiles.length > 0) {
        const model = parseJsonModel(jsonFiles[0].content);
        store.setModel(model);
      } else if (tmdlFiles.length > 0) {
        const model = parseTmdlFiles(tmdlFiles);
        store.setModel(model);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(t('mb.parse_error', { error: msg }));
    }
  }
}
