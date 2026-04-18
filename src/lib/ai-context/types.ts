/**
 * Canonical AI context types for Foocci.
 *
 * AIContext is the single source of truth for all AI interactions.
 * Built once per request via buildAIContext(), consumed by any layer that
 * needs restaurant, menu, customer, or config data.
 *
 * Design rules:
 *   - No duplicated fields
 *   - No prompt strings or UI logic — pure data
 *   - All Prisma Decimals converted to number
 *   - All Dates converted to ISO strings (safe for serialization)
 */

// ── Restaurant ────────────────────────────────────────────────────────────────

export interface RestaurantContext {
  id:          string;
  name:        string;
  slug:        string;
  description: string | null;
  timezone:    string;
  plan:        string; // "STARTER" | "GROWTH" | "PRO"
}

// ── Menu ──────────────────────────────────────────────────────────────────────

export interface MenuItemContext {
  id:           string;
  name:         string;
  description:  string | null;
  price:        number;
  imageUrl:     string | null;
  isAvailable:  boolean;
  isBestseller: boolean;
  /** Derived from name + description keyword matching. */
  tags:         string[]; // e.g. ["vegetariano", "picante"]
}

export interface MenuCategoryContext {
  id:             string;
  name:           string;
  description:    string | null;
  isAvailable:    boolean;
  showInDelivery: boolean;
  showInDineIn:   boolean;
  items:          MenuItemContext[];
}

// ── Promotions ────────────────────────────────────────────────────────────────

export interface PromotionContext {
  id:                string;
  name:              string;
  description:       string | null;
  type:              string; // PERCENTAGE | FIXED | COMBO | FREE_DELIVERY | COUPON
  discountValue:     number;
  target:            string; // PRODUCT | CATEGORY | ORDER
  targetProductIds:  string[];
  targetCategoryIds: string[];
  couponCode:        string | null;
  minOrderValue:     number | null;
  channel:           string; // QR_MENU | DELIVERY | WHATSAPP | ALL
  endsAt:            string | null; // ISO
}

// ── Customer ──────────────────────────────────────────────────────────────────

export interface CustomerOrderItemContext {
  name:     string;
  quantity: number;
  price:    number;
}

export interface CustomerOrderContext {
  id:        string;
  total:     number;
  type:      string; // OrderType
  status:    string; // OrderStatus
  createdAt: string; // ISO
  items:     CustomerOrderItemContext[];
}

export interface CustomerContext {
  id:                 string;
  name:               string;
  phone:              string;
  email:              string | null;
  totalOrders:        number;
  totalSpend:         number;
  lastOrderAt:        string | null; // ISO
  daysSinceLastOrder: number | null;
  isRecurring:        boolean;       // totalOrders > 1
  preferences: {
    dietary:      string[];
    allergies:    string[];
    favoriteDish: string | null;
    notes:        string | null;
  } | null;
  recentOrders: CustomerOrderContext[];
  segments:     string[]; // segment names
}

// ── Operational ───────────────────────────────────────────────────────────────

export interface DeliveryContext {
  enabled:           boolean;
  pickupEnabled:     boolean;
  fee:               number | null;
  estimatedMinutes:  number | null;
  minOrderValue:     number | null;
  freeDeliveryAbove: number | null;
  areaDescription:   string | null;
}

export interface PaymentContext {
  acceptPix:  boolean;
  acceptCash: boolean;
  acceptCard: boolean;
  acceptLink: boolean;
}

export interface CartItemContext {
  itemId:    string;
  name:      string;
  quantity:  number;
  unitPrice: number;
  notes:     string | null;
}

export type SalesPhase = "NONE" | "DRINK" | "DESSERT" | "DONE";

export interface OperationalContext {
  delivery:       DeliveryContext | null;
  payment:        PaymentContext | null;
  cart:           CartItemContext[];
  cartTotal:      number;
  orderStage:     string | null;
  deliveryMethod: string | null;
  /** Delivery address provided by the customer during the conversation. */
  address:        string | null;
  /** Payment method chosen by the customer (e.g. "pix", "cash", "card"). */
  paymentMethod:  string | null;
  /** Customer name provided during the ordering flow (when no DB customer record exists). */
  customerName:   string | null;
  /**
   * Current sales phase — controls whether checkout language is allowed.
   * Set by resolveSalesPhase() in runner.ts after the orchestrator gate.
   */
  salesPhase:     SalesPhase;
  /**
   * True once all upsell opportunities have been resolved (offered or
   * already present in cart). When false the AI should not jump to
   * delivery/payment language.
   */
  salesResolved:  boolean;
}

// ── AI Config ─────────────────────────────────────────────────────────────────

export interface AIConfigContext {
  // Voice
  tone:                 string;
  formality:            string;
  emojiUsage:           string;
  communicationStyle:   string;
  personalityPreset:    string;
  greetingTemplate:     string | null;
  systemPromptOverride: string | null;
  // Sales
  upsellStyle:     string;
  upsellIntensity: string;
  salesFocus:      string;
  salesPriority:   string;
  // Model
  aiModel:            string;
  maxHistoryMessages: number;
  // Visual identity
  brandPrimaryColor:   string | null;
  brandSecondaryColor: string | null;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export interface AIContext {
  restaurant:  RestaurantContext;
  aiConfig:    AIConfigContext;
  menu:        MenuCategoryContext[];
  promotions:  PromotionContext[];
  customer:    CustomerContext | null;
  operational: OperationalContext;
  /** ISO timestamp of when this context was assembled. */
  builtAt: string;
}
