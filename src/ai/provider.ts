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
      };
      auth: {
        signIn(): Promise<void>;
        isSignedIn(): boolean;
      };
    };
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Use Puter's default model (currently gpt-4o-mini) rather than
// hardcoding a model that may not be available to all users.
const MODEL = 'gpt-4o-mini';

// Timeout for the first chunk during streaming (ms).
// If no data arrives within this window, fall back to non-streaming.
const STREAM_FIRST_CHUNK_TIMEOUT = 15_000;

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
 * Send a chat request through Puter.js.
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

  // ── Attempt 1: streaming with timeout ──────────────────
  try {
    const result = await streamWithTimeout(messages, onChunk);
    if (result !== null) return result;
    // null means timeout — fall through to non-streaming
  } catch {
    // Streaming threw an error — fall through to non-streaming
  }

  // ── Attempt 2: non-streaming (reliable) ────────────────
  try {
    const response = await window.puter!.ai.chat(messages, { model: MODEL }) as {
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
  onChunk: (text: string) => void,
): Promise<string | null> {
  const stream = window.puter!.ai.chat(messages, { model: MODEL, stream: true });

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
