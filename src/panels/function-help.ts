import type * as monaco from 'monaco-editor';
import { getFunctionByName } from '../knowledge/lookup';
import type { DaxFunction } from '../types';
import { t } from '../i18n/index';

export class FunctionHelpPanel {
  private container: HTMLElement;

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.container = document.getElementById('function-help-panel')!;

    editor.onDidChangeCursorPosition((e) => {
      const model = editor.getModel();
      if (!model) return;
      const word = model.getWordAtPosition(e.position);
      if (word) {
        const func = getFunctionByName(word.word);
        if (func) {
          this.renderFunction(func);
          return;
        }
      }
      this.renderDefault();
    });

    this.renderDefault();
  }

  private renderFunction(func: DaxFunction): void {
    const paramsHtml = func.params.length > 0
      ? `<h3>${t('fh.parameters')}</h3>
         <table class="params-table">
           ${func.params.map((p) =>
             `<tr>
               <td><code>${this.esc(p.name)}</code></td>
               <td>${this.esc(p.type)}</td>
               <td>${this.esc(p.description)}${p.required === false ? ` <em>${t('fh.optional')}</em>` : ''}</td>
             </tr>`
           ).join('')}
         </table>`
      : '';

    const notesHtml = func.notes.length > 0
      ? `<h3>${t('fh.notes')}</h3><ul>${func.notes.map((n) => `<li>${this.esc(n)}</li>`).join('')}</ul>`
      : '';

    const pitfallsHtml = func.pitfalls.length > 0
      ? `<h3>${t('fh.pitfalls')}</h3><ul>${func.pitfalls.map((p) => `<li class="pitfall-item">${this.esc(p)}</li>`).join('')}</ul>`
      : '';

    const examplesHtml = func.examples.length > 0
      ? `<h3>${t('fh.examples')}</h3>${func.examples.map((ex) => `<pre><code>${this.esc(ex)}</code></pre>`).join('')}`
      : '';

    this.container.innerHTML = `
      <div class="func-help">
        <h2>${this.esc(func.name)}</h2>
        <span class="func-category">${this.esc(func.category)}</span>
        <div class="func-signature"><code>${this.esc(func.signatures.join('\n'))}</code></div>
        <p>${this.esc(func.description_short)}</p>
        ${paramsHtml}
        <p><strong>${t('fh.returns')}</strong> ${this.esc(func.returns)}</p>
        ${notesHtml}
        ${pitfallsHtml}
        ${examplesHtml}
        <a href="${this.esc(func.learn_url)}" target="_blank" rel="noopener noreferrer">${t('fh.learn_more')} &rarr;</a>
      </div>
    `;
  }

  private renderDefault(): void {
    this.container.innerHTML = `
      <div class="func-help-default">
        <p>${t('fh.default_1')}</p>
        <p>${t('fh.default_2')}</p>
        <p>${t('fh.default_3')}</p>
      </div>
    `;
  }

  private esc(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
