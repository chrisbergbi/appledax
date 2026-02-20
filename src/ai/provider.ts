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
          options?: { model?: string },
        ): Promise<{ message: { content: string } }>;
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

  const response = await window.puter!.ai.chat(messages, { model: MODEL });
  return response?.message?.content ?? '';
}
