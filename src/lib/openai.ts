/**
 * OpenAI client singleton.
 * Prevents multiple client instances during Next.js hot-module reloads.
 *
 * Requires env: OPENAI_API_KEY
 */

import OpenAI from "openai";

const globalForOpenAI = globalThis as unknown as { _openai: OpenAI | undefined };

export const openai: OpenAI =
  globalForOpenAI._openai ??
  new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

if (process.env.NODE_ENV !== "production") {
  globalForOpenAI._openai = openai;
}
