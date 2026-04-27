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

  // ── goal targets ──────────────────────────────────────────
  /** Target order value in BRL — drives gap-aware upsell selection */
  targetTicket: number;
  /** Target item count per order — drives add-on prioritization */
  targetItems: number;

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
// Default targets derived from salesFocus — no DB field needed.
const TICKET_BY_FOCUS: Record<SalesFocus, number> = { balanced: 80, ticket: 120, volume: 60 };
const ITEMS_BY_FOCUS:  Record<SalesFocus, number> = { balanced: 3,  ticket: 2,   volume: 4  };

export function buildSalesProfile(
  config: RestaurantBrandConfig,
  restaurantName: string
): SalesProfile {
  const preset = (config.personalityPreset ?? "traditional") as PersonalityPreset;

  // Derive the voice baseline from the stored personality preset.
  // Individual communication overrides (tone, formality, etc.) stored
  // on the config take precedence — allowing fine-tuned customisation.
  const voiceBase = PERSONALITY_VOICE_MAP[preset];

  const focus = (config.salesFocus ?? "balanced") as SalesFocus;

  return {
    personality: preset,
    restaurantName,

    upsellIntensity: (config.upsellIntensity ?? "medium") as UpsellIntensity,
    salesFocus:      focus,
    salesPriority:   (config.salesPriority  ?? "bestsellers") as SalesPriority,

    targetTicket: TICKET_BY_FOCUS[focus] ?? 80,
    targetItems:  ITEMS_BY_FOCUS[focus]  ?? 3,

    communication: {
      tone:        config.tone             ?? voiceBase.tone,
      formality:   config.formality        ?? voiceBase.formality,
      emojiUsage:  config.emojiUsage       ?? voiceBase.emojiUsage,
      style:       config.communicationStyle ?? voiceBase.communicationStyle,
      upsellStyle: config.upsellStyle      ?? voiceBase.upsellStyle,
    },
  };
}
