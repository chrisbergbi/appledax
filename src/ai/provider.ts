/* ── Puter.js AI Provider ─────────────────────────────── */

/**
 * Thin abstraction over Puter.js AI chat API.
 * Puter.js is loaded via CDN script tag in index.html and
 * exposes a global `puter` object once the user authenticates.
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

const MODEL = 'gpt-4o';

/**
 * Check whether the Puter.js SDK script has loaded.
 */
export function isPuterLoaded(): boolean {
  return typeof window.puter !== 'undefined';
}

/**
 * Check whether the user is authenticated with Puter.
 */
export function isPuterSignedIn(): boolean {
  return isPuterLoaded() && (window.puter!.auth.isSignedIn?.() ?? false);
}

/**
 * Trigger Puter sign-in flow.
 */
export async function signIn(): Promise<void> {
  if (!isPuterLoaded()) return;
  await window.puter!.auth.signIn();
}

/**
 * Send a chat completion request through Puter.js.
 * Returns the assistant's reply as a string.
 */
export async function chat(messages: ChatMessage[]): Promise<string> {
  if (!isPuterLoaded()) {
    throw new Error('Puter.js is not loaded');
  }

  const response = await window.puter!.ai.chat(messages, { model: MODEL }) as { message: { content: string } };
  return response?.message?.content ?? '';
}

/**
 * Send a streaming chat completion request through Puter.js.
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

  try {
    const stream = window.puter!.ai.chat(messages, { model: MODEL, stream: true });

    // If it returns an async iterable, iterate over chunks
    if (stream && typeof stream === 'object' && Symbol.asyncIterator in (stream as object)) {
      let fullText = '';
      for await (const chunk of stream as AsyncIterable<{ text?: string }>) {
        const text = chunk?.text ?? '';
        if (text) {
          fullText += text;
          onChunk(text);
        }
      }
      return fullText;
    }

    // Fallback: non-streaming response
    const response = await (stream as Promise<{ message: { content: string } }>);
    const content = response?.message?.content ?? '';
    onChunk(content);
    return content;
  } catch (err) {
    // If streaming fails, fall back to non-streaming
    const response = await window.puter!.ai.chat(messages, { model: MODEL }) as { message: { content: string } };
    const content = response?.message?.content ?? '';
    onChunk(content);
    return content;
  }
}
