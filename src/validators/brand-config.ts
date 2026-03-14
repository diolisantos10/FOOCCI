import { z } from "zod";

const TONES = ["friendly", "professional", "casual", "warm"] as const;
const FORMALITIES = ["formal", "informal", "mixed"] as const;
const EMOJI_USAGES = ["none", "minimal", "moderate", "expressive"] as const;
const COMM_STYLES = ["conversational", "concise", "detailed"] as const;
const UPSELL_STYLES = ["none", "gentle", "moderate", "proactive"] as const;
const AI_MODELS = ["gpt-4o-mini", "gpt-4o"] as const;

export const upsertBrandConfigSchema = z.object({
  tone: z.enum(TONES).default("friendly"),
  formality: z.enum(FORMALITIES).default("informal"),
  emojiUsage: z.enum(EMOJI_USAGES).default("moderate"),
  communicationStyle: z.enum(COMM_STYLES).default("conversational"),
  upsellStyle: z.enum(UPSELL_STYLES).default("gentle"),
  greetingTemplate: z.string().max(500).nullable().optional(),
  systemPromptOverride: z.string().max(4000).nullable().optional(),
  aiModel: z.enum(AI_MODELS).default("gpt-4o-mini"),
  maxHistoryMessages: z.number().int().min(5).max(50).default(20),
});

export type UpsertBrandConfigInput = z.infer<typeof upsertBrandConfigSchema>;

// ─── Default config used when no brand config has been saved ──
export const DEFAULT_BRAND_CONFIG: Required<UpsertBrandConfigInput> = {
  tone: "friendly",
  formality: "informal",
  emojiUsage: "moderate",
  communicationStyle: "conversational",
  upsellStyle: "gentle",
  greetingTemplate: null,
  systemPromptOverride: null,
  aiModel: "gpt-4o-mini",
  maxHistoryMessages: 20,
};
