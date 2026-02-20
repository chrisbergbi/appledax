import { t } from '../i18n/index';
import * as store from '../model/store';
import { parseTmdlFiles } from '../model/tmdl-parser';
import { parseJsonModel } from '../model/json-parser';
import type { EditorAdapter } from '../editor/editor-interface';

export class ModelBrowserPanel {
  private container: HTMLElement;
  private editor: EditorAdapter;

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

    let treeHtml = '';
    for (const table of model.tables) {
      const colItems = table.columns.map((c) =>
        `<div class="mb-item mb-column" data-insert="'${esc(table.name)}'[${esc(c.name)}]">
          <span class="mb-item-icon mb-col-icon">&#9638;</span>
          <span class="mb-item-name">${esc(c.name)}</span>
          <span class="mb-item-type">${esc(c.dataType)}</span>
        </div>`
      ).join('');

      const measureItems = table.measures.map((m) =>
        `<div class="mb-item mb-measure" data-insert="[${esc(m.name)}]" title="${esc(m.expression)}">
          <span class="mb-item-icon mb-meas-icon">fx</span>
          <span class="mb-item-name">${esc(m.name)}</span>
        </div>`
      ).join('');

      const relatedTables = store.getRelatedTables(table.name);
      const relItems = relatedTables.map((rel) =>
        `<div class="mb-item mb-relationship" title="${esc(rel.viaColumn)} → ${esc(rel.relatedColumn)}">
          <span class="mb-item-icon mb-rel-icon">&#8644;</span>
          <span class="mb-item-name">${esc(rel.table)}</span>
          <span class="mb-item-type">${rel.isActive ? '' : '(inactive)'}</span>
        </div>`
      ).join('');

      treeHtml += `
        <div class="mb-table">
          <div class="mb-table-header" data-table="${esc(table.name)}">
            <span class="mb-toggle">&#9654;</span>
            <span class="mb-table-icon">&#9635;</span>
            <span class="mb-table-name">${esc(table.name)}</span>
            <span class="mb-table-count">${table.columns.length}c / ${table.measures.length}m</span>
          </div>
          <div class="mb-table-body" style="display:none">
            ${colItems}
            ${measureItems}
            ${relItems}
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="mb-upload-zone mb-upload-compact" id="mb-drop-zone">
        <p class="mb-upload-text-small">${esc(t('mb.upload_text'))}</p>
        <input type="file" id="mb-file-input" multiple accept=".tmdl,.json" style="display:none" />
        <input type="file" id="mb-folder-input" webkitdirectory style="display:none" />
      </div>
      <div class="mb-model-info">
        <span class="mb-model-stats">${t('mb.model_loaded', {
          tables: stats.tables,
          columns: stats.columns,
          measures: stats.measures,
          relationships: stats.relationships,
        })}</span>
        <button class="mb-clear-btn" id="mb-clear-btn">${esc(t('mb.clear_model'))}</button>
      </div>
      <div class="mb-tree">${treeHtml}</div>
    `;

    this.attachUploadHandlers();
    this.attachTreeHandlers();
    this.attachClearHandler();
  }

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

  private attachClearHandler(): void {
    const clearBtn = document.getElementById('mb-clear-btn');
    clearBtn?.addEventListener('click', () => store.clearModel());
  }

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

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
