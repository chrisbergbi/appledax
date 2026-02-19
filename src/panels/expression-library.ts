import { t } from '../i18n/index';
import type { EditorAdapter } from '../editor/editor-interface';
import * as XLSX from 'xlsx';

/* ── Data model ─────────────────────────────────────────────── */

interface SavedExpression {
  id: string;
  name: string;
  expression: string;
  type?: string;          // "Measure" | "Column" | undefined
  entity?: string;        // Entity / table name
  createdAt: number;
  updatedAt: number;
}

interface ExpressionFolder {
  id: string;
  name: string;
  collapsed: boolean;
  expressions: SavedExpression[];
}

interface LibraryData {
  version: 2;
  folders: ExpressionFolder[];
  ungrouped: SavedExpression[];
}

const DB_NAME = 'dax-validator-db';
const DB_STORE = 'expression-library';
const DB_VERSION = 1;
const LEGACY_KEY = 'dax-validator-expressions';

/* ── Helpers ────────────────────────────────────────────────── */

function uid(): string {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── IndexedDB helpers ──────────────────────────────────────── */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<LibraryData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: LibraryData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ── Panel class ────────────────────────────────────────────── */

export class ExpressionLibraryPanel {
  private container: HTMLElement;
  private editor: EditorAdapter;
  private data: LibraryData = { version: 2, folders: [], ungrouped: [] };
  private searchTerm = '';
  private ready = false;

  constructor(editor: EditorAdapter) {
    this.container = document.getElementById('expression-library-panel')!;
    this.editor = editor;
    this.init();
  }

  private async init(): Promise<void> {
    this.data = await this.load();
    this.ready = true;
    this.render();
  }

  /* ── Persistence (IndexedDB primary, localStorage fallback) ── */

  private async load(): Promise<LibraryData> {
    try {
      // Try IndexedDB first
      const idbData = await idbGet('library');
      if (idbData && idbData.version === 2) return idbData;

      // Migrate from localStorage if present
      const raw = localStorage.getItem(LEGACY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        let migrated: LibraryData;
        if (Array.isArray(parsed)) {
          migrated = { version: 2, folders: [], ungrouped: parsed };
        } else if (parsed.version === 2) {
          migrated = parsed;
        } else {
          migrated = { version: 2, folders: [], ungrouped: [] };
        }
        // Save to IndexedDB and clear localStorage
        await idbPut('library', migrated);
        localStorage.removeItem(LEGACY_KEY);
        return migrated;
      }
    } catch {
      // Fallback: try localStorage only
      try {
        const raw = localStorage.getItem(LEGACY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return { version: 2, folders: [], ungrouped: parsed };
          if (parsed.version === 2) return parsed;
        }
      } catch { /* ignore */ }
    }
    return { version: 2, folders: [], ungrouped: [] };
  }

  private async save(): Promise<void> {
    try {
      await idbPut('library', this.data);
    } catch (err) {
      console.error('Failed to save to IndexedDB:', err);
      // Fallback: try localStorage (may fail for large data)
      try {
        localStorage.setItem(LEGACY_KEY, JSON.stringify(this.data));
      } catch (lsErr) {
        console.error('localStorage also failed:', lsErr);
      }
    }
  }

  /* ── Public API ───────────────────────────────────────────── */

  public saveCurrentExpression(): void {
    const expression = this.editor.getValue().trim();
    if (!expression) return;

    const name = prompt(t('el.name_prompt'));
    if (!name) return;

    this.data.ungrouped.unshift({
      id: uid(),
      name,
      expression,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    this.save();
    this.render();
  }

  /* ── Expression actions ───────────────────────────────────── */

  private loadExpression(expr: SavedExpression): void {
    this.editor.setValue(expr.expression);
    this.editor.focus();
  }

  private renameExpression(expr: SavedExpression): void {
    const newName = prompt(t('el.rename_prompt'), expr.name);
    if (!newName || newName === expr.name) return;
    expr.name = newName;
    expr.updatedAt = Date.now();
    this.save();
    this.render();
  }

  private deleteExpression(expr: SavedExpression): void {
    if (!confirm(t('el.delete_confirm', { name: expr.name }))) return;
    for (const f of this.data.folders) {
      f.expressions = f.expressions.filter((e) => e.id !== expr.id);
    }
    this.data.ungrouped = this.data.ungrouped.filter((e) => e.id !== expr.id);
    this.save();
    this.render();
  }

  private updateExpression(expr: SavedExpression): void {
    expr.expression = this.editor.getValue().trim();
    expr.updatedAt = Date.now();
    this.save();
    this.render();
  }

  /* ── Folder actions ───────────────────────────────────────── */

  private createFolder(): void {
    const name = prompt(t('el.folder_name_prompt'));
    if (!name) return;
    this.data.folders.push({
      id: uid(),
      name,
      collapsed: false,
      expressions: [],
    });
    this.save();
    this.render();
  }

  private renameFolder(folder: ExpressionFolder): void {
    const newName = prompt(t('el.folder_rename_prompt'), folder.name);
    if (!newName || newName === folder.name) return;
    folder.name = newName;
    this.save();
    this.render();
  }

  private deleteFolder(folder: ExpressionFolder): void {
    if (!confirm(t('el.folder_delete_confirm', { name: folder.name, count: String(folder.expressions.length) }))) return;
    this.data.folders = this.data.folders.filter((f) => f.id !== folder.id);
    this.save();
    this.render();
  }

  private toggleFolder(folder: ExpressionFolder): void {
    folder.collapsed = !folder.collapsed;
    this.save();
    this.render();
  }

  /* ── XLSX import ──────────────────────────────────────────── */

  private handleXlsxUpload(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          this.showImportDialog(wb, file.name);
        } catch (err) {
          alert(t('el.import_error', { error: String(err) }));
        }
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  }

  private showImportDialog(wb: XLSX.WorkBook, fileName: string): void {
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) {
      alert(t('el.import_empty'));
      return;
    }

    // Detect headers from row 1 using direct cell access
    const headers: string[] = [];
    for (let c = 0; c < 26; c++) {
      const addr = String.fromCharCode(65 + c) + '1';
      const cell = ws[addr];
      if (cell?.v !== undefined) {
        headers.push(String(cell.v));
      } else {
        if (c > headers.length + 3) break;
        headers.push('');
      }
    }
    while (headers.length > 0 && !headers[headers.length - 1]) headers.pop();

    if (headers.length === 0) {
      alert(t('el.import_no_headers'));
      return;
    }

    const range = XLSX.utils.decode_range(ws['!ref']);
    const rowCount = range.e.r;

    const modal = document.createElement('div');
    modal.className = 'el-modal-overlay';
    modal.innerHTML = `
      <div class="el-modal">
        <div class="el-modal-header">
          <h3>${esc(t('el.import_title'))}</h3>
          <button class="el-modal-close">&times;</button>
        </div>
        <div class="el-modal-body">
          <p class="el-modal-info">${esc(t('el.import_file_info', { name: fileName, rows: String(rowCount), cols: String(headers.length) }))}</p>

          <div class="el-modal-field">
            <label>${esc(t('el.import_name_col'))}</label>
            <select id="el-col-name">
              <option value="">-- ${esc(t('el.import_select'))} --</option>
              ${headers.map((h, i) => h ? `<option value="${i}" ${h.toLowerCase() === 'name' ? 'selected' : ''}>${esc(h)}</option>` : '').join('')}
            </select>
          </div>

          <div class="el-modal-field">
            <label>${esc(t('el.import_expr_col'))}</label>
            <select id="el-col-expr">
              <option value="">-- ${esc(t('el.import_select'))} --</option>
              ${headers.map((h, i) => h ? `<option value="${i}" ${h.toLowerCase() === 'expression' ? 'selected' : ''}>${esc(h)}</option>` : '').join('')}
            </select>
          </div>

          <div class="el-modal-field">
            <label>${esc(t('el.import_type_col'))}</label>
            <select id="el-col-type">
              <option value="">${esc(t('el.import_none'))}</option>
              ${headers.map((h, i) => h ? `<option value="${i}" ${h.toLowerCase() === 'type' ? 'selected' : ''}>${esc(h)}</option>` : '').join('')}
            </select>
          </div>

          <div class="el-modal-field">
            <label>${esc(t('el.import_entity_col'))}</label>
            <select id="el-col-entity">
              <option value="">${esc(t('el.import_none'))}</option>
              ${headers.map((h, i) => h ? `<option value="${i}" ${h.toLowerCase() === 'entity' ? 'selected' : ''}>${esc(h)}</option>` : '').join('')}
            </select>
          </div>

          <hr class="el-modal-divider" />

          <div class="el-modal-field">
            <label>${esc(t('el.import_group_by'))}</label>
            <select id="el-col-group">
              <option value="">${esc(t('el.import_no_grouping'))}</option>
              ${headers.map((h, i) => h ? `<option value="${i}" ${h.toLowerCase() === 'customer' ? 'selected' : ''}>${esc(h)}</option>` : '').join('')}
            </select>
            <p class="el-modal-hint">${esc(t('el.import_group_hint'))}</p>
          </div>

          <div id="el-import-progress" class="el-progress-wrap" style="display:none">
            <div class="el-progress-bar"><div class="el-progress-fill" id="el-progress-fill"></div></div>
            <p class="el-progress-text" id="el-progress-text"></p>
          </div>
        </div>
        <div class="el-modal-footer">
          <button class="el-modal-cancel">${esc(t('el.import_cancel'))}</button>
          <button class="el-modal-import">${esc(t('el.import_btn'))}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.el-modal-close')?.addEventListener('click', close);
    modal.querySelector('.el-modal-cancel')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    modal.querySelector('.el-modal-import')?.addEventListener('click', () => {
      const colName = (modal.querySelector('#el-col-name') as HTMLSelectElement).value;
      const colExpr = (modal.querySelector('#el-col-expr') as HTMLSelectElement).value;
      const colType = (modal.querySelector('#el-col-type') as HTMLSelectElement).value;
      const colEntity = (modal.querySelector('#el-col-entity') as HTMLSelectElement).value;
      const colGroup = (modal.querySelector('#el-col-group') as HTMLSelectElement).value;

      if (!colName || !colExpr) {
        alert(t('el.import_required'));
        return;
      }

      // Disable buttons during import
      const importBtn = modal.querySelector('.el-modal-import') as HTMLButtonElement;
      const cancelBtn = modal.querySelector('.el-modal-cancel') as HTMLButtonElement;
      importBtn.disabled = true;
      importBtn.textContent = '⏳';
      cancelBtn.disabled = true;

      // Show progress
      const progressWrap = modal.querySelector('#el-import-progress') as HTMLElement;
      progressWrap.style.display = 'block';

      const nameIdx = parseInt(colName);
      const exprIdx = parseInt(colExpr);
      const typeIdx = colType ? parseInt(colType) : -1;
      const entityIdx = colEntity ? parseInt(colEntity) : -1;
      const groupIdx = colGroup ? parseInt(colGroup) : -1;

      // Use direct cell address strings (A, B, C...) for column access — much faster
      const colLetter = (idx: number): string => {
        if (idx < 26) return String.fromCharCode(65 + idx);
        return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
      };

      const nameCol = colLetter(nameIdx);
      const exprCol = colLetter(exprIdx);
      const typeCol = typeIdx >= 0 ? colLetter(typeIdx) : '';
      const entityCol = entityIdx >= 0 ? colLetter(entityIdx) : '';
      const groupCol = groupIdx >= 0 ? colLetter(groupIdx) : '';

      this.processImportAsync(
        ws, range.e.r, nameCol, exprCol, typeCol, entityCol, groupCol,
        modal,
      );
    });
  }

  private async processImportAsync(
    ws: XLSX.WorkSheet,
    maxRow: number,
    nameCol: string,
    exprCol: string,
    typeCol: string,
    entityCol: string,
    groupCol: string,
    modal: HTMLElement,
  ): Promise<void> {
    const grouped = new Map<string, SavedExpression[]>();
    const ungroupedImports: SavedExpression[] = [];
    const now = Date.now();
    let imported = 0;
    let idCounter = 0;

    const progressFill = modal.querySelector('#el-progress-fill') as HTMLElement;
    const progressText = modal.querySelector('#el-progress-text') as HTMLElement;

    const CHUNK_SIZE = 2000;

    for (let start = 2; start <= maxRow + 1; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, maxRow + 1);

      // Process chunk
      for (let r = start; r <= end; r++) {
        const nameCell = ws[nameCol + r]?.v;
        const exprCell = ws[exprCol + r]?.v;

        if (!nameCell && !exprCell) continue;

        const name = String(nameCell || '').trim();
        const expression = String(exprCell || '').trim();
        if (!expression) continue;

        // Use fast counter-based ID instead of crypto.randomUUID for performance
        idCounter++;
        const expr: SavedExpression = {
          id: `imp_${now}_${idCounter}`,
          name: name || `Expression ${r}`,
          expression,
          type: typeCol ? ws[typeCol + r]?.v?.toString() : undefined,
          entity: entityCol ? ws[entityCol + r]?.v?.toString() : undefined,
          createdAt: now,
          updatedAt: now,
        };

        if (groupCol) {
          const groupVal = ws[groupCol + r]?.v;
          const groupName = groupVal !== undefined ? String(groupVal).trim() : '';
          if (groupName) {
            let arr = grouped.get(groupName);
            if (!arr) {
              arr = [];
              grouped.set(groupName, arr);
            }
            arr.push(expr);
          } else {
            ungroupedImports.push(expr);
          }
        } else {
          ungroupedImports.push(expr);
        }

        imported++;
      }

      // Update progress bar
      const pct = Math.round(((end - 1) / maxRow) * 100);
      progressFill.style.width = `${pct}%`;
      progressText.textContent = t('el.import_progress', { current: String(imported), total: String(maxRow) });

      // Yield to UI thread between chunks
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Build folders
    progressText.textContent = t('el.import_saving');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const sortedGroups = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [groupName, exprs] of sortedGroups) {
      let folder = this.data.folders.find((f) => f.name === groupName);
      if (folder) {
        folder.expressions.push(...exprs);
      } else {
        this.data.folders.push({
          id: `fld_${now}_${groupName}`,
          name: groupName,
          collapsed: true,
          expressions: exprs,
        });
      }
    }

    this.data.ungrouped.unshift(...ungroupedImports);

    // Save to IndexedDB
    progressText.textContent = t('el.import_saving');
    try {
      await this.save();
    } catch (err) {
      modal.remove();
      alert(t('el.import_error', { error: String(err) }));
      this.render();
      return;
    }

    modal.remove();
    this.render();

    alert(t('el.import_success', {
      count: String(imported),
      folders: String(grouped.size),
    }));
  }

  /* ── Render ───────────────────────────────────────────────── */

  private render(): void {
    if (!this.ready) {
      this.container.innerHTML = `<div class="el-empty"><p>⏳</p></div>`;
      return;
    }

    const totalExprs = this.data.folders.reduce((s, f) => s + f.expressions.length, 0) + this.data.ungrouped.length;

    let html = `
      <div class="el-header">
        <div class="el-header-left">
          <button class="el-action-btn el-import-btn" id="el-import-btn" title="${esc(t('el.import_xlsx'))}">&#128194; ${esc(t('el.import_xlsx'))}</button>
          <button class="el-action-btn el-folder-btn" id="el-new-folder-btn" title="${esc(t('el.new_folder'))}">&#128193; +</button>
        </div>
        <button class="el-save-btn" id="el-save-btn">${esc(t('el.save_btn'))}</button>
      </div>
    `;

    if (totalExprs > 0) {
      html += `<div class="el-search-wrap">
        <input type="text" class="el-search-input" id="el-search" placeholder="${esc(t('el.search_placeholder'))}" value="${esc(this.searchTerm)}" />
        ${this.searchTerm ? '<button class="el-search-clear" id="el-search-clear">&times;</button>' : ''}
      </div>`;
    }

    if (totalExprs === 0) {
      html += `
        <div class="el-empty">
          <p>${esc(t('el.no_saved'))}</p>
          <p class="el-hint">${esc(t('el.no_saved_hint'))}</p>
          <p class="el-hint" style="margin-top:8px">${esc(t('el.import_hint'))}</p>
        </div>
      `;
    } else {
      html += '<div class="el-tree">';

      // Render folders
      for (const folder of this.data.folders) {
        const filtered = this.filterExpressions(folder.expressions);
        if (this.searchTerm && filtered.length === 0) continue;
        html += this.renderFolder(folder, filtered);
      }

      // Render ungrouped
      const filteredUngrouped = this.filterExpressions(this.data.ungrouped);
      if (filteredUngrouped.length > 0) {
        if (this.data.folders.length > 0) {
          html += `<div class="el-ungrouped-label">${esc(t('el.ungrouped'))}</div>`;
        }
        // Limit ungrouped rendering to first 50 for performance
        const renderLimit = this.searchTerm ? filteredUngrouped.length : Math.min(filteredUngrouped.length, 50);
        for (let i = 0; i < renderLimit; i++) {
          html += this.renderExpressionItem(filteredUngrouped[i]);
        }
        if (!this.searchTerm && filteredUngrouped.length > 50) {
          html += `<div class="el-more-label">${esc(t('el.more_items', { count: String(filteredUngrouped.length - 50) }))}</div>`;
        }
      }

      html += '</div>';
    }

    this.container.innerHTML = html;
    this.attachHandlers();
  }

  private filterExpressions(exprs: SavedExpression[]): SavedExpression[] {
    if (!this.searchTerm) return exprs;
    const q = this.searchTerm.toLowerCase();
    return exprs.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.expression.toLowerCase().includes(q) ||
      (e.entity && e.entity.toLowerCase().includes(q)) ||
      (e.type && e.type.toLowerCase().includes(q))
    );
  }

  private renderFolder(folder: ExpressionFolder, filtered: SavedExpression[]): string {
    const count = folder.expressions.length;
    const arrow = folder.collapsed ? '&#9654;' : '&#9660;';

    let html = `
      <div class="el-folder" data-folder-id="${esc(folder.id)}">
        <div class="el-folder-header" data-folder-id="${esc(folder.id)}">
          <span class="el-folder-toggle">${arrow}</span>
          <span class="el-folder-icon">&#128193;</span>
          <span class="el-folder-name">${esc(folder.name)}</span>
          <span class="el-folder-count">${count}</span>
          <div class="el-folder-actions">
            <button class="el-folder-action-btn el-folder-rename" data-folder-id="${esc(folder.id)}" title="${esc(t('el.rename_btn'))}">&#9998;</button>
            <button class="el-folder-action-btn el-folder-delete" data-folder-id="${esc(folder.id)}" title="${esc(t('el.delete_btn'))}">&times;</button>
          </div>
        </div>
    `;

    if (!folder.collapsed) {
      html += '<div class="el-folder-body">';
      // Lazy render: only first 50 items per expanded folder
      const renderLimit = this.searchTerm ? filtered.length : Math.min(filtered.length, 50);
      for (let i = 0; i < renderLimit; i++) {
        html += this.renderExpressionItem(filtered[i]);
      }
      if (!this.searchTerm && filtered.length > 50) {
        html += `<div class="el-more-label">${esc(t('el.more_items', { count: String(filtered.length - 50) }))}</div>`;
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  private renderExpressionItem(expr: SavedExpression): string {
    const preview = expr.expression.length > 80
      ? expr.expression.slice(0, 80).replace(/\n/g, ' ').replace(/\r/g, '') + '…'
      : expr.expression.replace(/\n/g, ' ').replace(/\r/g, '');

    const typeLabel = expr.type
      ? `<span class="el-item-type-badge ${expr.type === 'Measure' ? 'el-type-measure' : 'el-type-column'}">${esc(expr.type)}</span>`
      : '';

    const entityLabel = expr.entity
      ? `<span class="el-item-entity">${esc(expr.entity)}</span>`
      : '';

    return `
      <div class="el-item" data-id="${esc(expr.id)}">
        <div class="el-item-header">
          <div class="el-item-title-row">
            ${typeLabel}
            <span class="el-item-name">${esc(expr.name)}</span>
          </div>
          ${entityLabel}
        </div>
        <div class="el-item-preview">${esc(preview)}</div>
        <div class="el-item-actions">
          <button class="el-btn el-load-btn" data-action="load" data-id="${esc(expr.id)}">${esc(t('el.load_btn'))}</button>
          <button class="el-btn el-update-btn" data-action="update" data-id="${esc(expr.id)}">&#8635;</button>
          <button class="el-btn el-rename-btn" data-action="rename" data-id="${esc(expr.id)}">${esc(t('el.rename_btn'))}</button>
          <button class="el-btn el-delete-btn" data-action="delete" data-id="${esc(expr.id)}">${esc(t('el.delete_btn'))}</button>
        </div>
      </div>
    `;
  }

  /* ── Find expression by id ────────────────────────────────── */

  private findExpression(id: string): SavedExpression | undefined {
    for (const f of this.data.folders) {
      const found = f.expressions.find((e) => e.id === id);
      if (found) return found;
    }
    return this.data.ungrouped.find((e) => e.id === id);
  }

  private findFolder(id: string): ExpressionFolder | undefined {
    return this.data.folders.find((f) => f.id === id);
  }

  /* ── Event handlers ───────────────────────────────────────── */

  private attachHandlers(): void {
    document.getElementById('el-save-btn')?.addEventListener('click', () => {
      this.saveCurrentExpression();
    });

    document.getElementById('el-import-btn')?.addEventListener('click', () => {
      this.handleXlsxUpload();
    });

    document.getElementById('el-new-folder-btn')?.addEventListener('click', () => {
      this.createFolder();
    });

    // Search input with debounce
    const searchInput = document.getElementById('el-search') as HTMLInputElement | null;
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;
    searchInput?.addEventListener('input', () => {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.searchTerm = searchInput.value;
        this.render();
        const newInput = document.getElementById('el-search') as HTMLInputElement | null;
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(newInput.value.length, newInput.value.length);
        }
      }, 250);
    });

    document.getElementById('el-search-clear')?.addEventListener('click', () => {
      this.searchTerm = '';
      this.render();
    });

    // Folder headers (toggle)
    this.container.querySelectorAll<HTMLElement>('.el-folder-header').forEach((el) => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.el-folder-actions')) return;
        const folderId = el.dataset.folderId;
        if (!folderId) return;
        const folder = this.findFolder(folderId);
        if (folder) this.toggleFolder(folder);
      });
    });

    // Folder rename/delete
    this.container.querySelectorAll<HTMLButtonElement>('.el-folder-rename').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folder = this.findFolder(btn.dataset.folderId || '');
        if (folder) this.renameFolder(folder);
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('.el-folder-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folder = this.findFolder(btn.dataset.folderId || '');
        if (folder) this.deleteFolder(folder);
      });
    });

    // Expression actions
    this.container.querySelectorAll<HTMLButtonElement>('.el-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (!id) return;
        const expr = this.findExpression(id);
        if (!expr) return;

        switch (action) {
          case 'load':
            this.loadExpression(expr);
            break;
          case 'update':
            this.updateExpression(expr);
            break;
          case 'rename':
            this.renameExpression(expr);
            break;
          case 'delete':
            this.deleteExpression(expr);
            break;
        }
      });
    });
  }
}
