/* ── Puter.js AI Provider ─────────────────────────────── */

/**
 * Thin abstraction over Puter.js AI chat API.
 * Puter.js is loaded via CDN script tag in index.html and
 * exposes a global `puter` object. Authentication is handled
 * automatically by Puter.js v2 (temporary user sessions).
 *
 * NOTE: Puter.js streaming has a known bug where stream: true
 * hangs indefinitely on errors (e.g. auth, rate limits).
 * We work around this with a timeout + non-streaming fallback.
 */

// Minimal type declaration for the global puter object
declare global {
  interface Window {
    puter?: {
      ai: {
        chat(
          prompt: string | Array<{ role: string; content: string }>,
          options?: { model?: string; stream?: boolean },
        ): Promise<{ message: { content: string } }> | AsyncIterable<{ text?: string }>;
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

const DEFAULT_MODEL = 'gpt-4o-mini';
const STORAGE_KEY = 'appledax-ai-model';

// Timeout for the first chunk during streaming (ms).
const STREAM_FIRST_CHUNK_TIMEOUT = 15_000;

/** Curated list of recommended models shown at the top of the selector. */
export const FAVORITE_MODELS: AIModel[] = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'google' },
  { id: 'deepseek-r1', name: 'DeepSeek R1', provider: 'deepseek' },
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
 * Tries streaming first; falls back to non-streaming if streaming
 * hangs (known Puter.js bug) or encounters an error.
 * Calls onChunk with each piece of text as it arrives.
 * Returns the full response when complete.
 */
export async function chatStream(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
): Promise<string> {
  if (!isPuterLoaded()) {
    throw new Error('Puter.js is not loaded');
  }

  const model = getModel();

  // ── Attempt 1: streaming with timeout ──────────────────
  try {
    const result = await streamWithTimeout(messages, model, onChunk);
    if (result !== null) return result;
    // null means timeout — fall through to non-streaming
  } catch {
    // Streaming threw an error — fall through to non-streaming
  }

  // ── Attempt 2: non-streaming (reliable) ────────────────
  try {
    const response = await window.puter!.ai.chat(messages, { model }) as {
      message: { content: string };
    };
    const content = response?.message?.content ?? '';
    if (content) {
      onChunk(content);
      return content;
    }
    throw new Error('Empty response from AI');
  } catch (err) {
    // Check if the error is auth-related
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('sign')) {
      throw new Error('AUTH_REQUIRED');
    }
    throw err;
  }
}

/**
 * Attempt streaming with a timeout for the first chunk.
 * Returns null if it times out (caller should fall back).
 */
async function streamWithTimeout(
  messages: ChatMessage[],
  model: string,
  onChunk: (text: string) => void,
): Promise<string | null> {
  const stream = window.puter!.ai.chat(messages, { model, stream: true });

  // Check if it's actually an async iterable
  if (!stream || typeof stream !== 'object' || !(Symbol.asyncIterator in (stream as object))) {
    // Not a stream — treat as promise
    const response = await (stream as Promise<{ message: { content: string } }>);
    const content = response?.message?.content ?? '';
    if (content) onChunk(content);
    return content;
  }

  const iterator = (stream as AsyncIterable<{ text?: string }>)[Symbol.asyncIterator]();
  let fullText = '';
  let gotFirstChunk = false;

  // Race the first chunk against a timeout
  const firstResult = await Promise.race([
    iterator.next(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), STREAM_FIRST_CHUNK_TIMEOUT)),
  ]);

  if (firstResult === null) {
    // Timed out waiting for first chunk — streaming is hanging
    console.warn('[APPLEDAX] Streaming timed out, falling back to non-streaming');
    return null;
  }

  // Process first chunk
  const firstChunk = firstResult as IteratorResult<{ text?: string }>;
  if (!firstChunk.done) {
    const text = firstChunk.value?.text ?? '';
    if (text) {
      fullText += text;
      onChunk(text);
      gotFirstChunk = true;
    }
  }

  if (firstChunk.done) {
    return gotFirstChunk ? fullText : null;
  }

  // Continue reading remaining chunks (no timeout — first arrived fine)
  while (true) {
    const { value, done } = await iterator.next();
    if (done) break;
    const text = value?.text ?? '';
    if (text) {
      fullText += text;
      onChunk(text);
    }
  }

  return fullText;
}
