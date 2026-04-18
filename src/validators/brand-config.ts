import { z } from "zod";

// ── Existing AI voice fields ───────────────────────────────────────────────────

const TONES = ["friendly", "professional", "casual", "warm"] as const;
const FORMALITIES = ["formal", "informal", "mixed"] as const;
const EMOJI_USAGES = ["none", "minimal", "moderate", "expressive"] as const;
const COMM_STYLES = ["conversational", "concise", "detailed"] as const;
const UPSELL_STYLES = ["none", "gentle", "moderate", "proactive"] as const;
const AI_MODELS = ["gpt-4o-mini", "gpt-4o"] as const;

// ── Experience / behavioral fields ────────────────────────────────────────────

export const PERSONALITY_PRESETS = [
  "traditional",
  "fast",
  "premium",
  "young",
  "aggressive",
] as const;

export const UPSELL_INTENSITIES = ["low", "medium", "high"] as const;
export const SALES_FOCUSES      = ["balanced", "ticket", "volume"] as const;
export const SALES_PRIORITIES   = ["bestsellers", "high_margin", "promotions"] as const;

export type PersonalityPreset = (typeof PERSONALITY_PRESETS)[number];
export type UpsellIntensity   = (typeof UPSELL_INTENSITIES)[number];
export type SalesFocus        = (typeof SALES_FOCUSES)[number];
export type SalesPriority     = (typeof SALES_PRIORITIES)[number];

// ── Validator ─────────────────────────────────────────────────────────────────

export const upsertBrandConfigSchema = z.object({
  // AI voice
  tone:               z.enum(TONES).default("friendly"),
  formality:          z.enum(FORMALITIES).default("informal"),
  emojiUsage:         z.enum(EMOJI_USAGES).default("moderate"),
  communicationStyle: z.enum(COMM_STYLES).default("conversational"),
  upsellStyle:        z.enum(UPSELL_STYLES).default("gentle"),
  greetingTemplate:   z.string().max(500).nullable().optional(),
  systemPromptOverride: z.string().max(4000).nullable().optional(),
  aiModel:            z.enum(AI_MODELS).default("gpt-4o-mini"),
  maxHistoryMessages: z.number().int().min(5).max(50).default(20),

  // Experience
  personalityPreset:   z.enum(PERSONALITY_PRESETS).default("traditional"),
  upsellIntensity:     z.enum(UPSELL_INTENSITIES).default("medium"),
  salesFocus:          z.enum(SALES_FOCUSES).default("balanced"),
  salesPriority:       z.enum(SALES_PRIORITIES).default("bestsellers"),
  brandPrimaryColor:   z.string().max(20).nullable().optional(),
  brandSecondaryColor: z.string().max(20).nullable().optional(),
  instagramUrl:        z.string().url().max(200).nullable().optional(),
  tiktokUrl:           z.string().url().max(200).nullable().optional(),
});

export type UpsertBrandConfigInput = z.infer<typeof upsertBrandConfigSchema>;

// ── Default config ────────────────────────────────────────────────────────────

export const DEFAULT_BRAND_CONFIG: UpsertBrandConfigInput = {
  tone: "friendly",
  formality: "informal",
  emojiUsage: "moderate",
  communicationStyle: "conversational",
  upsellStyle: "gentle",
  greetingTemplate: null,
  systemPromptOverride: null,
  aiModel: "gpt-4o-mini",
  maxHistoryMessages: 20,
  personalityPreset: "traditional",
  upsellIntensity: "medium",
  salesFocus: "balanced",
  salesPriority: "bestsellers",
  brandPrimaryColor: null,
  brandSecondaryColor: null,
  instagramUrl: null,
  tiktokUrl: null,
};

// ── Personality preset → brand config mapping ─────────────────────────────────

type VoiceConfig = Pick<
  UpsertBrandConfigInput,
  "tone" | "formality" | "emojiUsage" | "communicationStyle" | "upsellStyle"
>;

export const PERSONALITY_VOICE_MAP: Record<PersonalityPreset, VoiceConfig> = {
  traditional: {
    tone: "warm",
    formality: "informal",
    emojiUsage: "minimal",
    communicationStyle: "conversational",
    upsellStyle: "gentle",
  },
  fast: {
    tone: "professional",
    formality: "mixed",
    emojiUsage: "none",
    communicationStyle: "concise",
    upsellStyle: "moderate",
  },
  premium: {
    tone: "professional",
    formality: "formal",
    emojiUsage: "none",
    communicationStyle: "detailed",
    upsellStyle: "gentle",
  },
  young: {
    tone: "casual",
    formality: "informal",
    emojiUsage: "expressive",
    communicationStyle: "conversational",
    upsellStyle: "moderate",
  },
  aggressive: {
    tone: "friendly",
    formality: "informal",
    emojiUsage: "moderate",
    communicationStyle: "conversational",
    upsellStyle: "proactive",
  },
};

// ── Upsell intensity → upsellStyle ───────────────────────────────────────────

export const INTENSITY_STYLE_MAP: Record<UpsellIntensity, VoiceConfig["upsellStyle"]> = {
  low:    "gentle",
  medium: "moderate",
  high:   "proactive",
};
