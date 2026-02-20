import { t } from '../i18n/index';

export class BestPracticesPanel {
  private container: HTMLElement;

  constructor() {
    this.container = document.getElementById('best-practices-panel')!;
    this.render();
  }

  public render(): void {
    this.container.innerHTML = `
      <div class="bp-section">
        <h3>${t('bp.performance')}</h3>
        ${this.item('do', t('bp.perf_1'))}
        ${this.item('do', t('bp.perf_2'))}
        ${this.item('dont', t('bp.perf_3'))}
        ${this.item('tip', t('bp.perf_4'))}
      </div>

      <div class="bp-section">
        <h3>${t('bp.readability')}</h3>
        ${this.item('do', t('bp.read_1'))}
        ${this.item('do', t('bp.read_2'))}
        ${this.item('do', t('bp.read_3'))}
        ${this.item('tip', t('bp.read_4'))}
      </div>

      <div class="bp-section">
        <h3>${t('bp.error_handling')}</h3>
        ${this.item('do', t('bp.err_1'))}
        ${this.item('do', t('bp.err_2'))}
        ${this.item('dont', t('bp.err_3'))}
      </div>

      <div class="bp-section">
        <h3>${t('bp.context_awareness')}</h3>
        ${this.item('tip', t('bp.ctx_1'))}
        ${this.item('tip', t('bp.ctx_2'))}
        ${this.item('tip', t('bp.ctx_3'))}
        ${this.item('dont', t('bp.ctx_4'))}
      </div>

      <div class="bp-section">
        <h3>${t('bp.common_pitfalls')}</h3>
        ${this.item('dont', t('bp.pit_1'))}
        ${this.item('dont', t('bp.pit_2'))}
        ${this.item('tip', t('bp.pit_3'))}
        ${this.item('tip', t('bp.pit_4'))}
      </div>
    `;
  }

  private item(type: 'do' | 'dont' | 'tip', text: string): string {
    const labels: Record<string, string> = {
      do: t('bp.do'),
      dont: t('bp.dont'),
      tip: t('bp.tip'),
    };
    return `
      <div class="bp-item ${type}">
        <span class="bp-label">${labels[type]}</span>
        <span class="bp-text">${text}</span>
      </div>
    `;
  }
}
