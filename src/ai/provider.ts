/* ── Puter.js AI Provider ─────────────────────────────── */

/**
 * Thin abstraction over Puter.js AI chat API.
 * Puter.js is loaded via CDN script tag in index.html and
 * exposes a global `puter` object. Authentication is handled
 * automatically by Puter.js v2 (temporary user sessions).
 *
 * IMPORTANT: puter.ai.chat() always returns an AsyncGenerator,
 * even when stream: false. We must always iterate the response.
 */

// Minimal type declaration for the global puter object
declare global {
  interface Window {
    puter?: {
      ai: {
        // Always returns an async iterable, regardless of stream option
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

/* ── Constants ─────────────────────────────────────────── */

const DEFAULT_MODEL = 'gpt-5-nano';
const STORAGE_KEY = 'appledax-ai-model';

/** Curated list of recommended (free) models shown at the top of the selector. */
export const FAVORITE_MODELS: AIModel[] = [
  { id: 'deepseek-v3', name: 'DeepSeek V3', provider: 'deepseek' },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano', provider: 'openai' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'google' },
];

/* ── Model management ──────────────────────────────────── */

let _cachedModels: AIModel[] | null = null;
let _modelsLoading: Promise<AIModel[]> | null = null;

/**
 * Get the currently selected model ID (from localStorage or default).
 */
export function getModel(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

/**
 * Set the selected model ID (persists to localStorage).
 */
export function setModel(modelId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, modelId);
  } catch {
    // localStorage unavailable — silently ignore
  }
}

/**
 * Fetch available models from Puter.js API.
 * Results are cached after first successful fetch.
 * Returns an empty array if the API call fails.
 */
export async function listModels(): Promise<AIModel[]> {
  if (_cachedModels) return _cachedModels;
  if (_modelsLoading) return _modelsLoading;

  _modelsLoading = fetchModels();
  try {
    _cachedModels = await _modelsLoading;
    return _cachedModels;
  } finally {
    _modelsLoading = null;
  }
}

async function fetchModels(): Promise<AIModel[]> {
  if (!isPuterLoaded()) return [];
  try {
    const raw = await window.puter!.ai.listModels();
    if (!Array.isArray(raw)) return [];

    const favoriteIds = new Set(FAVORITE_MODELS.map((m) => m.id));

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

/**
 * Check whether the Puter.js SDK script has loaded.
 */
export function isPuterLoaded(): boolean {
  return typeof window.puter !== 'undefined';
}

/**
 * Trigger Puter sign-in flow (used when AI call requires auth).
 */
export async function signIn(): Promise<void> {
  if (!isPuterLoaded()) return;
  await window.puter!.auth.signIn();
}

/**
 * Send a chat request through Puter.js using the currently selected model.
 *
 * Puter.js ai.chat() always returns an AsyncGenerator (even without stream: true).
 * We iterate the response and call onChunk for each text piece.
 * Returns the full assembled response.
 */
export async function chatStream(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
): Promise<string> {
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

/**
 * Consume a Puter.js AI response which can be:
 * - An AsyncIterable/AsyncGenerator (most common, chunks with .text)
 * - A Promise resolving to a response object
 * - A plain response object
 */
async function consumeResponse(
  result: unknown,
  onChunk: (text: string) => void,
): Promise<string> {
  // Case 1: AsyncIterable (AsyncGenerator) — iterate chunks
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

  // Case 2: Promise — await it, then try to extract or iterate
  if (result && typeof result === 'object' && 'then' in (result as object)) {
    const resolved = await (result as Promise<unknown>);

    // The resolved value might itself be an async iterable
    if (resolved && typeof resolved === 'object' && Symbol.asyncIterator in (resolved as object)) {
      return consumeResponse(resolved, onChunk);
    }

    // Or a plain response object
    const text = extractObjectText(resolved);
    if (text) {
      onChunk(text);
      return text;
    }
    throw new Error('Empty response from AI');
  }

  // Case 3: Plain object or string
  const text = extractObjectText(result);
  if (text) {
    onChunk(text);
    return text;
  }

  throw new Error('Unexpected AI response format');
}

/**
 * Extract text from a single streaming chunk.
 * Chunks typically have { text: "..." } or { message: { content: "..." } }
 */
function extractChunkText(chunk: unknown): string {
  if (!chunk) return '';
  if (typeof chunk === 'string') return chunk;

  const c = chunk as Record<string, unknown>;

  // Most common: chunk.text
  if (typeof c.text === 'string') return c.text;

  // Some chunks have message.content
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

/**
 * Extract text from a complete (non-streaming) response object.
 * Handles OpenAI-style, Anthropic-style, and simple formats.
 */
function extractObjectText(response: unknown): string {
  if (!response) return '';
  if (typeof response === 'string') return response;

  const r = response as Record<string, unknown>;

  // { message: { content: "..." } } — OpenAI style
  // { message: { content: [{ text: "..." }] } } — Anthropic style
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

  // { text: "..." }
  if (typeof r.text === 'string') return r.text;

  // { content: "..." } or { content: [...] }
  if (typeof r.content === 'string') return r.content;
  if (Array.isArray(r.content)) {
    return (r.content as unknown[])
      .map((b) => (typeof b === 'string' ? b : (b as Record<string, unknown>)?.text as string ?? ''))
      .filter(Boolean)
      .join('');
  }

  return '';
}
