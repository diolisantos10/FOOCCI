/**
 * Agent types — maps to RestaurantBrandConfig DB fields.
 *
 * All fields have safe defaults so the agent works out-of-the-box
 * even when a restaurant hasn't configured their brand config yet.
 */

// ── Personality ───────────────────────────────────────────────────────────────

export type ToneValue          = "friendly" | "professional" | "casual" | "warm";
export type FormalityValue     = "formal" | "informal" | "mixed";
export type EmojiUsageValue    = "none" | "minimal" | "moderate" | "expressive";
export type CommStyleValue     = "conversational" | "concise" | "detailed";
export type PersonalityPreset  = "traditional" | "fast" | "premium" | "young" | "aggressive";

export interface PersonalityConfig {
  tone:               ToneValue;
  formality:          FormalityValue;
  emojiUsage:         EmojiUsageValue;
  communicationStyle: CommStyleValue;
  preset:             PersonalityPreset;
  /** Optional opening line. If null, a default is used. */
  greetingTemplate:   string | null;
}

// ── Sales strategy ────────────────────────────────────────────────────────────

export type UpsellStyle    = "none" | "gentle" | "moderate" | "proactive";
export type UpsellIntensity = "low" | "medium" | "high";
export type SalesFocus     = "balanced" | "ticket" | "volume";
export type SalesPriority  = "bestsellers" | "high_margin" | "promotions";

export interface SalesConfig {
  upsellStyle:     UpsellStyle;
  upsellIntensity: UpsellIntensity;
  focus:           SalesFocus;
  priority:        SalesPriority;
}

// ── Runtime context (assembled per-request) ───────────────────────────────────

export type OrderStage =
  | "BROWSE"
  | "DELIVERY_TYPE"
  | "ADDRESS_INPUT"
  | "ADDRESS_DETAILS"
  | "ADDRESS_CONFIRM"
  | "ASK_NAME"
  | "PAYMENT"
  | "PAYMENT_METHOD"
  | "PAYMENT_LINK"
  | "REVIEW_ORDER"
  | "DONE";

export interface CartItem {
  name:  string;
  price: number;
  qty:   number;
}

export interface MenuItemMeta {
  name:        string;
  price:       unknown; // Prisma Decimal — converted via Number()
  description: string | null;
  imageUrl:    string | null;
}

export interface MenuCategoryMeta {
  name:        string;
  description: string | null;
  items:       MenuItemMeta[];
}

export interface AgentContext {
  restaurantName: string;
  categories:     MenuCategoryMeta[];
  cart:           CartItem[];
  stage:          OrderStage;
  upsellOffered:  "drink" | "dessert" | null;
  deliveryMethod: "delivery" | "pickup" | null;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_PERSONALITY: PersonalityConfig = {
  tone:               "friendly",
  formality:          "informal",
  emojiUsage:         "moderate",
  communicationStyle: "conversational",
  preset:             "traditional",
  greetingTemplate:   null,
};

export const DEFAULT_SALES: SalesConfig = {
  upsellStyle:     "gentle",
  upsellIntensity: "medium",
  focus:           "balanced",
  priority:        "bestsellers",
};

/** Models that can be passed to the OpenAI API. Anything else falls back to default. */
export const ALLOWED_MODELS = new Set(["gpt-4o-mini", "gpt-4o"]);
