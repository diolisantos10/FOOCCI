import { z } from "zod";

// ── Brand Persona schema ──────────────────────────────────────────────────────

export const BRAND_ARCHETYPES = [
  "hero",        // Herói
  "sage",        // Sábio
  "creator",     // Criador
  "caregiver",   // Cuidador
  "outlaw",      // Fora-da-lei
  "magician",    // Mago
  "ruler",       // Governante
  "lover",       // Amante
  "jester",      // Bobo da corte
  "everyman",    // Homem comum
  "explorer",    // Explorador
  "innocent",    // Inocente
] as const;

export const PRICE_POSITIONINGS = ["budget", "mid-range", "premium", "luxury"] as const;
export const TARGET_GENDERS     = ["all", "female", "male"] as const;
export const TARGET_INCOMES     = ["low", "middle", "upper-middle", "high"] as const;

export const CUISINE_TYPES = [
  "pizza", "sushi", "burger", "italiano", "brasileiro",
  "saudável", "café", "sobremesa", "mexicano", "asiático",
] as const;

export const VOICE_TONE_PRESETS = ["formal", "casual", "divertido", "premium", "direto"] as const;
export const BUSINESS_OBJECTIVES = ["velocidade", "experiência", "ticket_alto", "volume"] as const;

export const brandPersonaSchema = z.object({
  // ── Identidade (Section 1)
  brandName:            z.string().max(100).optional(),
  tagline:              z.string().max(100).optional(),
  shortDescription:     z.string().max(200).optional(),
  brandStory:           z.string().max(1000).optional(),
  targetAudience:       z.string().max(200).optional(),
  missionStatement:     z.string().max(300).optional(),
  visionStatement:      z.string().max(300).optional(),
  brandValues:          z.array(z.string().max(40)).max(5).optional(),

  // ── Posicionamento (Section 2)
  restaurantType:       z.string().max(100).optional(),
  pricePositioning:     z.enum(PRICE_POSITIONINGS).optional(),
  businessObjective:    z.enum(BUSINESS_OBJECTIVES).optional(),

  // ── Tom de Voz preset (Section 3)
  voiceTonePreset:      z.enum(VOICE_TONE_PRESETS).optional(),

  // ── Personalidade (Section 4)
  brandArchetype:       z.enum(BRAND_ARCHETYPES).optional(),
  personalityTraits:    z.array(z.string().max(30)).max(8).optional(),
  brandIs:              z.array(z.string().max(60)).max(5).optional(),
  brandIsNot:           z.array(z.string().max(60)).max(5).optional(),

  // ── Estilo de Venda extras (Section 5)
  comboFocus:           z.boolean().optional(),
  avgTicketFocus:       z.boolean().optional(),

  // ── Regras de Comunicação extras (Section 6)
  canInsistAfterRefusal: z.boolean().optional(),
  useClientName:         z.boolean().optional(),

  // ── Contexto do Cardápio (Section 7)
  mainDishes:             z.string().max(500).optional(),
  differentials:          z.string().max(500).optional(),
  mostProfitableProducts: z.string().max(300).optional(),

  // ── Avatar (Section 8)
  cuisineType:          z.enum(CUISINE_TYPES).optional(),

  // ── Logomarca
  logoUrl:              z.string().max(500).optional(),

  // ── Público-alvo detalhado
  targetAgeRange:       z.string().max(20).optional(),
  targetGender:         z.enum(TARGET_GENDERS).optional(),
  targetIncome:         z.enum(TARGET_INCOMES).optional(),
  targetLifestyle:      z.string().max(500).optional(),
  targetPainPoints:     z.string().max(500).optional(),

  // ── Posicionamento detalhado
  uniqueValueProposition: z.string().max(300).optional(),
  differentiators:        z.array(z.string().max(80)).max(5).optional(),

  // ── Vocabulário
  wordsToUse:   z.array(z.string().max(30)).max(10).optional(),
  wordsToAvoid: z.array(z.string().max(30)).max(10).optional(),
});

export type BrandPersona = z.infer<typeof brandPersonaSchema>;

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
  facebookUrl:         z.string().url().max(200).nullable().optional(),
  youtubeUrl:          z.string().url().max(200).nullable().optional(),
  googleReviewUrl:     z.string().min(1).max(500).nullable().optional(),
  ifoodReviewUrl:      z.string().min(1).max(500).nullable().optional(),

  // Brand Persona
  brandPersona:        brandPersonaSchema.optional(),

  // Waiter custom instructions (injected after system rules, never overrides them)
  waiterPrompt:        z.string().max(2000).nullable().optional(),

  // Ofertas no fechamento: nomes de categoria DESTE cardápio, na ordem escolhida
  // pelo lojista. Vazio = padrão legado (bebida → sobremesa).
  // O teto de 5 é o mesmo de MAX_UPSELL_CATEGORIES — fechamento não é catálogo.
  waiterUpsellCategories: z.array(z.string().max(120)).max(5).optional(),
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
  facebookUrl: null,
  youtubeUrl: null,
  waiterPrompt: null,
  waiterUpsellCategories: [],
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
