/**
 * Sharp-based image enhancement provider.
 *
 * Deterministic, no AI hallucination. Applies professional-grade post-processing:
 * - Moderate sharpening (food texture preservation)
 * - Slight contrast boost
 * - Slight saturation increase (warmer, more appetizing tones)
 * - Resize to target resolution with Lanczos interpolation
 * - Output as JPEG or WebP
 *
 * Always "configured" — requires only the `sharp` package (bundled).
 */

import type { ImageEnhancementProvider, EnhancementInput, EnhancementResult } from "../types";
import { storeEnhancedImage } from "../storage";

const MIN_DIMENSION_PX = 200;

// Source images below this pixel count are considered low-quality.
const LOW_QUALITY_THRESHOLD = MIN_DIMENSION_PX * MIN_DIMENSION_PX;

const TARGET_FULL = 1200;  // px — product detail / mobile hero
const TARGET_THUMB = 800;  // px — card thumbnail

export class SharpEnhancementProvider implements ImageEnhancementProvider {
  readonly name = "sharp";

  isConfigured(): boolean {
    return true; // sharp is bundled — if installed at deploy time it is always available
  }

  async enhance(input: EnhancementInput): Promise<EnhancementResult> {
    const sharp = (await import("sharp")).default;

    const { imageUrl, restaurantId, menuItemId, processMode } = input;

    // 1. Download source image
    const src = await fetchImageBuffer(imageUrl);
    if ("error" in src) return { success: false, error: src.error };

    // 2. Inspect metadata
    let meta: import("sharp").Metadata;
    try {
      meta = await sharp(src.buffer).metadata();
    } catch (err) {
      return { success: false, error: `Cannot decode image: ${String(err)}` };
    }

    const { width = 0, height = 0 } = meta;
    if (width * height < LOW_QUALITY_THRESHOLD) {
      return {
        success:          false,
        error:            `Source image too small (${width}×${height}px) — needs new photo`,
        lowSourceQuality: true,
      };
    }

    // 3. Build pipeline
    let pipeline = sharp(src.buffer);

    if (processMode === "enhance" || processMode === "enhance+upscale") {
      pipeline = pipeline
        // Moderate linear contrast lift
        .linear(1.08, -(128 * 0.08))
        // Slight saturation boost for food appeal (modulate hue=1, lightness=1, saturation=1.10)
        .modulate({ saturation: 1.1, brightness: 1.02 })
        // Gentle unsharp mask — preserves food texture without plastic look
        .sharpen({ sigma: 1.2, m1: 1.0, m2: 0.8, x1: 2, y2: 10, y3: 20 });
    }

    if (processMode === "upscale" || processMode === "enhance+upscale") {
      const targetSize = Math.max(TARGET_FULL, width, height);
      pipeline = pipeline.resize(targetSize, targetSize, {
        fit:       "inside",
        kernel:    "lanczos3",
        withoutEnlargement: false,
      });
    } else {
      // Even for enhance-only, normalize to a standard size
      pipeline = pipeline.resize(TARGET_THUMB, TARGET_THUMB, {
        fit:    "inside",
        kernel: "lanczos3",
      });
    }

    // 4. Encode output
    let outputBuffer: Buffer;
    let mimeType: string;
    try {
      const result = await pipeline.webp({ quality: 87, effort: 4 }).toBuffer();
      outputBuffer = result;
      mimeType = "image/webp";
    } catch (err) {
      return { success: false, error: `Encoding failed: ${String(err)}` };
    }

    // 5. Store in Foocci-owned storage
    try {
      const enhancedUrl = await storeEnhancedImage(outputBuffer, mimeType, restaurantId, menuItemId);
      const notes = [
        processMode === "enhance" || processMode === "enhance+upscale" ? "Contrast +8%, saturation +10%, sharpening applied" : null,
        processMode === "upscale" || processMode === "enhance+upscale" ? `Resized to ${TARGET_FULL}px (Lanczos3)` : null,
        `Output: WebP 87q (source: ${width}×${height}px)`,
      ].filter(Boolean).join("; ");

      return { success: true, enhancedUrl, providerName: this.name, notes };
    } catch (err) {
      return { success: false, error: `Storage failed: ${String(err)}` };
    }
  }
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer } | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { error: `HTTP ${res.status} fetching source image` };
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 1024) return { error: "Source image too small (< 1KB)" };
    return { buffer: Buffer.from(bytes) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
