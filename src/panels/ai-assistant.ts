import { t } from '../i18n/index';
import type { EditorAdapter } from '../editor/editor-interface';
import { isPuterLoaded, chatStream, signIn, getModel, setModel, listModels, getFavoriteModels, getProviderType, setProviderType, getApiKey, setApiKey } from '../ai/provider';
import type { ChatMessage, AIModel, AIProviderType, ChatStreamResult } from '../ai/provider';
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

/** Extract <think>...</think> reasoning from DeepSeek R1 responses */
function parseThinkTags(text: string): { thinking: string; answer: string } {
  const match = text.match(/^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/);
  if (match) {
    return { thinking: match[1].trim(), answer: match[2].trim() };
  }
  // Still inside a <think> block (no closing tag yet)
  if (text.startsWith('<think>')) {
    return { thinking: text.slice(7).trim(), answer: '' };
  }
  return { thinking: '', answer: text };
}

interface UIMessage {
  role: 'user' | 'assistant';
  content: string;
  /** If true, content is raw HTML and should not be escaped/formatted */
  rawHtml?: boolean;
  /** Model ID used for this assistant message */
  model?: string;
  /** Token usage from BYOK providers */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/* ── Nested list builder ────────────────────────────────── */

function buildNestedList(block: string): string {
  const lines = block.split('\n').filter((l) => l.trim());
  let result = '';
  let depth = 0;
  const stack: ('ul' | 'ol')[] = [];

  for (const line of lines) {
    // Count leading spaces to determine indent level
    const leadingSpaces = line.match(/^( *)/)?.[1].length ?? 0;
    const level = Math.floor(leadingSpaces / 2);

    // Determine if ordered or unordered
    const stripped = line.trimStart();
    const isOrdered = /^\d+\. /.test(stripped);
    const content = isOrdered ? stripped.replace(/^\d+\. /, '') : stripped.replace(/^[-*] /, '');
    const tag = isOrdered ? 'ol' : 'ul';

    if (level > depth) {
      // Open new nested list(s)
      while (depth < level) {
        result += `<${tag} class="ai-list">`;
        stack.push(tag);
        depth++;
      }
    } else if (level < depth) {
      // Close nested lists
      while (depth > level) {
        const closing = stack.pop() ?? 'ul';
        result += `</li></${closing}>`;
        depth--;
      }
    }

    // If at same level, close previous item (unless first item)
    if (result.endsWith('</li>') || result.endsWith('</ul>') || result.endsWith('</ol>')) {
      // previous item closed naturally
    }

    result += `<li class="ai-li">${content}`;
  }

  // Close all remaining open tags
  while (depth > 0) {
    const closing = stack.pop() ?? 'ul';
    result += `</li></${closing}>`;
    depth--;
  }

  // Wrap outermost level
  if (!result.startsWith('<ul') && !result.startsWith('<ol')) {
    result = `<ul class="ai-list">${result}</li></ul>`;
  } else {
    result += '</li>';
  }

  return result;
}

/* ── Markdown-like formatter ─────────────────────────────── */

function formatMarkdown(raw: string): string {
  let html = esc(raw);

  // ── Step 1: Extract code blocks into placeholders ──
  // This prevents later regex replacements from corrupting code content
  const codeBlocks: { display: string; raw: string }[] = [];
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const trimmedCode = code.trim();
    const decoded = trimmedCode
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const idx = codeBlocks.length;
    codeBlocks.push({ display: trimmedCode, raw: decoded });
    return `%%CODEBLOCK_${idx}%%`;
  });

  // ── Step 2: Extract inline code into placeholders ──
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(code);
    return `%%INLINECODE_${idx}%%`;
  });

  // ── Step 3: Tables ──
  html = html.replace(
    /((?:^\|.+\|[ ]*$\n?)+)/gm,
    (tableBlock) => {
      const rows = tableBlock.trim().split('\n').filter((r) => r.trim());
      if (rows.length < 2) return tableBlock;

      const isSeparator = /^\|[\s\-:]+(\|[\s\-:]+)+\|?$/.test(rows[1].trim());

      let tableHtml = '<table class="ai-table">';
      const startIdx = isSeparator ? 2 : 0;

      if (isSeparator && rows.length > 0) {
        const cells = rows[0].split('|').filter((c) => c.trim() !== '');
        tableHtml += '<thead><tr>' + cells.map((c) => `<th>${c.trim()}</th>`).join('') + '</tr></thead>';
      }

      tableHtml += '<tbody>';
      for (let i = startIdx; i < rows.length; i++) {
        const cells = rows[i].split('|').filter((c) => c.trim() !== '');
        tableHtml += '<tr>' + cells.map((c) => `<td>${c.trim()}</td>`).join('') + '</tr>';
      }
      tableHtml += '</tbody></table>';
      return tableHtml;
    },
  );

  // ── Step 4: Bold ── **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // ── Step 5: Italic ── *text* (single asterisk, not part of **)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // ── Step 6: Strikethrough ── ~~text~~
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // ── Step 7: Links ── [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a class="ai-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // ── Step 8: Headers ──
  html = html.replace(/^### (.+)$/gm, '<h4 class="ai-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="ai-h3">$1</h3>');

  // ── Step 9: Blockquotes ── > text (> is escaped to &gt; by esc())
  html = html.replace(
    /(^&gt; .+$(\n|$))+/gm,
    (block) => {
      const content = block.replace(/^&gt; /gm, '').trim();
      return `<blockquote class="ai-blockquote">${content}</blockquote>`;
    },
  );

  // ── Step 10: Horizontal rules ── --- or *** or ___
  html = html.replace(/^(---|(\*\*\*)|___)$/gm, '<hr class="ai-hr">');

  // ── Step 11: Lists (with nesting support) ──
  html = html.replace(
    /((?:^[ ]*(?:[-*]|\d+\.) .+$\n?)+)/gm,
    (block) => buildNestedList(block),
  );

  // ── Step 12: Line breaks ──
  html = html.replace(/\n/g, '<br>');

  // ── Step 13: Cleanup <br> after block elements ──
  html = html.replace(/<\/h[34]><br>/g, (m) => m.replace('<br>', ''));
  html = html.replace(/<\/ul><br>/g, '</ul>');
  html = html.replace(/<\/ol><br>/g, '</ol>');
  html = html.replace(/<\/li><br>/g, '</li>');
  html = html.replace(/<br><ul/g, '<ul');
  html = html.replace(/<br><ol/g, '<ol');
  html = html.replace(/<\/table><br>/g, '</table>');
  html = html.replace(/<\/blockquote><br>/g, '</blockquote>');
  html = html.replace(/<hr class="ai-hr"><br>/g, '<hr class="ai-hr">');

  // ── Step 14: Re-insert inline code ──
  html = html.replace(/%%INLINECODE_(\d+)%%/g, (_match, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return `<code class="ai-inline-code">${inlineCodes[idx]}</code>`;
  });

  // ── Step 15: Re-insert code blocks (with Copy + Insert buttons) ──
  html = html.replace(/(%%CODEBLOCK_(\d+)%%(<br>)?)/g, (_match, _full, idxStr) => {
    const idx = parseInt(idxStr, 10);
    const block = codeBlocks[idx];
    return `<pre class="ai-code-block"><code>${block.display}</code></pre>` +
      `<div class="ai-code-actions">` +
      `<button class="ai-copy-btn" data-code="${esc(block.raw)}">${esc(t('ai.copy'))}</button>` +
      `<button class="ai-insert-btn" data-code="${esc(block.raw)}">${esc(t('ai.insert'))}</button>` +
      `</div>`;
  });

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
  private editingIndex: number | null = null;

  constructor(editor: EditorAdapter) {
    this.container = document.getElementById('ai-assistant-panel')!;
    this.editor = editor;
    this.render();
  }

  public render(): void {
    const provider = getProviderType();
    if (provider === 'puter' && !isPuterLoaded()) {
      this.renderUnavailable();
      return;
    }
    this.renderChat();

    // Load model list in the background (only needed for Puter)
    if (!this.modelsLoaded && provider === 'puter') {
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
      messagesHtml = this.messages.map((msg, idx) => {
        const roleClass = msg.role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant';
        const isLast = idx === this.messages.length - 1;

        // ── User message (with edit support) ──
        if (msg.role === 'user') {
          if (this.editingIndex === idx) {
            return `<div class="ai-msg ai-msg-user ai-msg-editing">
              <textarea class="ai-edit-textarea" id="ai-edit-textarea">${esc(msg.content)}</textarea>
              <div class="ai-edit-actions">
                <button class="ai-edit-cancel">${esc(t('ai.edit_cancel'))}</button>
                <button class="ai-edit-save">${esc(t('ai.edit_save'))}</button>
              </div>
            </div>`;
          }
          const editBtn = !this.isLoading
            ? `<button class="ai-msg-edit-btn" data-idx="${idx}" title="${esc(t('ai.edit'))}">&#9998;</button>`
            : '';
          return `<div class="ai-msg ${roleClass}">${editBtn}${esc(msg.content)}</div>`;
        }

        // ── Assistant message ──
        let content: string;
        if (msg.rawHtml) {
          content = msg.content;
        } else {
          const parsed = parseThinkTags(msg.content);
          if (parsed.thinking) {
            content = `<details class="ai-thinking-details"><summary>${esc(t('ai.show_reasoning'))}</summary><div class="ai-thinking-content">${formatMarkdown(parsed.thinking)}</div></details>${formatMarkdown(parsed.answer)}`;
          } else {
            content = formatMarkdown(msg.content);
          }
        }

        // Badges (model + tokens)
        let badgesHtml = '';
        const showModel = msg.model && !msg.rawHtml;
        const showTokens = msg.usage && !msg.rawHtml;
        if (showModel || showTokens) {
          badgesHtml = '<div class="ai-msg-badges">';
          if (showModel) badgesHtml += `<span class="ai-model-badge">${esc(msg.model!)}</span>`;
          if (showTokens) badgesHtml += `<span class="ai-token-badge">${msg.usage!.totalTokens} ${esc(t('ai.tokens'))}</span>`;
          badgesHtml += '</div>';
        }

        // Regenerate button on last assistant message
        const regenBtn = isLast && !this.isLoading && !msg.rawHtml
          ? `<button class="ai-regen-btn">&#8635; ${esc(t('ai.regenerate'))}</button>`
          : '';

        return `<div class="ai-msg ${roleClass}">${content}${badgesHtml}${regenBtn}</div>`;
      }).join('');
    }

    // Streaming indicator
    let loadingHtml = '';
    if (this.isLoading) {
      if (this.streamingContent) {
        const parsed = parseThinkTags(this.streamingContent);
        if (parsed.thinking && !parsed.answer) {
          // Still inside <think> block — show thinking indicator
          loadingHtml = `<div class="ai-msg ai-msg-assistant ai-streaming"><div class="ai-thinking-indicator"><span class="ai-thinking-spinner"></span> ${esc(t('ai.thinking'))}</div><span class="ai-cursor">&#9646;</span></div>`;
        } else if (parsed.thinking && parsed.answer) {
          // Thinking done, answer streaming
          loadingHtml = `<div class="ai-msg ai-msg-assistant ai-streaming"><details class="ai-thinking-details"><summary>${esc(t('ai.show_reasoning'))}</summary><div class="ai-thinking-content">${formatMarkdown(parsed.thinking)}</div></details>${formatMarkdown(parsed.answer)}<span class="ai-cursor">&#9646;</span></div>`;
        } else {
          loadingHtml = `<div class="ai-msg ai-msg-assistant ai-streaming">${formatMarkdown(this.streamingContent)}<span class="ai-cursor">&#9646;</span></div>`;
        }
      } else {
        loadingHtml = `<div class="ai-msg ai-msg-assistant ai-loading"><span class="ai-dots">&#8226;&#8226;&#8226;</span></div>`;
      }
    }

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
          <button class="ai-settings-btn" id="ai-settings-btn" title="${esc(t('ai.settings'))}">&#9881;</button>
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
    const favorites = getFavoriteModels();

    // Build favorites options
    let optionsHtml = `<optgroup label="${esc(t('ai.model_favorites'))}">`;
    for (const m of favorites) {
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
      ...favorites.map((m) => m.id),
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

    // Copy-to-clipboard buttons
    this.container.querySelectorAll<HTMLButtonElement>('.ai-copy-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.code;
        if (code) {
          try {
            await navigator.clipboard.writeText(code);
            const original = btn.textContent;
            btn.textContent = t('ai.copied');
            btn.classList.add('ai-copy-btn--copied');
            setTimeout(() => {
              btn.textContent = original;
              btn.classList.remove('ai-copy-btn--copied');
            }, 1500);
          } catch {
            // Clipboard API not available
          }
        }
      });
    });

    // Edit message buttons
    this.container.querySelectorAll<HTMLButtonElement>('.ai-msg-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx!, 10);
        if (!isNaN(idx)) {
          this.editingIndex = idx;
          this.render();
          const ta = document.getElementById('ai-edit-textarea') as HTMLTextAreaElement | null;
          if (ta) {
            ta.focus();
            ta.selectionStart = ta.value.length;
          }
        }
      });
    });

    // Edit cancel button
    this.container.querySelector('.ai-edit-cancel')?.addEventListener('click', () => {
      this.editingIndex = null;
      this.render();
    });

    // Edit save button
    this.container.querySelector('.ai-edit-save')?.addEventListener('click', () => {
      const ta = document.getElementById('ai-edit-textarea') as HTMLTextAreaElement | null;
      const newText = ta?.value.trim();
      if (newText && this.editingIndex !== null) {
        this.messages = this.messages.slice(0, this.editingIndex);
        this.editingIndex = null;
        this.handleSend(newText);
      }
    });

    // Edit textarea keyboard shortcuts
    const editTextarea = document.getElementById('ai-edit-textarea') as HTMLTextAreaElement | null;
    editTextarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.container.querySelector<HTMLButtonElement>('.ai-edit-save')?.click();
      }
      if (e.key === 'Escape') {
        this.container.querySelector<HTMLButtonElement>('.ai-edit-cancel')?.click();
      }
    });

    // Regenerate button
    this.container.querySelector('.ai-regen-btn')?.addEventListener('click', () => {
      const lastIdx = this.messages.length - 1;
      if (lastIdx >= 0 && this.messages[lastIdx].role === 'assistant') {
        this.messages.pop();
        const lastUserMsg = [...this.messages].reverse().find((m) => m.role === 'user');
        if (lastUserMsg) {
          const userIdx = this.messages.lastIndexOf(lastUserMsg);
          if (userIdx >= 0) this.messages.splice(userIdx, 1);
          this.handleSend(lastUserMsg.content);
        }
      }
    });

    // Clear/new chat button
    clearBtn?.addEventListener('click', () => {
      this.messages = [];
      this.streamingContent = '';
      this.isLoading = false;
      this.editingIndex = null;
      this.render();
    });

    // Settings button
    const settingsBtn = document.getElementById('ai-settings-btn');
    settingsBtn?.addEventListener('click', () => {
      this.showSettingsModal();
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

      const result: ChatStreamResult = await chatStream(apiMessages, (chunk) => {
        this.streamingContent += chunk;
        this.updateStreamingMessage();
      });

      this.messages.push({
        role: 'assistant',
        content: result.text,
        model: usedModel,
        usage: result.usage,
      });
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

    const parsed = parseThinkTags(this.streamingContent);
    let streamHtml: string;
    if (parsed.thinking && !parsed.answer) {
      streamHtml = `<div class="ai-thinking-indicator"><span class="ai-thinking-spinner"></span> ${esc(t('ai.thinking'))}</div>`;
    } else if (parsed.thinking && parsed.answer) {
      streamHtml = `<details class="ai-thinking-details"><summary>${esc(t('ai.show_reasoning'))}</summary><div class="ai-thinking-content">${formatMarkdown(parsed.thinking)}</div></details>${formatMarkdown(parsed.answer)}`;
    } else {
      streamHtml = formatMarkdown(this.streamingContent);
    }
    streamEl.innerHTML = streamHtml + '<span class="ai-cursor">&#9646;</span>';

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

    // Re-attach copy buttons
    streamEl.querySelectorAll<HTMLButtonElement>('.ai-copy-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.code;
        if (code) {
          try {
            await navigator.clipboard.writeText(code);
            const original = btn.textContent;
            btn.textContent = t('ai.copied');
            btn.classList.add('ai-copy-btn--copied');
            setTimeout(() => {
              btn.textContent = original;
              btn.classList.remove('ai-copy-btn--copied');
            }, 1500);
          } catch { /* Clipboard API not available */ }
        }
      });
    });

    this.scrollToBottom();
  }

  /* ── Settings modal ─────────────────────────────────────── */

  private showSettingsModal(): void {
    const currentProvider = getProviderType();
    const openaiKey = getApiKey('openai');
    const geminiKey = getApiKey('gemini');

    const overlay = document.createElement('div');
    overlay.className = 'ai-settings-overlay';
    overlay.innerHTML = `
      <div class="ai-settings-modal">
        <h3>${esc(t('ai.provider_label'))}</h3>
        <div class="ai-provider-options">
          <label class="ai-provider-option">
            <input type="radio" name="ai-provider" value="puter"${currentProvider === 'puter' ? ' checked' : ''}>
            <span>${esc(t('ai.provider_puter'))}</span>
          </label>
          <label class="ai-provider-option">
            <input type="radio" name="ai-provider" value="openai"${currentProvider === 'openai' ? ' checked' : ''}>
            <span>${esc(t('ai.provider_openai'))}</span>
          </label>
          <div class="ai-key-row" id="ai-key-openai" style="display:${currentProvider === 'openai' ? 'flex' : 'none'}">
            <input type="password" class="ai-settings-input" id="ai-key-openai-input" placeholder="sk-..." value="${esc(openaiKey)}">
          </div>
          <label class="ai-provider-option">
            <input type="radio" name="ai-provider" value="gemini"${currentProvider === 'gemini' ? ' checked' : ''}>
            <span>${esc(t('ai.provider_gemini'))}</span>
          </label>
          <div class="ai-key-row" id="ai-key-gemini" style="display:${currentProvider === 'gemini' ? 'flex' : 'none'}">
            <input type="password" class="ai-settings-input" id="ai-key-gemini-input" placeholder="AIzaSy..." value="${esc(geminiKey)}">
          </div>
        </div>
        <div class="ai-settings-actions">
          <button class="ai-settings-cancel" id="ai-settings-cancel">${esc(t('ai.settings_cancel'))}</button>
          <button class="ai-settings-save" id="ai-settings-save">${esc(t('ai.settings_save'))}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Show/hide key inputs on radio change
    overlay.querySelectorAll<HTMLInputElement>('input[name="ai-provider"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const selected = radio.value;
        const openaiRow = overlay.querySelector('#ai-key-openai') as HTMLElement;
        const geminiRow = overlay.querySelector('#ai-key-gemini') as HTMLElement;
        openaiRow.style.display = selected === 'openai' ? 'flex' : 'none';
        geminiRow.style.display = selected === 'gemini' ? 'flex' : 'none';
      });
    });

    // Cancel
    overlay.querySelector('#ai-settings-cancel')?.addEventListener('click', () => {
      overlay.remove();
    });

    // Click outside modal to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Save
    overlay.querySelector('#ai-settings-save')?.addEventListener('click', () => {
      const selected = overlay.querySelector<HTMLInputElement>('input[name="ai-provider"]:checked')?.value as AIProviderType;
      const newOpenaiKey = (overlay.querySelector('#ai-key-openai-input') as HTMLInputElement)?.value.trim() || '';
      const newGeminiKey = (overlay.querySelector('#ai-key-gemini-input') as HTMLInputElement)?.value.trim() || '';

      setProviderType(selected);
      setApiKey('openai', newOpenaiKey);
      setApiKey('gemini', newGeminiKey);

      overlay.remove();

      // Reset model list and re-render with new provider's models
      this.modelsLoaded = false;
      this.allModels = [];
      this.render();
    });
  }

  /* ── Helpers ──────────────────────────────────────────── */

  private scrollToBottom(): void {
    const msgContainer = document.getElementById('ai-messages');
    if (msgContainer) {
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }
  }
}
