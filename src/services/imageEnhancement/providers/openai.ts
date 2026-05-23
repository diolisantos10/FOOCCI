/**
 * OpenAI image edit provider for food photo enhancement.
 *
 * Uses gpt-image-1 (preferred) via the images.edit endpoint.
 * Applies a very conservative prompt that emphasizes dish preservation.
 *
 * WARNING: AI-based enhancement carries a hallucination risk.
 * The prompt is crafted to minimize it, but always require manual approval.
 *
 * Configured when OPENAI_API_KEY is set.
 */

import type { ImageEnhancementProvider, EnhancementInput, EnhancementResult } from "../types";
import { storeEnhancedImage } from "../storage";
import { fetchImageBuffer } from "./fetchImageBuffer";

const MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";

const ENHANCEMENT_PROMPT = `You are a professional food photographer's retouching assistant.

Enhance this restaurant menu food photo with professional editing quality.

STRICT PRESERVATION RULES (DO NOT VIOLATE):
1. The dish must remain IDENTICAL — same ingredients, same foods, same quantities
2. Do NOT add any food, garnish, sauce, steam, glaze, or decoration that was not already present
3. Do NOT remove any food or ingredient that was visible
4. Do NOT change the plate, bowl, or serving vessel
5. Do NOT change the background, table, or props
6. Do NOT change the portion size or overall composition

WHAT TO IMPROVE:
- Professional restaurant lighting (warm, even, appetizing)
- Color vibrancy and slight saturation lift (warmer tones for food appeal)
- Sharpness and clarity (reduce blur, improve texture detail)
- Contrast and visual depth
- Remove dull, flat, or gray look

STYLE GOAL: "Same photo, professionally edited by a food photographer" — NOT a new AI-generated image.`;

export class OpenAIEnhancementProvider implements ImageEnhancementProvider {
  readonly name = "openai";

  isConfigured(): boolean {
    const key = process.env.OPENAI_API_KEY;
    return !!key && key !== "not-configured" && key.length > 10;
  }

  async enhance(input: EnhancementInput): Promise<EnhancementResult> {
    if (!this.isConfigured()) {
      return { success: false, error: "OpenAI API key not configured" };
    }

    const { imageUrl, restaurantId, menuItemId } = input;

    // 1. Download / read source image (handles /api/media/[id] internal paths)
    const src = await fetchImageBuffer(imageUrl);
    if ("error" in src) return { success: false, error: src.error };
    if (src.buffer.byteLength < 1024) return { success: false, error: "Image too small (< 1KB)" };
    if (src.buffer.byteLength > 20 * 1024 * 1024) return { success: false, error: "Image too large (> 20MB) for OpenAI" };

    // 2. Call OpenAI image edit
    try {
      const { openai } = await import("@/lib/openai");
      const { toFile } = await import("openai");

      const arrayBuffer = src.buffer.buffer.slice(
        src.buffer.byteOffset,
        src.buffer.byteOffset + src.buffer.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: src.mimeType });
      const file = await toFile(blob, `food-${menuItemId}.png`, { type: src.mimeType });

      const rawResponse = await (openai.images.edit as (p: unknown) => Promise<unknown>)({
        model:  MODEL,
        image:  file,
        prompt: ENHANCEMENT_PROMPT,
        size:   "1024x1024",
        n:      1,
      });
      const response = rawResponse as { data?: Array<{ b64_json?: string; url?: string }> };

      const result = response.data?.[0];
      if (!result) return { success: false, error: "OpenAI returned no image data" };

      // 3. Retrieve the generated image bytes
      let outputBuffer: Buffer;
      let mimeType = "image/png";

      if (result.b64_json) {
        outputBuffer = Buffer.from(result.b64_json, "base64");
      } else if (result.url) {
        const dl = await fetchImageBuffer(result.url);
        if ("error" in dl) return { success: false, error: `Failed to download result: ${dl.error}` };
        outputBuffer = dl.buffer;
        mimeType = dl.mimeType;
      } else {
        return { success: false, error: "OpenAI response has neither url nor b64_json" };
      }

      // 4. Store
      const enhancedUrl = await storeEnhancedImage(outputBuffer, mimeType, restaurantId, menuItemId);
      return {
        success:     true,
        enhancedUrl,
        providerName: this.name,
        notes:       `Model: ${MODEL}; size: 1024x1024`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `OpenAI error: ${msg}` };
    }
  }
}

