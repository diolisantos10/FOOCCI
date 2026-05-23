/**
 * Shared types for the internal menu image enhancement pipeline.
 * Server-only. Never import from client components.
 */

export type ProcessMode = "enhance" | "upscale" | "enhance+upscale";

export interface EnhancementInput {
  menuItemId:  string;
  restaurantId: string;
  /** URL of the source image (must already be in Foocci-owned storage). */
  imageUrl:    string;
  processMode: ProcessMode;
}

export type EnhancementResult =
  | {
      success:     true;
      enhancedUrl: string;
      providerName: string;
      notes?:      string;
    }
  | {
      success:          false;
      error:            string;
      lowSourceQuality?: boolean;  // true when image is too degraded to enhance
    };

export interface ImageEnhancementProvider {
  readonly name: string;
  isConfigured(): boolean;
  enhance(input: EnhancementInput): Promise<EnhancementResult>;
}

// ── Batch job types ───────────────────────────────────────────────────────────

export interface EnhancementJobOptions {
  restaurantId: string;
  productIds?:  string[];       // omit = process all products with images
  dryRun?:      boolean;
  processMode?: ProcessMode;
}

export interface EnhancementJobItem {
  menuItemId:   string;
  menuItemName: string;
  imageUrl:     string | null;
  status:       string;
  reason?:      string;         // skip reason or error
}

export interface EnhancementJobStats {
  total:               number;
  skippedNoImage:      number;
  skippedNoProvider:   number;
  migrated:            number;  // external → internal
  enqueued:            number;
  failed:              number;
  items:               EnhancementJobItem[];
  dryRun:              boolean;
}
