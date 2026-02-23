import { t } from '../i18n/index';
import type { EditorAdapter } from '../editor/editor-interface';
import { isPuterLoaded, chatStream, signIn, getModel, setModel, listModels, FAVORITE_MODELS } from '../ai/provider';
import type { ChatMessage, AIModel } from '../ai/provider';
import { buildSystemPrompt } from '../ai/context';
import { PERSONAS, getPersona, setPersona } from '../ai/personas';

/* ── Helpers ────────────────────────────────────────────── */

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface UIMessage {
  role: 'user' | 'assistant';
  content: string;
  /** If true, content is raw HTML and should not be escaped/formatted */
  rawHtml?: boolean;
  /** Model ID used for this assistant message */
  model?: string;
}

/* ── Markdown-like formatter ─────────────────────────────── */

function formatMarkdown(raw: string): string {
  let html = esc(raw);

  // Code blocks: ```lang\n...\n```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const trimmedCode = code.trim();
    // Decode entities back for the data attribute (will be re-escaped by esc())
    const decoded = trimmedCode
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    return `<pre class="ai-code-block"><code>${trimmedCode}</code></pre>` +
      `<button class="ai-insert-btn" data-code="${esc(decoded)}">${esc(t('ai.insert'))}</button>`;
  });

  // Inline code: `...`
  html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');

  // Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Headers at line start: ### or ##
  html = html.replace(/^### (.+)$/gm, '<h4 class="ai-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="ai-h3">$1</h3>');

  // Bullet lists: - item or * item
  html = html.replace(/^[-*] (.+)$/gm, '<li class="ai-li">$1</li>');

  // Numbered lists: 1. item
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ai-li">$1</li>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li class="ai-li">[\s\S]*?<\/li>\s*)+)/g, '<ul class="ai-list">$1</ul>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  // Clean up <br> after block elements
  html = html.replace(/<\/pre><br>/g, '</pre>');
  html = html.replace(/<\/h[34]><br>/g, (m) => m.replace('<br>', ''));
  html = html.replace(/<\/ul><br>/g, '</ul>');
  html = html.replace(/<\/li><br>/g, '</li>');
  html = html.replace(/<br><ul/g, '<ul');

  return html;
}

/* ── Panel class ────────────────────────────────────────── */

export class AIAssistantPanel {
  private container: HTMLElement;
  private editor: EditorAdapter;
  private messages: UIMessage[] = [];
  private isLoading = false;
  private streamingContent = '';
  private allModels: AIModel[] = [];
  private modelsLoaded = false;

  constructor(editor: EditorAdapter) {
    this.container = document.getElementById('ai-assistant-panel')!;
    this.editor = editor;
    this.render();
  }

  public render(): void {
    if (!isPuterLoaded()) {
      this.renderUnavailable();
      return;
    }
    // Puter.js v2 handles authentication automatically (temporary user sessions).
    // No explicit sign-in gate is needed — ai.chat() will prompt if required.
    this.renderChat();

    // Load model list in the background (non-blocking)
    if (!this.modelsLoaded) {
      this.loadModelList();
    }
  }

  /* ── Render states ────────────────────────────────────── */

  private renderUnavailable(): void {
    this.container.innerHTML = `
      <div class="ai-empty">
        <p class="ai-empty-icon">&#129302;</p>
        <p>${esc(t('ai.unavailable'))}</p>
        <p class="ai-hint">${esc(t('ai.unavailable_hint'))}</p>
      </div>
    `;
  }

  private renderChat(): void {
    let messagesHtml = '';

    if (this.messages.length === 0 && !this.isLoading) {
      messagesHtml = `
        <div class="ai-welcome">
          <p>${esc(t('ai.welcome'))}</p>
          <div class="ai-suggestions">
            <button class="ai-suggestion" data-q="explain">${esc(t('ai.suggest_explain'))}</button>
            <button class="ai-suggestion" data-q="optimize">${esc(t('ai.suggest_optimize'))}</button>
            <button class="ai-suggestion" data-q="fix">${esc(t('ai.suggest_fix'))}</button>
          </div>
        </div>
      `;
    } else {
      messagesHtml = this.messages.map((msg) => {
        const roleClass = msg.role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant';
        const content = msg.rawHtml
          ? msg.content
          : msg.role === 'assistant'
            ? formatMarkdown(msg.content)
            : esc(msg.content);
        const badgeHtml = msg.role === 'assistant' && msg.model && !msg.rawHtml
          ? `<span class="ai-model-badge">${esc(msg.model)}</span>`
          : '';
        return `<div class="ai-msg ${roleClass}">${content}${badgeHtml}</div>`;
      }).join('');
    }

    // Streaming indicator
    const loadingHtml = this.isLoading
      ? this.streamingContent
        ? `<div class="ai-msg ai-msg-assistant ai-streaming">${formatMarkdown(this.streamingContent)}<span class="ai-cursor">&#9646;</span></div>`
        : `<div class="ai-msg ai-msg-assistant ai-loading"><span class="ai-dots">&#8226;&#8226;&#8226;</span></div>`
      : '';

    const hasHistory = this.messages.length > 0;
    const clearBtnHtml = hasHistory && !this.isLoading
      ? `<button class="ai-clear-btn" id="ai-clear-btn" title="${esc(t('ai.new_chat'))}">${esc(t('ai.new_chat'))}</button>`
      : '';

    const personaSelectorHtml = this.buildPersonaSelectorHtml();
    const modelSelectHtml = this.buildModelSelectHtml();

    this.container.innerHTML = `
      <div class="ai-chat">
        <div class="ai-chat-header">
          ${personaSelectorHtml}
          ${modelSelectHtml}
          <div class="ai-header-spacer"></div>
          ${clearBtnHtml}
        </div>
        <div class="ai-messages" id="ai-messages">
          ${messagesHtml}
          ${loadingHtml}
        </div>
        <div class="ai-input-area">
          <textarea class="ai-input" id="ai-input" placeholder="${esc(t('ai.placeholder'))}" rows="2"${this.isLoading ? ' disabled' : ''}></textarea>
          <button class="ai-send-btn" id="ai-send-btn"${this.isLoading ? ' disabled' : ''}>${esc(t('ai.send'))}</button>
        </div>
      </div>
    `;

    this.attachChatHandlers();
    this.scrollToBottom();
  }

  /* ── Model selector ─────────────────────────────────── */

  private buildModelSelectHtml(): string {
    const currentModel = getModel();

    // Build favorites options
    let optionsHtml = `<optgroup label="${esc(t('ai.model_favorites'))}">`;
    for (const m of FAVORITE_MODELS) {
      const selected = m.id === currentModel ? ' selected' : '';
      optionsHtml += `<option value="${esc(m.id)}"${selected}>${esc(m.name)}</option>`;
    }
    optionsHtml += '</optgroup>';

    // Build full model list grouped by provider
    if (this.allModels.length > 0) {
      const byProvider = new Map<string, AIModel[]>();
      for (const m of this.allModels) {
        const group = byProvider.get(m.provider) ?? [];
        group.push(m);
        byProvider.set(m.provider, group);
      }

      for (const [provider, models] of byProvider) {
        optionsHtml += `<optgroup label="${esc(provider)}">`;
        for (const m of models) {
          const selected = m.id === currentModel ? ' selected' : '';
          optionsHtml += `<option value="${esc(m.id)}"${selected}>${esc(m.name)}</option>`;
        }
        optionsHtml += '</optgroup>';
      }
    } else if (!this.modelsLoaded) {
      optionsHtml += `<optgroup label="${esc(t('ai.model_loading'))}">`;
      optionsHtml += `<option disabled>${esc(t('ai.model_loading'))}</option>`;
      optionsHtml += '</optgroup>';
    }

    // If current model isn't in favorites or allModels, add it as a standalone option
    const allKnownIds = new Set([
      ...FAVORITE_MODELS.map((m) => m.id),
      ...this.allModels.map((m) => m.id),
    ]);
    if (!allKnownIds.has(currentModel)) {
      optionsHtml = `<option value="${esc(currentModel)}" selected>${esc(currentModel)}</option>` + optionsHtml;
    }

    return `<select class="ai-model-select" id="ai-model-select" title="${esc(t('ai.model_label'))}">${optionsHtml}</select>`;
  }

  /* ── Persona selector ───────────────────────────────── */

  private buildPersonaSelectorHtml(): string {
    const currentPersona = getPersona();
    let optionsHtml = '';
    for (const p of PERSONAS) {
      const selected = p.id === currentPersona ? ' selected' : '';
      optionsHtml += `<option value="${esc(p.id)}"${selected}>${esc(t(p.nameKey))}</option>`;
    }
    return `<select class="ai-persona-select" id="ai-persona-select" title="${esc(t('ai.persona_label'))}">${optionsHtml}</select>`;
  }

  private async loadModelList(): Promise<void> {
    try {
      this.allModels = await listModels();
    } catch {
      this.allModels = [];
    }
    this.modelsLoaded = true;

    // Update the select element in-place if it exists (don't re-render whole panel)
    const selectEl = document.getElementById('ai-model-select') as HTMLSelectElement | null;
    if (selectEl) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.buildModelSelectHtml();
      const newSelect = tempDiv.querySelector('select');
      if (newSelect) {
        selectEl.innerHTML = newSelect.innerHTML;
      }
    }
  }

  /* ── Event handlers ───────────────────────────────────── */

  private attachChatHandlers(): void {
    const input = document.getElementById('ai-input') as HTMLTextAreaElement | null;
    const sendBtn = document.getElementById('ai-send-btn');
    const clearBtn = document.getElementById('ai-clear-btn');
    const modelSelect = document.getElementById('ai-model-select') as HTMLSelectElement | null;

    const sendMessage = () => {
      const text = input?.value.trim();
      if (!text || this.isLoading) return;
      this.handleSend(text);
    };

    sendBtn?.addEventListener('click', sendMessage);

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea
    input?.addEventListener('input', () => {
      if (input) {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      }
    });

    // Persona selector change
    const personaSelect = document.getElementById('ai-persona-select') as HTMLSelectElement | null;
    personaSelect?.addEventListener('change', () => {
      setPersona(personaSelect.value);
    });

    // Model selector change
    modelSelect?.addEventListener('change', () => {
      setModel(modelSelect.value);
    });

    // Quick suggestion buttons
    this.container.querySelectorAll<HTMLButtonElement>('.ai-suggestion').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.q;
        const prompts: Record<string, string> = {
          explain: t('ai.prompt_explain'),
          optimize: t('ai.prompt_optimize'),
          fix: t('ai.prompt_fix'),
        };
        if (q && prompts[q]) this.handleSend(prompts[q]);
      });
    });

    // Insert-to-editor buttons
    this.container.querySelectorAll<HTMLButtonElement>('.ai-insert-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.code;
        if (code) {
          this.editor.insertAtCursor(code);
          this.editor.focus();
        }
      });
    });

    // Clear/new chat button
    clearBtn?.addEventListener('click', () => {
      this.messages = [];
      this.streamingContent = '';
      this.isLoading = false;
      this.render();
    });

    input?.focus();
  }

  /**
   * Attach click handler for inline sign-in button shown when auth is required.
   */
  private attachSignInHandler(): void {
    const btn = this.container.querySelector('#ai-inline-signin') as HTMLButtonElement | null;
    btn?.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '...';
      try {
        await signIn();
        // Remove the auth message and retry the last user message
        const lastUserMsg = [...this.messages].reverse().find((m) => m.role === 'user');
        // Remove the auth error message
        if (this.messages.length > 0 && this.messages[this.messages.length - 1].role === 'assistant') {
          this.messages.pop();
        }
        if (lastUserMsg) {
          // Remove the user message too — handleSend will re-add it
          const idx = this.messages.lastIndexOf(lastUserMsg);
          if (idx >= 0) this.messages.splice(idx, 1);
          this.render();
          await this.handleSend(lastUserMsg.content);
        } else {
          this.render();
        }
      } catch {
        btn.textContent = t('ai.signin_btn');
        btn.disabled = false;
      }
    });
  }

  /* ── Send message with streaming ───────────────────────── */

  private async handleSend(text: string): Promise<void> {
    this.messages.push({ role: 'user', content: text });
    this.isLoading = true;
    this.streamingContent = '';
    this.render();

    const usedModel = getModel();

    try {
      const systemPrompt = buildSystemPrompt(this.editor);
      const apiMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this.messages
          .filter((m) => !m.rawHtml)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];

      const fullResponse = await chatStream(apiMessages, (chunk) => {
        this.streamingContent += chunk;
        this.updateStreamingMessage();
      });

      this.messages.push({ role: 'assistant', content: fullResponse, model: usedModel });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg === 'AUTH_REQUIRED') {
        // Puter needs the user to sign in — show inline prompt
        this.messages.push({
          role: 'assistant',
          content: t('ai.needs_signin'),
          rawHtml: true,
        });
        this.isLoading = false;
        this.streamingContent = '';
        this.render();
        this.attachSignInHandler();
        return;
      }
      this.messages.push({ role: 'assistant', content: `${t('ai.error')}: ${errorMsg}`, model: usedModel });
    }

    this.isLoading = false;
    this.streamingContent = '';
    this.render();
  }

  /**
   * Update just the streaming message area without full re-render.
   * Avoids flickering and losing scroll position during streaming.
   */
  private updateStreamingMessage(): void {
    const msgContainer = document.getElementById('ai-messages');
    if (!msgContainer) return;

    let streamEl = msgContainer.querySelector('.ai-streaming') as HTMLElement | null;
    if (!streamEl) {
      // Remove loading dots if present
      const loadingEl = msgContainer.querySelector('.ai-loading');
      if (loadingEl) loadingEl.remove();

      streamEl = document.createElement('div');
      streamEl.className = 'ai-msg ai-msg-assistant ai-streaming';
      msgContainer.appendChild(streamEl);
    }

    streamEl.innerHTML = formatMarkdown(this.streamingContent) + '<span class="ai-cursor">&#9646;</span>';

    // Re-attach insert buttons
    streamEl.querySelectorAll<HTMLButtonElement>('.ai-insert-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.code;
        if (code) {
          this.editor.insertAtCursor(code);
          this.editor.focus();
        }
      });
    });

    this.scrollToBottom();
  }

  /* ── Helpers ──────────────────────────────────────────── */

  private scrollToBottom(): void {
    const msgContainer = document.getElementById('ai-messages');
    if (msgContainer) {
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }
  }
}
