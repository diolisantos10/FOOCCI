/**
 * OpenAI client singleton.
 * Prevents multiple client instances during Next.js hot-module reloads.
 *
 * Requires env: OPENAI_API_KEY
 */

import OpenAI from "openai";

const globalForOpenAI = globalThis as unknown as { _openai: OpenAI | undefined };

// Pass a placeholder key so the SDK doesn't throw at module-load time
// (e.g. during Next.js build when env vars aren't available).
// Actual API calls will fail with 401 if the key is genuinely missing at runtime.
export const openai: OpenAI =
  globalForOpenAI._openai ??
  new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "not-configured" });

if (process.env.NODE_ENV !== "production") {
  globalForOpenAI._openai = openai;
}
