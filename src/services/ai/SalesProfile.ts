/**
 * SalesProfile
 *
 * Structured object that encapsulates every behavioral setting that
 * influences how the AI agent sells and communicates.
 *
 * Built from RestaurantBrandConfig + restaurant name.
 * Consumed by BehaviorEngine.buildBehaviorBlock() to generate the
 * IDENTIDADE & COMPORTAMENTO section of the system prompt.
 */

import type { RestaurantBrandConfig } from "@prisma/client";
import type {
  PersonalityPreset,
  UpsellIntensity,
  SalesFocus,
  SalesPriority,
} from "@/validators/brand-config";
import { PERSONALITY_VOICE_MAP } from "@/validators/brand-config";

// ─── types ────────────────────────────────────────────────────

export interface CommunicationProfile {
  /** friendly | professional | casual | warm */
  tone: string;
  /** formal | informal | mixed */
  formality: string;
  /** none | minimal | moderate | expressive */
  emojiUsage: string;
  /** conversational | concise | detailed */
  style: string;
  /** none | gentle | moderate | proactive */
  upsellStyle: string;
}

export interface SalesProfile {
  // ── identity ──────────────────────────────────────────────
  personality: PersonalityPreset;
  restaurantName: string;

  // ── sales behaviour ───────────────────────────────────────
  /** How aggressively to push additional items  */
  upsellIntensity: UpsellIntensity;
  /** balanced | ticket | volume */
  salesFocus: SalesFocus;
  /** bestsellers | high_margin | promotions */
  salesPriority: SalesPriority;

  // ── communication style ───────────────────────────────────
  communication: CommunicationProfile;
}

// ─── builder ─────────────────────────────────────────────────

/**
 * Convert a database RestaurantBrandConfig + restaurant name into a
 * fully structured SalesProfile.
 *
 * Handles missing / default values so callers never need to guard.
 */
export function buildSalesProfile(
  config: RestaurantBrandConfig,
  restaurantName: string
): SalesProfile {
  const preset = (config.personalityPreset ?? "traditional") as PersonalityPreset;

  // Derive the voice baseline from the stored personality preset.
  // Individual communication overrides (tone, formality, etc.) stored
  // on the config take precedence — allowing fine-tuned customisation.
  const voiceBase = PERSONALITY_VOICE_MAP[preset];

  return {
    personality: preset,
    restaurantName,

    upsellIntensity: (config.upsellIntensity ?? "medium") as UpsellIntensity,
    salesFocus:      (config.salesFocus     ?? "balanced") as SalesFocus,
    salesPriority:   (config.salesPriority  ?? "bestsellers") as SalesPriority,

    communication: {
      tone:        config.tone             ?? voiceBase.tone,
      formality:   config.formality        ?? voiceBase.formality,
      emojiUsage:  config.emojiUsage       ?? voiceBase.emojiUsage,
      style:       config.communicationStyle ?? voiceBase.communicationStyle,
      upsellStyle: config.upsellStyle      ?? voiceBase.upsellStyle,
    },
  };
}
