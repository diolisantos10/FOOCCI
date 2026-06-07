/**
 * WhatsApp Text Ordering — type definitions.
 *
 * W0/W1: backend-only, no production routing, no DB schema yet.
 * All state is in-memory for dry-run simulation.
 */

// ── Session stage machine ─────────────────────────────────────────────────────

export type WaOrderStage =
  | "IDLE"
  | "INTENT_DETECTED"
  | "PARSING_ITEMS"
  | "MATCHING_MENU"
  | "COLLECTING_REQUIRED_OPTIONS"
  | "REVIEWING_ORDER"
  | "COLLECTING_DELIVERY_TYPE"
  | "COLLECTING_ADDRESS"
  | "CALCULATING_DELIVERY_FEE"
  | "COLLECTING_PAYMENT_METHOD"
  | "AWAITING_PIX_PAYMENT"
  | "READY_TO_CREATE_ORDER"
  | "HANDOFF_REQUIRED"
  | "COMPLETED"
  | "CANCELLED";

export type WaOrderStatus = "ACTIVE" | "COMPLETED" | "CANCELLED" | "HANDED_OFF";

export type WaDetectedIntent =
  | "ORDER_REQUEST"
  | "QUESTION"
  | "HUMAN_NEEDED"
  | "UNKNOWN";

// ── Session item types ─────────────────────────────────────────────────────────

export interface WaOrderOption {
  groupId:    string;
  groupName:  string;
  optionId:   string;
  optionName: string;
  price:      number;
}

export interface WaOrderExtra {
  extraId:   string;
  extraName: string;
  quantity:  number;
  price:     number;
}

export interface WaOrderItem {
  rawText:      string;
  quantity:     number;
  menuItemId:   string;
  menuItemName: string;
  variantId?:   string;
  variantName?: string;
  options:      WaOrderOption[];
  extras:       WaOrderExtra[];
  unitPrice:    number;
  lineTotal:    number;
  notes?:       string;
}

export interface WaUnresolvedItem {
  rawText:    string;
  quantity:   number;
  reason:     "NOT_FOUND" | "AMBIGUOUS" | "UNAVAILABLE";
  candidates: string[];
}

export interface WaMissingQuestion {
  itemName:  string;
  groupName: string;
  required:  boolean;
  options:   string[];
}

// ── Delivery + payment ────────────────────────────────────────────────────────

export interface WaDeliveryQuote {
  fee:         number;
  distanceKm?: number;
  status:      "ok" | "blocked" | "out_of_range" | "unknown";
  reason?:     string;
}

// ── Session ────────────────────────────────────────────────────────────────────

export interface WaOrderingSession {
  id:               string;
  restaurantId:     string;
  customerId?:      string;
  conversationId?:  string;
  phone:            string;
  status:           WaOrderStatus;
  stage:            WaOrderStage;
  selectedItems:    WaOrderItem[];
  unresolvedItems:  WaUnresolvedItem[];
  missingQuestions: WaMissingQuestion[];
  deliveryType?:    "DELIVERY" | "PICKUP" | "DINE_IN";
  address?:         string;
  deliveryQuote?:   WaDeliveryQuote;
  paymentMethod?:   "PIX" | "CARD" | "CASH";
  paymentStatus?:   "PENDING" | "AWAITING_PIX" | "PAID" | "FAILED";
  orderDraftId?:    string;
  orderId?:         string;
  pixPaymentId?:    string;
  createdAt:        Date;
  updatedAt:        Date;
}

// ── Service input/output ───────────────────────────────────────────────────────

export interface WaAnalyzeInput {
  restaurantId:    string;
  customerId?:     string;
  conversationId?: string;
  phone:           string;
  messageText:     string;
  currentSession?: Partial<WaOrderingSession>;
  dryRun:          true;
}

export interface WaParsedItem {
  rawText:  string;
  quantity: number;
  name:     string;
}

export interface WaDraftLineItem {
  name:      string;
  quantity:  number;
  variant?:  string;
  options:   string[];
  extras:    string[];
  unitPrice: number;
  lineTotal: number;
}

export interface WaDraftSummary {
  subtotal:            number;
  items:               WaDraftLineItem[];
  missingRequirements: string[];
}

export interface WaAnalyzeResult {
  detectedIntent:   WaDetectedIntent;
  parsedItems:      WaParsedItem[];
  matchedItems:     WaOrderItem[];
  unresolvedItems:  WaUnresolvedItem[];
  missingQuestions: WaMissingQuestion[];
  draftSummary:     WaDraftSummary | null;
  estimatedTotal:   number;
  nextStage:        WaOrderStage;
  suggestedReply:   string;
  actions:          string[];
  safetyNotes:      string[];
}

// ── Menu data shape used by the matcher (DB-independent) ──────────────────────

export interface WaMenuItem {
  id:            string;
  name:          string;
  description?:  string;
  price:         number;
  priceDelivery: number | null;
  isActive:      boolean;
  isAvailable:   boolean;
  showInDelivery: boolean;
  hasVariants:   boolean;
  variants:      WaMenuItemVariant[];
  optionGroups:  WaMenuOptionGroup[];
  extras:        WaMenuExtra[];
}

export interface WaMenuItemVariant {
  id:            string;
  name:          string;
  price:         number;
  priceDelivery: number | null;
  isAvailable:   boolean;
}

export interface WaMenuOptionGroup {
  id:        string;
  name:      string;
  required:  boolean;
  minSelect: number;
  maxSelect: number;
  options:   WaMenuOptionItem[];
}

export interface WaMenuOptionItem {
  id:          string;
  name:        string;
  price:       number;
  isAvailable: boolean;
}

export interface WaMenuExtra {
  id:          string;
  name:        string;
  price:       number;
  isAvailable: boolean;
}
