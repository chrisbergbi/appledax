import { t } from '../i18n/index';
import type { EditorAdapter } from '../editor/editor-interface';
import { isPuterLoaded, isPuterSignedIn, signIn, chat } from '../ai/provider';
import type { ChatMessage } from '../ai/provider';
import { buildSystemPrompt } from '../ai/context';

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
}

/* ── Panel class ────────────────────────────────────────── */

export class AIAssistantPanel {
  private container: HTMLElement;
  private editor: EditorAdapter;
  private messages: UIMessage[] = [];
  private isLoading = false;

  constructor(editor: EditorAdapter) {
    this.container = document.getElementById('ai-assistant-panel')!;
    this.editor = editor;
    this.render();
  }

  public render(): void {
    // Not loaded: show unavailable message
    if (!isPuterLoaded()) {
      this.renderUnavailable();
      return;
    }

    // Not signed in: show sign-in prompt
    if (!isPuterSignedIn()) {
      this.renderSignIn();
      return;
    }

    // Signed in: show chat
    this.renderChat();
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

  private renderSignIn(): void {
    this.container.innerHTML = `
      <div class="ai-signin">
        <p class="ai-signin-icon">&#129302;</p>
        <h3>${esc(t('ai.signin_title'))}</h3>
        <p>${esc(t('ai.signin_desc'))}</p>
        <button class="ai-signin-btn" id="ai-signin-btn">${esc(t('ai.signin_btn'))}</button>
        <p class="ai-privacy-note">${esc(t('ai.privacy_note'))}</p>
      </div>
    `;

    document.getElementById('ai-signin-btn')?.addEventListener('click', async () => {
      try {
        await signIn();
        this.render();
      } catch {
        // User cancelled or error — stay on sign-in screen
      }
    });
  }

  private renderChat(): void {
    let messagesHtml = '';

    if (this.messages.length === 0) {
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
        const content = this.formatContent(msg.content);
        return `<div class="ai-msg ${roleClass}">${content}</div>`;
      }).join('');
    }

    const loadingHtml = this.isLoading
      ? `<div class="ai-msg ai-msg-assistant ai-loading"><span class="ai-dots">&#8226;&#8226;&#8226;</span></div>`
      : '';

    this.container.innerHTML = `
      <div class="ai-chat">
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

  /* ── Format assistant content ─────────────────────────── */

  private formatContent(content: string): string {
    // Simple markdown-like formatting: code blocks and inline code
    let html = esc(content);

    // Code blocks: ```...```
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
      return `<pre class="ai-code-block"><code>${code.trim()}</code></pre>
        <button class="ai-insert-btn" data-code="${esc(code.trim())}">${esc(t('ai.insert'))}</button>`;
    });

    // Inline code: `...`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  /* ── Event handlers ───────────────────────────────────── */

  private attachChatHandlers(): void {
    const input = document.getElementById('ai-input') as HTMLTextAreaElement | null;
    const sendBtn = document.getElementById('ai-send-btn');

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

    // Focus input
    input?.focus();
  }

  /* ── Send message ─────────────────────────────────────── */

  private async handleSend(text: string): Promise<void> {
    this.messages.push({ role: 'user', content: text });
    this.isLoading = true;
    this.render();

    try {
      // Build conversation with system prompt + history
      const systemPrompt = buildSystemPrompt(this.editor);
      const apiMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];

      const reply = await chat(apiMessages);
      this.messages.push({ role: 'assistant', content: reply });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.messages.push({ role: 'assistant', content: `${t('ai.error')}: ${errorMsg}` });
    }

    this.isLoading = false;
    this.render();
  }

  /* ── Helpers ──────────────────────────────────────────── */

  private scrollToBottom(): void {
    const msgContainer = document.getElementById('ai-messages');
    if (msgContainer) {
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }
  }
}
