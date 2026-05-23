/**
 * Provider factory for image enhancement.
 *
 * Priority order (first configured provider wins):
 *   1. SharpProvider  — always available; deterministic, no hallucination
 *   2. OpenAIProvider — uses OPENAI_API_KEY; AI-based enhancement
 *
 * Override via IMAGE_ENHANCEMENT_PROVIDER env var:
 *   "sharp"  → SharpProvider only
 *   "openai" → OpenAIProvider only
 *   "none"   → always unconfigured (for testing)
 */

import type { ImageEnhancementProvider } from "../types";
import { SharpEnhancementProvider } from "./sharp";
import { OpenAIEnhancementProvider } from "./openai";

let _provider: ImageEnhancementProvider | null = null;

export function getEnhancementProvider(): ImageEnhancementProvider {
  if (_provider) return _provider;

  const override = process.env.IMAGE_ENHANCEMENT_PROVIDER?.toLowerCase();

  if (override === "openai") {
    _provider = new OpenAIEnhancementProvider();
    return _provider;
  }

  if (override === "none") {
    _provider = makeUnconfiguredProvider();
    return _provider;
  }

  // Default: prefer Sharp (deterministic), fall back to OpenAI
  const sharp = new SharpEnhancementProvider();
  if (sharp.isConfigured()) {
    _provider = sharp;
    return _provider;
  }

  const ai = new OpenAIEnhancementProvider();
  if (ai.isConfigured()) {
    _provider = ai;
    return _provider;
  }

  _provider = makeUnconfiguredProvider();
  return _provider;
}

function makeUnconfiguredProvider(): ImageEnhancementProvider {
  return {
    name: "unconfigured",
    isConfigured: () => false,
    enhance: async () => ({
      success: false,
      error:   "Image enhancement provider is not configured. Install `sharp` or set OPENAI_API_KEY.",
    }),
  };
}
