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

// Persistent session status (mirrors the DB column values)
export type WaSessionStatus =
  | "ACTIVE"
  | "AWAITING_CUSTOMER"
  | "READY_TO_CONFIRM"
  | "AWAITING_PAYMENT"
  | "COMPLETED"
  | "CANCELLED"
  | "HANDOFF_REQUIRED"
  | "EXPIRED";

// Legacy alias kept for the W0/W1 in-memory session shape
export type WaOrderStatus = "ACTIVE" | "COMPLETED" | "CANCELLED" | "HANDED_OFF";

export type WaDetectedIntent =
  | "ORDER_REQUEST"
  | "ORDER_MODIFICATION"
  | "ANSWER_TO_OPTION"
  | "DELIVERY_INFO"
  | "PAYMENT_INFO"
  | "CONFIRMATION"
  | "CANCEL"
  | "HUMAN_REQUEST"
  | "QUESTION"
  | "COMPLAINT"
  | "HUMAN_NEEDED"  // legacy alias for HUMAN_REQUEST (W0/W1)
  | "MENU_RETURN"   // customer typed `0`/"menu" → back to the WhatsApp main menu
  | "UNKNOWN";

// Per-item resolution status (W6 menu matching)
export type WaItemStatus =
  | "RESOLVED"
  | "NEEDS_VARIANT"
  | "NEEDS_REQUIRED_OPTION"
  | "AMBIGUOUS"
  | "UNAVAILABLE"
  | "UNKNOWN";

// Runtime mode (re-exported from the flag module for convenience)
export type WaRuntimeMode =
  | "DRY_RUN_ONLY"
  | "ALLOWLIST_REPLY_ONLY"
  | "ALLOWLIST_FULL_TEST";

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

/** Input for a delivery-fee quote (mirror of WhatsAppDeliveryService input). */
export interface WaDeliveryQuoteInput {
  restaurantId: string;
  subtotal:     number;
  address:      WaAddress;
}

/**
 * Pluggable delivery quoter. The default implementation reads deliveryConfig
 * from the DB; an injected one (audits/tests) lets the payment flow run with no
 * DB access. Never affects whether a real order/Pix is created.
 */
export type WaDeliveryQuoter = (input: WaDeliveryQuoteInput) => Promise<WaDeliveryQuote>;

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

// ── Persistent session DTO (matches WhatsAppOrderingSession DB row, typed) ────

export interface WaPersistedSession {
  id:               string;
  restaurantId:     string;
  customerId:       string | null;
  conversationId:   string | null;
  phone:            string;
  status:           WaSessionStatus;
  stage:            WaOrderStage;
  selectedItems:    WaOrderItem[];
  unresolvedItems:  WaUnresolvedItem[];
  missingQuestions: WaMissingQuestion[];
  deliveryType:     "DELIVERY" | "PICKUP" | "DINE_IN" | null;
  address:          WaAddress | null;
  deliveryQuote:    WaDeliveryQuote | null;
  paymentMethod:    "PIX" | "CARD" | "CASH" | null;
  paymentStatus:    "PENDING" | "AWAITING_PIX" | "PAID" | "FAILED" | null;
  orderDraftId:     string | null;
  orderId:          string | null;
  pixPaymentId:     string | null;
  mode:             WaRuntimeMode;
  source:           string;
  metadata:         Record<string, unknown> | null;
  lastMessageAt:    Date;
  expiresAt:        Date | null;
  createdAt:        Date;
  updatedAt:        Date;
}

export interface WaAddress {
  cep?:            string;
  street?:         string;
  number?:         string;
  neighborhood?:   string;
  city?:           string;
  state?:          string;
  complement?:     string;
  referencePoint?: string;
  raw?:            string; // original free-text fragment
}

// ── State-machine input/output (processCustomerMessage) ───────────────────────

export interface WaProcessInput {
  restaurantId:    string;
  restaurantSlug?: string;
  phone:           string;
  conversationId?: string;
  customerId?:     string;
  messageText:     string;
  mode:            WaRuntimeMode;
  currentSession?: WaPersistedSession | null;
  allowSideEffects: boolean;
  /**
   * Pre-loaded menu. When provided, the DB menu load is skipped. Used by the
   * Scenario Runner (to load the menu once for a whole multi-turn conversation)
   * and by unit tests (to inject fixtures without a database).
   */
  menu?:           WaMenuItem[];
  /**
   * Optional delivery quoter. When provided, the DB-backed deliveryConfig read
   * is skipped (used by the Quality audit + tests to run the payment flow with
   * no DB). Defaults to the real DB-backed quoter. Never changes order/Pix
   * creation, which stays gated by allowSideEffects + mode.
   */
  deliveryQuoter?: WaDeliveryQuoter;
  /**
   * Business-hours gate. When explicitly false, the engine refuses to start or
   * continue an order draft (no comanda, no address, no payment, no Pix) and
   * answers with the closed-message + menu hint. Undefined = open (no gate).
   */
  isOpen?: boolean;
  /**
   * Optional CEP lookup (delivery flow asks CEP first, like the Fute checkout).
   * Defaults to the real ViaCEP-backed helper; tests inject a fake.
   */
  cepLookup?: (cep: string) => Promise<{ cep: string; street: string; neighborhood: string; city: string; uf: string } | null>;
}

export interface WaPaymentInfo {
  method:        "PIX" | "CARD" | "CASH" | null;
  status:        "PENDING" | "AWAITING_PIX" | "PAID" | "FAILED" | null;
  pixCopyPaste?: string;
  pixQrCodeBase64?: string;
  isDryRunStub?: boolean;
  changeFor?:    number; // cash: troco para R$ X
}

export interface WaProcessResult {
  session:          WaPersistedSession;
  stage:            WaOrderStage;
  intent:           WaDetectedIntent;
  parsedItems:      WaParsedItem[];
  matchedItems:     WaOrderItem[];
  unresolvedItems:  WaUnresolvedItem[];
  missingQuestions: WaMissingQuestion[];
  draft:            WaDraftSummary | null;
  deliveryQuote:    WaDeliveryQuote | null;
  payment:          WaPaymentInfo | null;
  order:            { orderId: string | null; status: string | null; wouldCreate: boolean } | null;
  estimatedTotal:   number;
  suggestedReply:   string;
  operatorSummary:  string;
  actions:          string[];
  safetyNotes:      string[];
  sideEffectsPerformed: string[];
  handoff:          boolean;
}
