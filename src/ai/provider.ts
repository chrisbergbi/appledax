/* ── AI Provider ──────────────────────────────────────── */

/**
 * Multi-provider AI abstraction supporting:
 * - Puter.js (free, rate-limited)
 * - OpenAI REST API (bring your own key)
 * - Google Gemini REST API (bring your own key)
 */

// Minimal type declaration for the global puter object
declare global {
  interface Window {
    puter?: {
      ai: {
        chat(
          prompt: string | Array<{ role: string; content: string }>,
          options?: { model?: string; stream?: boolean },
        ): unknown;
        listModels(provider?: string): Promise<PuterModelInfo[]>;
      };
      auth: {
        signIn(): Promise<void>;
        isSignedIn(): boolean;
      };
    };
  }
}

/** Raw model info returned by puter.ai.listModels() */
interface PuterModelInfo {
  id: string;
  name?: string;
  provider?: { name?: string; id?: string };
  aliases?: string[];
  [key: string]: unknown;
}

/** Simplified model info for our UI */
export interface AIModel {
  id: string;
  name: string;
  provider: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/* ── Provider types ───────────────────────────────────── */

export type AIProviderType = 'puter' | 'openai' | 'gemini';

const PROVIDER_STORAGE_KEY = 'appledax-ai-provider';
const OPENAI_KEY_STORAGE = 'appledax-api-key-openai';
const GEMINI_KEY_STORAGE = 'appledax-api-key-gemini';

export function getProviderType(): AIProviderType {
  try {
    return (localStorage.getItem(PROVIDER_STORAGE_KEY) as AIProviderType) || 'puter';
  } catch {
    return 'puter';
  }
}

export function setProviderType(type: AIProviderType): void {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, type);
    _cachedModels = null; // reset model cache on provider change
  } catch { /* ignore */ }
}

export function getApiKey(provider: 'openai' | 'gemini'): string {
  try {
    return localStorage.getItem(provider === 'openai' ? OPENAI_KEY_STORAGE : GEMINI_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setApiKey(provider: 'openai' | 'gemini', key: string): void {
  try {
    localStorage.setItem(provider === 'openai' ? OPENAI_KEY_STORAGE : GEMINI_KEY_STORAGE, key);
  } catch { /* ignore */ }
}

/* ── Constants ─────────────────────────────────────────── */

const STORAGE_KEY = 'appledax-ai-model';

const PUTER_FAVORITES: AIModel[] = [
  { id: 'deepseek-v3', name: 'DeepSeek V3', provider: 'deepseek' },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano', provider: 'openai' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'google' },
];

const OPENAI_MODELS: AIModel[] = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', provider: 'openai' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'openai' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
  { id: 'o4-mini', name: 'o4-mini', provider: 'openai' },
];

const GEMINI_MODELS: AIModel[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
];

const DEFAULT_MODELS: Record<AIProviderType, string> = {
  puter: 'gpt-5-nano',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};

/** Returns the favorite/recommended models for the active provider. */
export function getFavoriteModels(): AIModel[] {
  const provider = getProviderType();
  if (provider === 'openai') return OPENAI_MODELS;
  if (provider === 'gemini') return GEMINI_MODELS;
  return PUTER_FAVORITES;
}

/* ── Model management ──────────────────────────────────── */

let _cachedModels: AIModel[] | null = null;
let _modelsLoading: Promise<AIModel[]> | null = null;

export function getModel(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MODELS[getProviderType()];
  } catch {
    return DEFAULT_MODELS[getProviderType()];
  }
}

export function setModel(modelId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, modelId);
  } catch { /* ignore */ }
}

/**
 * Fetch available models. For Puter, queries the API.
 * For OpenAI/Gemini, returns empty (all models are in favorites).
 */
export async function listModels(): Promise<AIModel[]> {
  const provider = getProviderType();
  if (provider !== 'puter') return []; // BYOK providers use hardcoded lists only

  if (_cachedModels) return _cachedModels;
  if (_modelsLoading) return _modelsLoading;

  _modelsLoading = fetchPuterModels();
  try {
    _cachedModels = await _modelsLoading;
    return _cachedModels;
  } finally {
    _modelsLoading = null;
  }
}

async function fetchPuterModels(): Promise<AIModel[]> {
  if (!isPuterLoaded()) return [];
  try {
    const raw = await window.puter!.ai.listModels();
    if (!Array.isArray(raw)) return [];

    const favoriteIds = new Set(PUTER_FAVORITES.map((m) => m.id));

    return raw
      .filter((m) => m.id && !favoriteIds.has(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        provider: m.provider?.name ?? m.provider?.id ?? 'unknown',
      }))
      .sort((a, b) => {
        const provCmp = a.provider.localeCompare(b.provider);
        return provCmp !== 0 ? provCmp : a.name.localeCompare(b.name);
      });
  } catch (err) {
    console.warn('[APPLEDAX] Failed to list models:', err);
    return [];
  }
}

/* ── Core functions ────────────────────────────────────── */

export function isPuterLoaded(): boolean {
  return typeof window.puter !== 'undefined';
}

export async function signIn(): Promise<void> {
  if (!isPuterLoaded()) return;
  await window.puter!.auth.signIn();
}

/**
 * Send a chat request through the active provider.
 * Routes to Puter.js, OpenAI REST, or Gemini REST based on config.
 */
export async function chatStream(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
): Promise<string> {
  const provider = getProviderType();

  if (provider === 'openai') {
    const key = getApiKey('openai');
    if (!key) throw new Error('OpenAI API key not configured. Open Settings to add your key.');
    return chatStreamOpenAI(messages, key, onChunk);
  }

  if (provider === 'gemini') {
    const key = getApiKey('gemini');
    if (!key) throw new Error('Gemini API key not configured. Open Settings to add your key.');
    return chatStreamGemini(messages, key, onChunk);
  }

  // Default: Puter.js
  if (!isPuterLoaded()) {
    throw new Error('Puter.js is not loaded');
  }

  const model = getModel();
  try {
    const result = window.puter!.ai.chat(messages, { model, stream: true });
    return await consumeResponse(result, onChunk);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('sign')) {
      throw new Error('AUTH_REQUIRED');
    }
    throw err;
  }
}

/* ── API Error Handling ───────────────────────────────── */

/** Parse an API error response into a user-friendly Error. */
async function parseApiError(provider: string, response: Response): Promise<Error> {
  const status = response.status;
  let body = '';
  try {
    body = await response.text();
  } catch { /* ignore */ }

  // Try to extract a message from JSON error body
  let message = '';
  try {
    const json = JSON.parse(body);
    // OpenAI format: { error: { message: "..." } }
    // Gemini format: { error: { message: "...", status: "..." } }
    message = json?.error?.message || json?.message || '';
  } catch {
    // Not JSON — use raw body (truncated)
    message = body.length > 200 ? body.slice(0, 200) + '…' : body;
  }

  if (status === 429) {
    // Rate limit / quota exhausted
    const model = getModel();
    return new Error(
      `${provider} rate limit reached for ${model}. ` +
      (message.includes('free') || message.includes('quota')
        ? 'Your free-tier quota is exhausted. Use a paid plan or try a different model.'
        : 'Please wait a moment and try again, or switch to a different model.'),
    );
  }

  if (status === 401 || status === 403) {
    return new Error(`${provider} API key is invalid or expired. Check your key in Settings.`);
  }

  if (status === 404) {
    const model = getModel();
    return new Error(`${provider} model "${model}" not found. Select a different model.`);
  }

  // Generic fallback — still truncate to keep the chat clean
  return new Error(`${provider} error (${status}): ${message || 'Unknown error'}`);
}

/* ── OpenAI REST API ──────────────────────────────────── */

async function chatStreamOpenAI(
  messages: ChatMessage[],
  apiKey: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const model = getModel();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!response.ok) {
    throw await parseApiError('OpenAI', response);
  }

  return readSSEStream(response, onChunk);
}

/** Parse OpenAI-style SSE stream (data: JSON lines). */
async function readSSEStream(
  response: Response,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!; // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          fullText += delta;
          onChunk(delta);
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  if (!fullText) throw new Error('Empty response from OpenAI');
  return fullText;
}

/* ── Google Gemini REST API ───────────────────────────── */

async function chatStreamGemini(
  messages: ChatMessage[],
  apiKey: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const model = getModel();

  // Convert ChatMessage[] to Gemini format
  const systemInstruction = messages.find((m) => m.role === 'system');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = { contents };
  if (systemInstruction) {
    body.system_instruction = { parts: [{ text: systemInstruction.content }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await parseApiError('Gemini', response);
  }

  return readGeminiSSEStream(response, onChunk);
}

/** Parse Gemini SSE stream. */
async function readGeminiSSEStream(
  response: Response,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);

      try {
        const parsed = JSON.parse(data);
        const parts = parsed.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (typeof part.text === 'string' && part.text) {
              fullText += part.text;
              onChunk(part.text);
            }
          }
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  if (!fullText) throw new Error('Empty response from Gemini');
  return fullText;
}

/* ── Puter.js response helpers ────────────────────────── */

async function consumeResponse(
  result: unknown,
  onChunk: (text: string) => void,
): Promise<string> {
  if (result && typeof result === 'object' && Symbol.asyncIterator in (result as object)) {
    let fullText = '';
    for await (const chunk of result as AsyncIterable<unknown>) {
      const text = extractChunkText(chunk);
      if (text) {
        fullText += text;
        onChunk(text);
      }
    }
    if (fullText) return fullText;
    throw new Error('Empty response from AI (stream produced no text)');
  }

  if (result && typeof result === 'object' && 'then' in (result as object)) {
    const resolved = await (result as Promise<unknown>);
    if (resolved && typeof resolved === 'object' && Symbol.asyncIterator in (resolved as object)) {
      return consumeResponse(resolved, onChunk);
    }
    const text = extractObjectText(resolved);
    if (text) {
      onChunk(text);
      return text;
    }
    throw new Error('Empty response from AI');
  }

  const text = extractObjectText(result);
  if (text) {
    onChunk(text);
    return text;
  }

  throw new Error('Unexpected AI response format');
}

function extractChunkText(chunk: unknown): string {
  if (!chunk) return '';
  if (typeof chunk === 'string') return chunk;

  const c = chunk as Record<string, unknown>;
  if (typeof c.text === 'string') return c.text;

  if (c.message && typeof c.message === 'object') {
    const msg = c.message as Record<string, unknown>;
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return (msg.content as unknown[])
        .map((b) => (typeof b === 'string' ? b : (b as Record<string, unknown>)?.text as string ?? ''))
        .filter(Boolean)
        .join('');
    }
  }

  return '';
}

function extractObjectText(response: unknown): string {
  if (!response) return '';
  if (typeof response === 'string') return response;

  const r = response as Record<string, unknown>;

  if (r.message && typeof r.message === 'object') {
    const msg = r.message as Record<string, unknown>;
    const content = msg.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return (content as unknown[])
        .map((b) => (typeof b === 'string' ? b : (b as Record<string, unknown>)?.text as string ?? ''))
        .filter(Boolean)
        .join('');
    }
  }

  if (typeof r.text === 'string') return r.text;

  if (typeof r.content === 'string') return r.content;
  if (Array.isArray(r.content)) {
    return (r.content as unknown[])
      .map((b) => (typeof b === 'string' ? b : (b as Record<string, unknown>)?.text as string ?? ''))
      .filter(Boolean)
      .join('');
  }

  return '';
}
