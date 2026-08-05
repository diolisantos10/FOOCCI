"use client";

/**
 * PedidoClient — full customer-facing AI ordering experience.
 *
 * Public (no auth). AI chat via POST /api/pedido/[slug].
 * Finalization via POST /api/pedido/[slug]/finalize.
 *
 * Stage flow:
 *   BROWSE → DELIVERY_TYPE → ADDRESS_INPUT → ADDRESS_DETAILS →
 *   ADDRESS_CONFIRM → ASK_NAME → PAYMENT → PAYMENT_METHOD →
 *   REVIEW_ORDER → DONE
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, type FormEvent, type KeyboardEvent } from "react";
import type { WaiterMemory, CheckoutUpsellStage } from "@/services/ai/WaiterBrainV2";
import type { RepeatOrderPayload } from "@/services/order/RepeatOrderService";
import { buildDisplayCategories, REPEAT_CATEGORY_ID } from "@/services/order/repeatCategory";
import { buildOpeningOptions, SUGGESTION_OPTION_VALUE, REPEAT_OPTION_VALUE } from "@/services/order/waiterOpening";
import {
  payNowOptions,
  shouldShowPayNow,
  deliveryPaymentOptions,
  arrivalBlockTitle,
  type DeliverySubId,
} from "@/services/order/paymentOptions";
import { buildWhatsAppUrl, buildInstagramUrl, buildTikTokUrl } from "@/lib/social";
import { phoneCandidates } from "@/lib/phone";

// ── Order tracking (post-checkout) ────────────────────────────────────────────

interface OrderTrackingData {
  id: string;
  orderNumber: string;
  status: string;
  type: string;
  isFinal: boolean;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  restaurantName: string;
  restaurantPhone: string | null;
  items: { name: string; quantity: number }[];
  paymentMethodLabel: string | null;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING:           "Aguardando aceite",
  AWAITING_PAYMENT:  "Aguardando pagamento",
  CONFIRMED:         "Aceito",
  PREPARING:         "Em preparo",
  READY:             "Pronto",
  OUT_FOR_DELIVERY:  "Saindo para entrega",
  DELIVERED:         "Entregue",
  CANCELLED:         "Cancelado",
};

const TRACKING_STEPS_DELIVERY = [
  { status: "PENDING",          label: "Recebido",  icon: "📋" },
  { status: "CONFIRMED",        label: "Aceito",    icon: "✅" },
  { status: "PREPARING",        label: "Em preparo",icon: "👨‍🍳" },
  { status: "OUT_FOR_DELIVERY", label: "A caminho", icon: "🛵" },
  { status: "DELIVERED",        label: "Entregue",  icon: "🎉" },
];

const TRACKING_STEPS_PICKUP = [
  { status: "PENDING",   label: "Recebido",   icon: "📋" },
  { status: "CONFIRMED", label: "Aceito",     icon: "✅" },
  { status: "PREPARING", label: "Em preparo", icon: "👨‍🍳" },
  { status: "READY",     label: "Pronto",     icon: "🎉" },
];

const TRACKING_STATUS_IDX: Record<string, number> = {
  PENDING: 0, AWAITING_PAYMENT: 0,
  CONFIRMED: 1,
  PREPARING: 2,
  READY: 3, OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
};

function OrderTrackingPanel({
  data,
  brandColor,
  onNewOrder,
}: {
  data: OrderTrackingData | null;
  brandColor: string;
  onNewOrder: () => void;
}) {
  if (!data) {
    return (
      <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-5 text-center">
        <p className="text-2xl">⏳</p>
        <p className="mt-1 text-sm font-semibold text-gray-600">Carregando status…</p>
      </div>
    );
  }

  const isCancelled = data.status === "CANCELLED";
  const isDelivered = data.status === "DELIVERED";
  const steps       = data.type === "DELIVERY" ? TRACKING_STEPS_DELIVERY : TRACKING_STEPS_PICKUP;
  const currentIdx  = TRACKING_STATUS_IDX[data.status] ?? 0;

  return (
    <div data-testid="stage-done" className="shrink-0 border-t border-gray-100 bg-white overflow-y-auto" style={{ maxHeight: "60vh" }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3 text-center">
        {isCancelled ? (
          <>
            <p className="text-2xl">❌</p>
            <p className="mt-1 text-sm font-bold text-red-700">Pedido cancelado</p>
          </>
        ) : isDelivered ? (
          <>
            <p className="text-2xl">🎉</p>
            <p className="mt-1 text-sm font-bold text-green-700">Pedido entregue!</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm font-bold text-gray-900">Acompanhe seu pedido</p>
            <p className="mt-0.5 text-xs text-gray-400">
              {ORDER_STATUS_LABELS[data.status] ?? data.status}
            </p>
          </>
        )}
        <p className="mt-0.5 text-[11px] text-gray-400">Pedido #{data.orderNumber}</p>
      </div>

      {/* Progress steps */}
      {!isCancelled && (
        <div className="px-3 pb-3">
          <div className="flex items-start">
            {steps.map((step, i) => {
              const done    = i < currentIdx;
              const current = i === currentIdx;
              const isLast  = i === steps.length - 1;
              return (
                <div key={step.status} className="flex flex-1 flex-col items-center">
                  <div className="flex w-full items-center">
                    <div className={`h-px flex-1 transition-colors ${
                      i === 0 ? "invisible" : done || current ? "bg-green-400" : "bg-gray-200"
                    }`} />
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-all ${
                        done    ? "bg-green-500 text-white text-xs font-bold"
                        : current ? "border-2 text-base"
                        :           "bg-gray-100 text-base"
                      }`}
                      style={current ? { borderColor: brandColor } : {}}
                    >
                      {done ? "✓" : step.icon}
                    </div>
                    <div className={`h-px flex-1 transition-colors ${
                      isLast ? "invisible" : done ? "bg-green-400" : "bg-gray-200"
                    }`} />
                  </div>
                  <p className={`mt-1 text-center text-[9px] leading-tight px-0.5 ${
                    current ? "font-bold text-gray-900"
                    : done   ? "text-gray-400"
                    :          "text-gray-300"
                  }`}>
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Items summary */}
      <div className="mx-4 mb-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
        <div className="space-y-0.5">
          {data.items.map((item, i) => (
            <p key={i} className="text-sm text-gray-700">
              <span className="font-semibold text-gray-400">{item.quantity}×</span>{" "}{item.name}
            </p>
          ))}
        </div>
        {data.paymentMethodLabel && (
          <p className="mt-2 border-t border-gray-200 pt-2 text-xs text-gray-400">
            Pagamento: {data.paymentMethodLabel}
          </p>
        )}
      </div>

      {/* Buttons */}
      <div className="mx-4 mb-4 flex flex-col gap-2">
        {data.restaurantPhone && (
          <a
            href={`https://wa.me/${data.restaurantPhone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            💬 Falar com o restaurante
          </a>
        )}
        <button
          onClick={onNewOrder}
          className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
        >
          Fazer novo pedido
        </button>
      </div>
    </div>
  );
}

const UPSELL_STAGE_ORDER: Record<CheckoutUpsellStage, number> = {
  none: 0, drink_shown: 1, dessert_shown: 2, extras_shown: 3, completed: 4,
};
function maxUpsellStage(a: CheckoutUpsellStage | undefined, b: CheckoutUpsellStage | undefined): CheckoutUpsellStage {
  return (UPSELL_STAGE_ORDER[b ?? "none"] ?? 0) >= (UPSELL_STAGE_ORDER[a ?? "none"] ?? 0) ? (b ?? "none") : (a ?? "none");
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface WaiterOption { label: string; value: string; }

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: Date;
  suggestedItemName?: string;
  /** V2: product IDs to render as suggestion cards below this message. */
  cards?: string[];
  /** Quick-reply buttons — label is display text, value is what gets sent. */
  options?: WaiterOption[];
  /** True when this assistant message came from a human operator (Atendimento). */
  isOperator?: boolean;
}

interface MenuItemVariant {
  id: string;
  name: string;
  price: number;
  portion: string | null;
}

interface Extra {
  id: string;
  name: string;
  price: number;
  quantity: number;
  portion: string | null;
}

interface OptionItem {
  id: string;
  name: string;
  price: number;
  portion: string | null;
}

interface OptionGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: OptionItem[];
}

interface PromotionInfo {
  promotionId: string;
  originalPrice: number;
  promotionalPrice: number;
  discountAmount: number;
  discountPercent: number;
  badgeText: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  imageUrl: string | null;
  /** Extra photos for the detail-sheet carousel (opt-in). Cover stays in imageUrl. */
  images: string[];
  carouselEnabled: boolean;
  hasVariants: boolean;
  ingredients: string | null;
  servingSize: number | null;
  portionInfo: string | null;
  promotion: PromotionInfo | null;
  variants: MenuItemVariant[];
  extras: Extra[];
  optionGroups: OptionGroup[];
}

interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  items: MenuItem[];
}

interface SelectedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  qty: number;
  priceAdjustment: number;
}

interface SelectedExtra {
  extraId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

interface CartItem {
  id: string;
  baseItemId: string;
  name: string;
  price: number;
  qty: number;
  notes?: string;
  variantId?: string;
  variantName?: string;
  // Analytics only: true when the item was added from a Foocci suggestion
  // (AI/waiter suggestion grid or in-chat suggestion card), not normal menu
  // browsing. Drives the "Receita incremental Foocci" metric. Never affects price.
  isUpsell?: boolean;
  selectedOptions?: SelectedOption[];
  selectedExtras?: SelectedExtra[];
}

type HistoryEntry = { role: "user" | "assistant"; content: string };
type UIState = "idle" | "thinking";

type Stage =
  | "BROWSE"
  | "DELIVERY_TYPE"
  | "SAVED_ADDRESS_OFFER"
  | "CEP_INPUT"
  | "ADDRESS_COMPLETE"
  | "ADDRESS_CONFIRM"
  | "ASK_NAME"
  | "PAYMENT"
  | "PAYMENT_METHOD"
  | "ONLINE_METHOD_SELECT"
  | "REVIEW_ORDER"
  | "PAYMENT_LINK"
  | "CARD_FORM"
  | "DONE";

type PaymentMode = "pay_now" | "pay_on_delivery" | "pay_on_pickup";
type PaymentMethodSub = "card_machine" | "pix_in_person" | "cash";

/**
 * Parse a Brazilian-typed money string ("100", "150,00", "R$ 1.200,50") into a
 * number. Returns null when there is no parseable value. Used for the cash
 * "troco para quanto?" field.
 */
function parseMoneyBR(raw: string): number | null {
  const cleaned = (raw ?? "")
    .replace(/[^\d.,]/g, "")   // keep digits, dot, comma
    .replace(/\.(?=\d{3}(\D|$))/g, "") // drop thousands separators (1.200 → 1200)
    .replace(",", ".");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

interface Address {
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
  referencePoint: string;
}

interface PromoBanner {
  id: string;
  name: string;
  imageUrl: string;
}

interface Props {
  slug: string;
  restaurantName: string;
  logoUrl: string | null;
  phone: string | null;
  categories: MenuCategory[];
  knownCustomerPhone?: string | null;
  knownCustomerName?: string | null;
  knownCustomerId?: string | null;
  knownDefaultAddress?: { street: string; number: string; neighborhood: string; complement: string; cep?: string; city?: string; state?: string } | null;
  /**
   * Proof-of-phone-possession token (a signed waToken) for the gated "área do cliente"
   * endpoints (profile / addresses / coupons). Present when the customer arrived via a
   * verified WhatsApp link; null otherwise. Without it those endpoints reveal nothing.
   */
  pedidoToken?: string | null;
  deliveryFee?: number | null;
  /** Free delivery threshold: if subtotal >= this value, delivery is free. */
  freeDeliveryAbove?: number | null;
  deliveryMode?: string;
  deliveryEstimatedMinutes?: number | null;
  averagePreparationMinutes?: number | null;
  /** Instagram profile URL — shown as icon in ordering header if provided. */
  instagramUrl?: string | null;
  /** TikTok profile URL — shown as icon in ordering header if provided. */
  tiktokUrl?: string | null;
  /** Active promotion banners to show at the top of the menu. */
  banners?: PromoBanner[];
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  /** GA4 Measurement ID — used to fire gtag events client-side. */
  ga4Id?: string | null;
  /** Whether the restaurant is currently within its configured business hours. */
  restaurantIsOpen?: boolean;
  /** Pre-computed closed message with today's hours and next opening time. */
  closedMessage?: string | null;
  /** Emergency pause flag — overrides business hours. */
  isOrderingPaused?: boolean;
  /** Reason for the emergency pause, if provided. */
  pauseReason?: string | null;
  /** ISO timestamp until which ordering is paused; null = indefinite or not paused. */
  pausedUntil?: string | null;
  /** Pre-validated cart items to restore from a recovery link (src=recovery). */
  recoveryCart?: Array<{ id: string; name: string; price: number; qty: number }>;
  /** Validated last-order payload for the "Pedir novamente" module (W3). */
  repeatOrder?: RepeatOrderPayload;
  /**
   * Full menu-item objects for the customer's repeatable items, resolved on the
   * server INDEPENDENTLY of category visibility. Seeds the "Comprar novamente"
   * pool so the section renders even when a repeat item's home category is hidden
   * from the delivery menu (the client fetch augments this pool).
   */
  repeatMenuItems?: MenuItem[];
  /** Whether online Pix ("Pagar agora") is available/configured. Defaults to true (current behavior). */
  pixOnlineEnabled?: boolean;
  /** Show the online "Cartão de crédito" option — true only when SumUp is active. */
  cardOnlineEnabled?: boolean;
  /**
   * Whether this restaurant's plan includes the AI Waiter. When false the store is
   * click-driven end to end: no AI network calls, no chat composer, no suggestion
   * button — and the server enforces the same gate with a 403, so this flag is
   * presentation, not security. Defaults to true so nothing changes for callers
   * that predate the entry plan.
   */
  aiIncluded?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the delivery fee the customer should actually pay.
 * Applies free-delivery-above threshold: if subtotal >= freeAbove, fee is 0.
 */
function computeEffectiveFee(
  subtotal: number,
  fee: number | null | undefined,
  freeAbove: number | null | undefined,
): number {
  if (fee == null) return 0;
  if (freeAbove != null && freeAbove > 0 && subtotal >= freeAbove) return 0;
  return fee;
}

function uid() { return Math.random().toString(36).slice(2); }

function formatTime(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// "Comprar novamente" — categoria virtual com os últimos itens do cliente,
// logo após "Mais vendidos". Só aparece quando há histórico real (ver
// repeatCategory.ts). Reativada a pedido do lojista.
const REPEAT_ORDER_UI_ENABLED = true;

function categoryEmoji(name: string): string {
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("comprar novamente") || n.includes("pedir de novo") || n.includes("pedir novamente")) return "🔁";
  if (n.includes("pizza"))                          return "🍕";
  if (n.includes("bebida") || n.includes("drink"))  return "🥤";
  if (n.includes("sobremesa") || n.includes("doce")) return "🍰";
  if (n.includes("lanche") || n.includes("burger")) return "🍔";
  if (n.includes("entrada") || n.includes("porcao")) return "🥗";
  return "🍽️";
}

function parseStreetLine(raw: string): { street: string; number: string } {
  // Match "Rua X, 45" but also "Rua X, 45, Bairro" — no end-of-string anchor
  // so extra segments (neighborhood typed in wrong step) don't break parsing.
  const m = raw.trim().match(/^(.*?),?\s*(\d+[^\s,]*)/);
  return m
    ? { street: (m[1] ?? "").trim(), number: (m[2] ?? "").trim() }
    : { street: raw.trim(), number: "" };
}

function parseNeighborhoodLine(raw: string): { neighborhood: string; complement: string } {
  const parts = raw.split(",").map((p) => p.trim());
  return { neighborhood: parts[0] ?? "", complement: parts.slice(1).join(", ") };
}

const TRIVIAL_WORDS = new Set([
  "sim", "ok", "okay", "certo", "blz", "beleza", "pode", "claro", "ótimo",
  "oi", "ola", "olá", "não", "nao", "talvez",
]);

function isValidName(text: string): boolean {
  const t = text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (t.length < 2 || t.split(/\s+/).every((w) => TRIVIAL_WORDS.has(w))) return false;
  return /[a-z]/i.test(t);
}

function formatDisplayPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const local = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findBeverageCat(cats: MenuCategory[]) {
  return cats.find((c) => {
    const n = norm(c.name);
    return (
      n.includes("bebida") || n.includes("drink")  || n.includes("suco")  ||
      n.includes("refri")  || n.includes("cerveja") || n.includes("vinho") ||
      n.includes("sake")   || n.includes("agua")    || n.includes("shake") ||
      n.includes("alco")   || n.includes("chopp")   || n.includes("limonada")
    );
  }) ?? null;
}

function findDessertCat(cats: MenuCategory[]) {
  return cats.find((c) => {
    const n = norm(c.name);
    return n.includes("sobremesa") || n.includes("doce");
  }) ?? null;
}

function itemCartQty(item: MenuItem, cart: CartItem[]): number {
  if (!item.hasVariants) {
    return cart
      .filter((c) => c.baseItemId === item.id || c.id === item.id)
      .reduce((sum, c) => sum + c.qty, 0);
  }
  return cart
    .filter((c) => item.variants.some((v) => `${item.id}_${v.id}` === c.id))
    .reduce((sum, c) => sum + c.qty, 0);
}

function variantCartQty(itemId: string, variantId: string, cart: CartItem[]): number {
  return cart.find((c) => c.id === `${itemId}_${variantId}`)?.qty ?? 0;
}

function itemMinPrice(item: MenuItem): number {
  if (!item.hasVariants || item.variants.length === 0) return item.price;
  const priced = item.variants.filter((v) => v.price > 0);
  if (priced.length === 0) return item.price;
  return Math.min(...priced.map((v) => v.price));
}

// ── Deterministic checkout prompts ────────────────────────────────────────────
// The AI is NOT called at checkout stages. These messages are rendered into
// the chat directly from client state — they never vary or hallucinate.

const CHECKOUT_ENTRY_PROMPT: Partial<Record<Stage, string>> = {
  DELIVERY_TYPE:        "Vai receber em casa ou prefere retirar? 👇",
  SAVED_ADDRESS_OFFER:  "Posso entregar no seu último endereço? 👇",
  CEP_INPUT:            "Qual é o seu CEP? 📍",
  ADDRESS_COMPLETE:     "Confirme o endereço de entrega 👇",
  ADDRESS_CONFIRM:      "Endereço certo? Confirma para seguir 👇",
  ASK_NAME:         "Como posso te chamar? 😊",
  PAYMENT:               "Quer pagar agora ou na entrega? 👇",
  PAYMENT_METHOD:        "Como prefere pagar? 👇",
  ONLINE_METHOD_SELECT:  "Escolha como quer pagar online 👇",
  REVIEW_ORDER:          "Quase pronto! Confere e confirma 👇",
};

function formatAddress(a: Address): string {
  const line1 = [a.street, a.number].filter(Boolean).join(", ");
  const line2 = [a.neighborhood, a.complement].filter(Boolean).join(" — ");
  const line3 = [a.city, a.state].filter(Boolean).join("/");
  return [line1, line2, line3].filter(Boolean).join(", ");
}

function resolvePaymentMethod(
  mode: PaymentMode | null,
  sub: PaymentMethodSub | null,
): string | null {
  if (!mode) return null;
  if (mode === "pay_now") return "Pagar agora";
  const subLabels: Record<PaymentMethodSub, string> = {
    card_machine:  mode === "pay_on_delivery" ? "Cartão na entrega" : "Cartão na retirada",
    pix_in_person: mode === "pay_on_delivery" ? "Pix na entrega"    : "Pix na retirada",
    cash:          "Dinheiro",
  };
  return sub ? subLabels[sub] : (mode === "pay_on_delivery" ? "Pagar na entrega" : "Pagar na retirada");
}

/**
 * Determines the earliest checkout stage that still needs input,
 * based on what data is already collected. Used to skip ahead when the
 * customer returns to checkout after browsing back to the menu.
 */
function computeResumeStage(
  deliveryMethod: "delivery" | "pickup" | null,
  address: Address,
  customerName: string,
  paymentMode: PaymentMode | null,
  paymentMethodSub: PaymentMethodSub | null,
): Stage {
  if (!deliveryMethod) return "DELIVERY_TYPE";
  if (deliveryMethod === "delivery") {
    if (!address.cep.trim())    return "CEP_INPUT";
    if (!address.number.trim()) return "ADDRESS_COMPLETE";
    // SAVED_ADDRESS_OFFER is a transient entry stage — never a resume target.
  }
  if (!customerName.trim()) return "ASK_NAME";
  if (!paymentMode)                                    return "PAYMENT";
  if (paymentMode === "pay_now")                       return "ONLINE_METHOD_SELECT";
  if (!paymentMethodSub)                               return "PAYMENT_METHOD";
  return "REVIEW_ORDER";
}

// ── Bubble ────────────────────────────────────────────────────────────────────

function Bubble({
  msg,
  onOptionSelect,
  onItemAdd,
}: {
  msg: ChatMessage;
  onOptionSelect?: (value: string, label: string) => void;
  onItemAdd?: (item: MenuItem) => void;
}) {
  const isUser = msg.role === "user";
  if (msg.content.trim() === "") return null;
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-testid={isUser ? "bubble-user" : "bubble-waiter"}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "rounded-br-sm bg-[#dcf8c6] text-gray-900"
            : msg.isOperator
              ? "rounded-bl-sm border border-amber-200 bg-amber-50 text-gray-900"
              : "rounded-bl-sm bg-white text-gray-900"
        }`}
      >
        {msg.isOperator && (
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
            👤 Atendente
          </p>
        )}
        <p style={{ whiteSpace: "pre-wrap" }}>{msg.content}</p>
        <p className={`mt-1 text-right text-[10px] ${isUser ? "text-green-700" : "text-gray-400"}`}>
          {formatTime(msg.ts)}
        </p>
        {!isUser && msg.options && msg.options.length > 0 && onOptionSelect && (
          <div className="mt-2.5 flex flex-wrap gap-2" data-testid="waiter-options">
            {msg.options.map((opt) => (
              <button
                key={opt.value}
                data-testid={`waiter-option-${opt.value}`}
                onClick={() => onOptionSelect(opt.value, opt.label)}
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-green-50 hover:border-green-300 hover:text-green-800 active:scale-95 transition-all"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-gray-400"
              style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


// ── Product card ──────────────────────────────────────────────────────────────
// Thumbnail — w-36, square image zone + content. Image + name + price + add.

function ProductCard({
  item,
  qty,
  onAdd,
  onOpen,
}: {
  item: MenuItem;
  qty: number;
  onAdd: () => void;
  onOpen: () => void;
}) {
  return (
    /* w-36 card: image zone compact (h-24) to preserve chat space; content auto-height */
    <div data-testid={`product-card-${item.id}`} className="flex w-36 h-full shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

      {/* Image zone — compact height, tappable, center-cropped */}
      <button onClick={onOpen} className="h-24 w-full shrink-0 overflow-hidden">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover object-center"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-100 text-4xl">
            {categoryEmoji(item.name)}
          </div>
        )}
      </button>

      {/* Content zone — fills remaining height, price+button pinned to bottom */}
      <div className="flex flex-1 flex-col px-3 pb-3 pt-2">
        {item.promotion && (
          <span className="mb-1 self-start rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
            {item.promotion.badgeText}
          </span>
        )}
        <p
          onClick={onOpen}
          className="cursor-pointer text-[13px] font-semibold leading-snug text-gray-900 line-clamp-2"
        >
          {item.name}
        </p>

        <div className="mt-auto flex items-center justify-between">
          <div className="flex flex-col">
            {item.promotion && !item.hasVariants ? (
              <>
                <span className="text-[10px] text-gray-400 line-through leading-none">
                  R$ {item.price.toFixed(2).replace(".", ",")}
                </span>
                <span className="text-xs font-bold text-red-600">
                  R$ {item.promotion.promotionalPrice.toFixed(2).replace(".", ",")}
                </span>
              </>
            ) : (
              <span className="text-xs font-bold text-gray-900">
                {item.hasVariants && item.variants.length > 0
                  ? `A partir de R$ ${itemMinPrice(item).toFixed(2).replace(".", ",")}`
                  : `R$ ${item.price.toFixed(2).replace(".", ",")}`}
              </span>
            )}
          </div>
          <button
            onClick={onAdd}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
              qty > 0
                ? "text-white"
                : "bg-gray-100 text-gray-700 hover:text-white"
            }`}
          style={qty > 0 ? { backgroundColor: 'var(--brand-primary)' } : undefined}
          >
            {qty > 0 ? qty : "+"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Image carousel (detail sheet) ─────────────────────────────────────────────
// Hand-written Tailwind snap-scroll carousel (no lib). Touch events are stopped
// from bubbling so they don't trigger the modal's swipe-to-close.
function ImageCarousel({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  return (
    <div className="relative h-full w-full">
      <div
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(el.clientWidth > 0 ? Math.round(el.scrollLeft / el.clientWidth) : 0);
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src}
            alt={`${alt} — foto ${i + 1}`}
            className="h-full w-full shrink-0 snap-center object-cover object-center"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full bg-white shadow transition-all ${i === active ? "w-4" : "w-1.5 opacity-60"}`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Product modal ─────────────────────────────────────────────────────────────
// Expanded card — image dominates, then name → description → price → CTA.

function ProductModal({
  item,
  qty,
  onAdd,
  onAddCustomized,
  onAddVariant,
  cart,
  onClose,
}: {
  item: MenuItem;
  qty: number;
  onAdd: () => void;
  onAddCustomized?: (notes: string, selectedOptions: SelectedOption[], selectedExtras: SelectedExtra[]) => void;
  onAddVariant?: (variant: MenuItemVariant) => void;
  cart?: CartItem[];
  onClose: () => void;
}) {
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  const paidExtras    = item.extras.filter((e) => e.price > 0);
  const freeExtras    = item.extras.filter((e) => e.price === 0);
  // Valid variants: must have a price and a non-empty name.
  const validVariants = item.variants.filter((v) => v.price > 0 && v.name.trim());
  const hasCustomization = !item.hasVariants && (item.optionGroups.length > 0 || paidExtras.length > 0);
  // A removal group is optional and all its options are free — use checkboxes
  function isRemovalGroup(group: OptionGroup) {
    return !group.required && group.options.every((o) => o.price === 0);
  }

  const [optionQtys, setOptionQtys] = useState<Record<string, number>>({});
  const [extraQtys, setExtraQtys]   = useState<Record<string, number>>({});
  const [notes, setNotes]           = useState("");
  const [errors, setErrors]         = useState<string[]>([]);

  function groupTotal(group: OptionGroup) {
    return group.options.reduce((s, o) => s + (optionQtys[o.id] ?? 0), 0);
  }

  const optionsExtra = item.optionGroups
    .flatMap((g) => g.options)
    .reduce((s, o) => s + (optionQtys[o.id] ?? 0) * o.price, 0);
  const extrasExtra = paidExtras.reduce((s, e) => s + (extraQtys[e.id] ?? 0) * e.price, 0);
  const finalPrice  = (item.promotion?.promotionalPrice ?? item.price) + optionsExtra + extrasExtra;

  function changeOptionQty(group: OptionGroup, optionId: string, delta: number) {
    setErrors([]);
    setOptionQtys((prev) => {
      const cur    = prev[optionId] ?? 0;
      const newQty = Math.max(0, cur + delta);
      const total  = groupTotal(group) - cur + newQty;
      if (delta > 0 && group.maxSelect > 0 && total > group.maxSelect) return prev;
      return { ...prev, [optionId]: newQty };
    });
  }

  function changeExtraQty(extraId: string, delta: number) {
    setExtraQtys((prev) => ({ ...prev, [extraId]: Math.max(0, (prev[extraId] ?? 0) + delta) }));
  }

  function handleConfirmAdd() {
    // Simple product with a note → route through customized add so note is persisted
    if (!hasCustomization) {
      if (notes.trim()) { onAddCustomized?.(notes, [], []); }
      else { onAdd(); }
      return;
    }

    const errs: string[] = [];
    for (const group of item.optionGroups) {
      const total     = groupTotal(group);
      const minNeeded = group.required ? Math.max(group.minSelect, 1) : group.minSelect;
      if (total < minNeeded) {
        errs.push(`"${group.name}": selecione pelo menos ${minNeeded} opção`);
      }
    }
    if (errs.length > 0) { setErrors(errs); return; }

    const selectedOptions: SelectedOption[] = item.optionGroups.flatMap((group) =>
      group.options
        .filter((o) => (optionQtys[o.id] ?? 0) > 0)
        .map((o) => ({
          groupId:         group.id,
          groupName:       group.name,
          optionId:        o.id,
          optionName:      o.name,
          qty:             optionQtys[o.id]!,
          priceAdjustment: o.price,
        })),
    );

    const selectedExtras: SelectedExtra[] = paidExtras
      .filter((e) => (extraQtys[e.id] ?? 0) > 0)
      .map((e) => ({ extraId: e.id, name: e.name, unitPrice: e.price, qty: extraQtys[e.id]! }));

    onAddCustomized?.(notes, selectedOptions, selectedExtras);
  }

  return (
    <div
      data-testid="modal-overlay"
      className="fixed inset-0 z-50 bg-white flex flex-col sm:items-center sm:justify-center sm:bg-black/60 sm:backdrop-blur-sm"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]!.clientX;
        touchStartY.current = e.touches[0]!.clientY;
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0]!.clientX - touchStartX.current;
        const dy = Math.abs(e.changedTouches[0]!.clientY - touchStartY.current);
        if (Math.abs(dx) > 80 && Math.abs(dx) > dy * 1.5) onClose();
      }}
    >
      {/* Card — flex column on both mobile and desktop for true sticky footer */}
      <div className="relative w-full h-full flex flex-col overflow-hidden sm:max-w-md sm:h-[92vh] sm:rounded-2xl sm:shadow-2xl bg-white">

        {/* Back arrow — pinned to the card corner so it stays reachable while scrolling */}
        <button
          onClick={onClose}
          className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 active:scale-90 transition-transform text-lg"
        >
          ←
        </button>

        {/* ── Scroll area — the image lives INSIDE the scroll flow, so it scrolls
             together with the content ("colada na página") instead of floating at
             the top with the text sliding underneath it. ── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Image — first block in the scroll flow */}
          <div className="relative w-full bg-gray-100 overflow-hidden" style={{ aspectRatio: "1 / 1", maxHeight: "50vh" }}>
            {(() => {
              // Carousel only when opted-in AND there are extra photos; else the cover.
              const imgs = item.carouselEnabled && item.images.length > 0
                ? item.images
                : item.imageUrl ? [item.imageUrl] : [];
              if (imgs.length === 0) {
                return (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-7xl">
                    {categoryEmoji(item.name)}
                  </div>
                );
              }
              if (imgs.length === 1) {
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imgs[0]!}
                    alt={item.name}
                    className="w-full h-full object-cover object-center"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                );
              }
              return <ImageCarousel images={imgs} alt={item.name} />;
            })()}
          </div>

        <div className="px-6 pt-5 pb-4">
          <h2 className="text-xl font-bold leading-snug text-gray-900">{item.name}</h2>

          {item.description && (
            <p className="mt-2 text-sm leading-relaxed text-gray-500 whitespace-pre-line">{item.description}</p>
          )}

          {/* Serving size + portion info */}
          {(item.servingSize || item.portionInfo) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.servingSize && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                  👥 Serve {item.servingSize === 4 ? "4+" : item.servingSize} {item.servingSize === 1 ? "pessoa" : "pessoas"}
                </span>
              )}
              {item.portionInfo && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                  ⚖️ {item.portionInfo}
                </span>
              )}
            </div>
          )}

          {/* Ingredients */}
          {item.ingredients && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Ingredientes</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{item.ingredients}</p>
            </div>
          )}

          {/* ── Option groups ── */}
          {item.optionGroups.map((group) => {
            const total    = groupTotal(group);
            const removal  = isRemovalGroup(group);
            return (
              <div key={group.id} className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-700">{group.name}</p>
                  {group.required && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-bold uppercase text-red-500">
                      Obrigatório
                    </span>
                  )}
                  {!removal && group.maxSelect > 0 && (
                    <span className="ml-auto text-[10px] text-gray-400">{total}/{group.maxSelect}</span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {group.options.map((option) => {
                    const oQty = optionQtys[option.id] ?? 0;
                    if (removal) {
                      // Checkbox style for removal groups
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setErrors([]);
                            setOptionQtys((prev) => ({ ...prev, [option.id]: prev[option.id] ? 0 : 1 }));
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                            oQty > 0 ? "bg-orange-50 border border-orange-200" : "bg-gray-50 border border-transparent"
                          }`}
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-xs font-bold transition-colors ${
                            oQty > 0 ? "border-orange-500 bg-orange-500 text-white" : "border-gray-300 bg-white text-transparent"
                          }`}>✓</span>
                          <span className="flex-1 text-sm text-gray-800 font-medium">{option.name}</span>
                          {option.portion && (
                            <span className="shrink-0 text-xs text-gray-400">{option.portion}</span>
                          )}
                        </button>
                      );
                    }
                    // Stepper style for combo/paid groups
                    return (
                      <div key={option.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 font-medium">{option.name}</p>
                          {option.portion && <p className="text-xs text-gray-400">{option.portion}</p>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          {option.price > 0 && (
                            <span className="text-xs font-semibold text-gray-600">
                              + R$ {option.price.toFixed(2).replace(".", ",")}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => changeOptionQty(group, option.id, -1)}
                              disabled={oQty === 0}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-100 active:scale-90 transition-transform text-base"
                            >
                              −
                            </button>
                            <span className="w-4 text-center text-sm font-bold text-gray-900">{oQty}</span>
                            <button
                              type="button"
                              onClick={() => changeOptionQty(group, option.id, 1)}
                              disabled={group.maxSelect > 0 && total >= group.maxSelect}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-white disabled:opacity-30 hover:opacity-90 active:scale-90 transition-transform text-sm font-bold"
                              style={{ backgroundColor: 'var(--brand-primary)' }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* ── Paid extras (interactive) ── */}
          {paidExtras.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-700">Adicionais</p>
              <div className="space-y-1.5">
                {paidExtras.map((extra) => {
                  const eQty = extraQtys[extra.id] ?? 0;
                  return (
                    <div key={extra.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 font-medium">
                          {extra.name}{extra.portion ? ` (${extra.portion})` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs font-semibold text-gray-600">
                          + R$ {extra.price.toFixed(2).replace(".", ",")}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => changeExtraQty(extra.id, -1)}
                            disabled={eQty === 0}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-100 active:scale-90 transition-transform text-base"
                          >
                            −
                          </button>
                          <span className="w-4 text-center text-sm font-bold text-gray-900">{eQty}</span>
                          <button
                            type="button"
                            onClick={() => changeExtraQty(extra.id, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-white hover:opacity-90 active:scale-90 transition-transform text-sm font-bold"
                            style={{ backgroundColor: 'var(--brand-primary)' }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Free extras (read-only) ── */}
          {freeExtras.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Incluído</p>
              <div className="space-y-1.5">
                {freeExtras.map((e) => (
                  <div key={e.id} className="flex items-center rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-sm text-gray-700">{e.name}{e.portion ? ` (${e.portion})` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Variants ── */}
          {validVariants.length > 0 && (
            <div className="mt-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Escolha uma opção
              </p>
              <div className="space-y-2">
                {validVariants.map((v) => {
                  const vQty = cart ? variantCartQty(item.id, v.id, cart) : 0;
                  return (
                    <button
                      key={v.id}
                      onClick={() => onAddVariant?.(v)}
                      className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:bg-green-50 hover:border-green-200 active:scale-[0.98] transition-all"
                    >
                      <span className="text-sm font-semibold text-gray-900">{v.name}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-bold text-gray-800">
                          R$ {v.price.toFixed(2).replace(".", ",")}
                        </span>
                        {vQty > 0 && (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
                            {vQty}
                          </span>
                        )}
                        <span className="flex h-8 w-8 items-center justify-center rounded-full text-white text-base font-bold shadow-sm" style={{ backgroundColor: 'var(--brand-primary)' }}>+</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Notes (only for non-variant products) ── */}
          {!item.hasVariants && (
            <div className="mt-4 mb-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Observações
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: sem cebola, bem passado…"
                rows={2}
                maxLength={200}
                style={{ fontSize: "16px" }}
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-gray-300 focus:outline-none"
              />
            </div>
          )}
        </div>
        </div>{/* end scrollable content */}

        {/* ── Footer — always visible (shrink-0 in flex column) ── */}
        <div className="shrink-0 px-6 pb-8 pt-4 border-t border-gray-100 bg-white">
          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 space-y-0.5">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">{e}</p>
              ))}
            </div>
          )}

          {!item.hasVariants ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Preço</p>
                {item.promotion && optionsExtra === 0 && extrasExtra === 0 ? (
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-red-600">
                      R$ {item.promotion.promotionalPrice.toFixed(2).replace(".", ",")}
                    </p>
                    <p className="text-sm text-gray-400 line-through">
                      R$ {item.price.toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                ) : (
                  <p className="text-2xl font-bold text-gray-900">
                    R$ {(isNaN(finalPrice) ? item.price : finalPrice).toFixed(2).replace(".", ",")}
                  </p>
                )}
              </div>
              <button
                onClick={handleConfirmAdd}
                className="flex-1 rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {qty > 0 ? `+ Adicionar (${qty} no carrinho)` : "Adicionar ao pedido"}
              </button>
            </div>
          ) : validVariants.length > 0 ? (
            qty > 0 ? (
              <p className="text-center text-xs text-gray-400">
                {qty} {qty === 1 ? "item" : "itens"} no carrinho
              </p>
            ) : null
          ) : (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-amber-800">Produto com variações pendentes de cadastro.</p>
              <p className="mt-1 text-xs text-amber-600">Corrija as variações no cardápio para liberar este item.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cart bar ──────────────────────────────────────────────────────────────────

function CartBar({
  cart,
  onFinalize,
  upsellPending,
}: {
  cart:          CartItem[];
  onFinalize:    () => void;
  upsellPending: boolean;
}) {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);

  // Always render so space is reserved from the start → no layout jump on first add.
  // Both empty and active states share the same container + inner heights.
  return (
    <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-1.5">
      {count === 0 ? (
        // Inactive placeholder — same height as the active button below
        <div className="flex w-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-2 text-sm text-gray-400">
          Monte seu pedido
        </div>
      ) : (
        <button
          data-testid="finalize-button"
          onClick={onFinalize}
          className={`flex w-full items-center justify-between rounded-2xl px-5 py-2 text-sm font-bold text-white shadow transition ${
            upsellPending
              ? "bg-gray-400 hover:bg-gray-500"
              : "hover:opacity-90"
          }`}
          style={!upsellPending ? { backgroundColor: 'var(--brand-primary)' } : undefined}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/30 text-xs font-bold">
            {count}
          </span>
          <span>{upsellPending ? "Continuar →" : "Finalizar pedido"}</span>
          <span data-testid="cart-badge">R$ {total.toFixed(2).replace(".", ",")}</span>
        </button>
      )}
    </div>
  );
}

// ── Cart FAB (floating button) ────────────────────────────────────────────────
// Visible in BROWSE stage. Shows total item count badge.

function CartFAB({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return null;
  return (
    <button
      onClick={onClick}
      aria-label={`Ver carrinho — ${count} ${count === 1 ? "item" : "itens"}`}
      className="absolute bottom-[5.5rem] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition active:scale-95"
      style={{ backgroundColor: 'var(--brand-secondary)' }}
    >
      <span className="text-2xl leading-none">🛒</span>
      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow">
        {count > 99 ? "99+" : count}
      </span>
    </button>
  );
}

// ── Desktop product card ──────────────────────────────────────────────────────
// Used in the right-column CSS grid on lg+ screens. Fills its grid cell.

function DesktopProductCard({
  item,
  qty,
  onAdd,
  onOpen,
}: {
  item: MenuItem;
  qty: number;
  onAdd: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Image — square, center-cropped */}
      <button
        onClick={onOpen}
        className="aspect-square w-full shrink-0 overflow-hidden bg-gray-100"
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover object-center"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            {categoryEmoji(item.name)}
          </div>
        )}
      </button>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3">
        {item.promotion && (
          <span className="mb-1 self-start rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white leading-none">
            {item.promotion.badgeText}
          </span>
        )}
        <p
          onClick={onOpen}
          className="cursor-pointer text-sm font-bold leading-snug text-gray-900 line-clamp-2"
        >
          {item.name}
        </p>
        {item.description && (
          <p className="mt-1 text-xs text-gray-500 line-clamp-2">{item.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex flex-col">
            {item.promotion && !item.hasVariants ? (
              <>
                <span className="text-[11px] text-gray-400 line-through leading-none">
                  R$ {item.price.toFixed(2).replace(".", ",")}
                </span>
                <span className="text-sm font-extrabold text-red-600">
                  R$ {item.promotion.promotionalPrice.toFixed(2).replace(".", ",")}
                </span>
              </>
            ) : (
              <span className="text-sm font-extrabold text-gray-900">
                {item.hasVariants && item.variants.length > 0
                  ? `A partir de R$ ${itemMinPrice(item).toFixed(2).replace(".", ",")}`
                  : `R$ ${item.price.toFixed(2).replace(".", ",")}`}
              </span>
            )}
          </div>
          <button
            onClick={onAdd}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-colors ${
              qty > 0
                ? "text-white"
                : "bg-gray-100 text-gray-700 hover:text-white"
            }`}
            style={qty > 0 ? { backgroundColor: 'var(--brand-primary)' } : undefined}
          >
            {qty > 0 ? qty : "+"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cart drawer ───────────────────────────────────────────────────────────────
// Slide-up sheet showing items, quantities, total, and a Finalizar CTA.

function CartDrawer({
  cart,
  onIncrement,
  onDecrement,
  onRemove,
  onFinalize,
  onClose,
}: {
  cart: CartItem[];
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
  onFinalize: () => void;
  onClose: () => void;
}) {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-t-[2rem] bg-white" style={{ maxHeight: "80dvh" }}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3">
          <div>
            <p className="text-base font-bold text-gray-900">Seu pedido</p>
            <p className="text-xs text-gray-400">{count} {count === 1 ? "item" : "itens"}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-90 transition-transform"
          >
            ✕
          </button>
        </div>

        {/* Item list */}
        <div className="overflow-y-auto px-6" style={{ maxHeight: "calc(80dvh - 12rem)" }}>
          {cart.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Carrinho vazio</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-3">
                  {/* Name + price */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                    {(item.selectedOptions?.length || item.selectedExtras?.length || item.notes) && (
                      <p className="mt-0.5 text-[10px] text-gray-400 line-clamp-1">
                        {[
                          item.selectedOptions?.map((o) => `${o.qty}× ${o.optionName}`).join(", "),
                          item.selectedExtras?.map((e) => `${e.qty}× ${e.name}`).join(", "),
                          item.notes,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      R$ {item.price.toFixed(2).replace(".", ",")} × {item.qty}
                    </p>
                  </div>

                  {/* Qty controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => item.qty <= 1 ? onRemove(item.id) : onDecrement(item.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 active:scale-90 transition-transform text-base"
                    >
                      {item.qty <= 1 ? "🗑" : "−"}
                    </button>
                    <span className="w-5 text-center text-sm font-bold text-gray-900">{item.qty}</span>
                    <button
                      onClick={() => onIncrement(item.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-white hover:opacity-90 active:scale-90 transition-transform text-sm font-bold"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      +
                    </button>
                  </div>

                  {/* Subtotal */}
                  <p className="w-16 shrink-0 text-right text-sm font-bold text-gray-800">
                    R$ {(item.price * item.qty).toFixed(2).replace(".", ",")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — total + CTA */}
        {cart.length > 0 && (
          <div className="border-t border-gray-100 px-6 pb-8 pt-4">
            <div className="mb-3 flex justify-between">
              <span className="text-sm font-semibold text-gray-600">Total</span>
              <span className="text-lg font-bold text-gray-900">
                R$ {total.toFixed(2).replace(".", ",")}
              </span>
            </div>
            <button
              onClick={() => { onClose(); onFinalize(); }}
              className="w-full rounded-2xl py-4 text-sm font-bold text-white shadow active:scale-[0.98] transition-all hover:opacity-90"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Finalizar pedido 🎉
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PhoneEntryCard ────────────────────────────────────────────────────────────
// Phone-first identification: step 1 = phone only, step 2 = name only (new customers).

function PhoneEntryCard({
  slug,
  onIdentified,
  onSkip,
}: {
  slug: string;
  onIdentified: (name: string | null, customerId?: string, displayPhone?: string) => void;
  onSkip?: () => void;
}) {
  const [phase, setPhase]               = useState<"phone" | "name">("phone");
  const [phoneInput, setPhoneInput]     = useState("");
  const [nameInput,  setNameInput]      = useState("");
  const [collectedPhone, setCollectedPhone] = useState("");
  const [loading, setLoading]           = useState(false);
  const [error,   setError]             = useState<string | null>(null);

  async function handlePhoneSubmit(e: FormEvent) {
    e.preventDefault();
    const ph = phoneInput.trim();
    const digits = ph.replace(/\D/g, "");
    if (digits.length < 10) { setError("Informe um WhatsApp válido."); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/qr/${slug}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: ph }),
      });
      const data: { found: boolean; name?: string; customerId?: string } = await res.json();
      const displayPh = formatDisplayPhone(ph);
      if (data.found && data.name) {
        // Existing customer — no name needed
        try {
          sessionStorage.setItem(
            `foocci-customer-${slug}`,
            JSON.stringify({ phone: ph, name: data.name, customerId: data.customerId, displayPhone: displayPh }),
          );
        } catch { /* ignore */ }
        onIdentified(data.name, data.customerId, displayPh);
      } else {
        // New customer — ask name next
        setCollectedPhone(ph);
        setPhase("name");
      }
    } catch {
      setError("Erro ao verificar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (name.length < 2) { setError("Informe seu nome."); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/qr/${slug}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: collectedPhone, name }),
      });
      const data: { found: boolean; name?: string; customerId?: string } = await res.json();
      const firstName  = name.trim().split(/\s+/)[0]!;
      const resolved   = data.name ?? firstName;
      const displayPh  = formatDisplayPhone(collectedPhone);
      try {
        sessionStorage.setItem(
          `foocci-customer-${slug}`,
          JSON.stringify({ phone: collectedPhone, name: resolved, customerId: data.customerId, displayPhone: displayPh }),
        );
      } catch { /* ignore */ }
      onIdentified(resolved, data.customerId, displayPh);
    } catch {
      setError("Erro ao salvar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (phase === "name") {
    return (
      <div className="rounded-2xl rounded-bl-sm bg-white shadow-sm px-4 py-4 max-w-sm w-full">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Novo cadastro</p>
        <p className="mb-3 text-xs text-gray-500">Pra gente identificar seu pedido.</p>
        <form onSubmit={handleNameSubmit} className="flex flex-col gap-2.5">
          <input
            type="text"
            inputMode="text"
            autoCapitalize="words"
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Seu nome"
            style={{ fontSize: "16px" }}
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#25d366] focus:outline-none"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={!nameInput.trim() || loading}
            className="rounded-xl py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40 transition-all"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            {loading ? "Salvando…" : "Continuar →"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-2xl rounded-bl-sm bg-white shadow-sm px-4 py-4 max-w-sm w-full">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Identificação rápida</p>
      <p className="mb-3 text-xs text-gray-500">
        Usamos seu WhatsApp para identificar seu cadastro e facilitar seus pedidos.
      </p>
      <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-2.5">
        <input
          type="tel"
          inputMode="numeric"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          placeholder="(11) 99999-9999"
          style={{ fontSize: "16px" }}
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#25d366] focus:outline-none"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={!phoneInput.trim() || loading}
          className="rounded-xl py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40 transition-all"
          style={{ backgroundColor: "var(--brand-primary)" }}
        >
          {loading ? "Verificando…" : "Continuar →"}
        </button>
        {onSkip && (
          <button type="button" onClick={onSkip} className="py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Pular →
          </button>
        )}
      </form>
    </div>
  );
}

// ── CustomerIdentityStrip / Área do cliente ───────────────────────────────────
// Thin bar shown below the header once the customer is identified — "Olá, {name}
// · {phone}" + "Trocar". Tapping it unrolls the customer area: dados básicos,
// endereços (com o padrão), e os cupons do cliente. Classificação (Ouro/Prata…)
// fica reservada para quando existir. Loaded lazily on first open.

interface CustomerProfile {
  name: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  tier: string | null;
  addresses: Array<{
    id: string; label: string | null; street: string; number: string;
    complement: string | null; neighborhood: string; city: string; state: string;
    zipCode: string; isDefault: boolean;
  }>;
}

type WalletCoupon = { id: string; label: string; discountType: string; discountValue: number; isReward?: boolean; expiresAt: string | null };

function formatProfileAddress(a: CustomerProfile["addresses"][number]): string {
  const line1 = [a.street, a.number].filter(Boolean).join(", ");
  const rest  = [a.complement, a.neighborhood, a.city && a.state ? `${a.city}/${a.state}` : a.city || a.state]
    .filter(Boolean).join(" · ");
  return [line1, rest].filter(Boolean).join(" — ");
}

/** Up to two uppercase initials from a name, for the avatar. */
function customerInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return letters || "?";
}

// Tabs of the customer area. Add entries here as new sections appear (pedidos,
// favoritos, endereços dedicados, …) — the UI renders them automatically.
const CUSTOMER_TABS: Array<{ id: "info" | "coupons"; label: string; emoji: string }> = [
  { id: "info",    label: "Informações", emoji: "👤" },
  { id: "coupons", label: "Meus cupons", emoji: "🎟️" },
];

const BR_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;

// Editable shape for the address form (id present → editing an existing one).
interface AddressFormValue {
  id?: string;
  label: string; zipCode: string; street: string; number: string;
  complement: string; neighborhood: string; city: string; state: string;
  isDefault: boolean;
}

const EMPTY_ADDRESS = (isDefault: boolean): AddressFormValue => ({
  label: "", zipCode: "", street: "", number: "", complement: "",
  neighborhood: "", city: "", state: "", isDefault,
});

function addressToForm(a: CustomerProfile["addresses"][number]): AddressFormValue {
  return {
    id: a.id, label: a.label ?? "", zipCode: a.zipCode, street: a.street, number: a.number,
    complement: a.complement ?? "", neighborhood: a.neighborhood, city: a.city, state: a.state,
    isDefault: a.isDefault,
  };
}

// ── Address form modal — add or edit an address from the customer area ─────────
// CEP autofills street/neighborhood/city/state via ViaCEP (same source the
// checkout uses). onSave returns an error string or null; null → closes.
function AddressFormModal({
  value, busy, onSave, onClose,
}: {
  value: AddressFormValue;
  busy: boolean;
  onSave: (v: AddressFormValue) => Promise<string | null>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<AddressFormValue>(value);
  const [cepBusy, setCepBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof AddressFormValue>(k: K, v: AddressFormValue[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const lookupCep = async (raw: string) => {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepBusy(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await res.json().catch(() => null);
      if (d && !d.erro) {
        setForm((f) => ({
          ...f,
          street:       d.logradouro || f.street,
          neighborhood: d.bairro     || f.neighborhood,
          city:         d.localidade || f.city,
          state:        d.uf         || f.state,
        }));
      }
    } catch { /* deixa o cliente preencher manualmente */ }
    finally { setCepBusy(false); }
  };

  const submit = async () => {
    setErr(null);
    if (!/^\d{5}-?\d{3}$/.test(form.zipCode.trim())) return setErr("Informe um CEP válido (00000-000).");
    if (form.street.trim().length < 2)  return setErr("Informe a rua.");
    if (!form.number.trim())            return setErr("Informe o número.");
    if (form.neighborhood.trim().length < 2) return setErr("Informe o bairro.");
    if (form.city.trim().length < 2)    return setErr("Informe a cidade.");
    if (!BR_STATES.includes(form.state as (typeof BR_STATES)[number])) return setErr("Selecione o estado (UF).");
    const e = await onSave(form);
    if (e) setErr(e); else onClose();
  };

  const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <p className="text-sm font-bold text-ink">{form.id ? "Editar endereço" : "Adicionar endereço"}</p>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">CEP</label>
            <div className="flex gap-2">
              <input
                inputMode="numeric" value={form.zipCode} placeholder="00000-000" style={{ fontSize: "16px" }}
                onChange={(e) => set("zipCode", e.target.value)}
                onBlur={(e) => void lookupCep(e.target.value)}
                className={inputCls}
              />
              <button type="button" onClick={() => void lookupCep(form.zipCode)} disabled={cepBusy}
                className="shrink-0 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                {cepBusy ? "…" : "Buscar"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Rua</label>
              <input value={form.street} onChange={(e) => set("street", e.target.value)} style={{ fontSize: "16px" }} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Número</label>
              <input value={form.number} onChange={(e) => set("number", e.target.value)} style={{ fontSize: "16px" }} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Complemento <span className="font-normal normal-case text-gray-300">(opcional)</span></label>
            <input value={form.complement} onChange={(e) => set("complement", e.target.value)} placeholder="Apto, bloco…" style={{ fontSize: "16px" }} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Bairro</label>
            <input value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} style={{ fontSize: "16px" }} className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Cidade</label>
              <input value={form.city} onChange={(e) => set("city", e.target.value)} style={{ fontSize: "16px" }} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">UF</label>
              <select value={form.state} onChange={(e) => set("state", e.target.value)} className={inputCls}>
                <option value="">—</option>
                {BR_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Apelido <span className="font-normal normal-case text-gray-300">(opcional)</span></label>
            <input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Casa, Trabalho…" maxLength={50} style={{ fontSize: "16px" }} className={inputCls} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 pt-0.5">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => set("isDefault", e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-brand-600" />
            <span className="text-xs font-medium text-ink2">Usar como endereço padrão</span>
          </label>
          {err && <p className="text-xs font-medium text-red-500">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100">Cancelar</button>
          <button onClick={() => void submit()} disabled={busy || cepBusy}
            className="rounded-xl bg-brand-600 px-5 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerIdentityStrip({
  slug,
  customerId,
  authToken,
  name,
  displayPhone,
  onReset,
}: {
  slug: string;
  customerId: string | null | undefined;
  /** Proof-of-phone token required by the gated profile/address/coupon endpoints. */
  authToken: string | null;
  name: string | null;
  displayPhone: string | null;
  onReset: () => void;
}) {
  // No token → the gated endpoints reveal nothing, so skip the fetches entirely.
  const authHeaders: Record<string, string> = authToken ? { "x-pedido-token": authToken } : {};
  const [open, setOpen]       = useState(false);
  const [tab, setTab]         = useState<"info" | "coupons">("info");
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [coupons, setCoupons] = useState<WalletCoupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false); // "ver todos os endereços"
  const [addrForm, setAddrForm] = useState<AddressFormValue | null>(null); // add/edit modal
  const [addrBusy, setAddrBusy] = useState(false);
  const loadedRef = useRef(false);

  // Refetch just the profile after an address change (so the list updates).
  const reloadProfile = useCallback(async () => {
    if (!customerId || !authToken) return;
    const p = await fetch(`/api/pedido/${slug}/customer-profile?customerId=${encodeURIComponent(customerId)}`, { headers: authHeaders })
      .then((r) => r.json()).catch(() => null);
    if (p?.profile) setProfile(p.profile as CustomerProfile);
  }, [customerId, slug, authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eager load once identified AND holding the proof token: lets the collapsed bar
  // show a live hint (cupons) and opens the panel instantly. Without the token the
  // gated endpoints return nothing, so there is nothing to load.
  useEffect(() => {
    if (loadedRef.current || !customerId || !authToken) return;
    loadedRef.current = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/pedido/${slug}/customer-profile?customerId=${encodeURIComponent(customerId)}`, { headers: authHeaders }).then((r) => r.json()).catch(() => null),
      fetch(`/api/pedido/${slug}/coupons?customerId=${encodeURIComponent(customerId)}`, { headers: authHeaders }).then((r) => r.json()).catch(() => null),
    ]).then(([p, c]) => {
      if (p?.profile) setProfile(p.profile as CustomerProfile);
      if (Array.isArray(c?.coupons)) setCoupons(c.coupons as WalletCoupon[]);
    }).finally(() => setLoading(false));
  }, [customerId, slug, authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Address CRUD (gated: proof token + slug; customerId resolved server-side) ──
  const setAddrDefault = async (id: string) => {
    if (!customerId) return;
    setAddrBusy(true);
    await fetch(`/api/pedido/${slug}/customer-address/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ customerId, isDefault: true }),
    }).catch(() => {});
    await reloadProfile();
    setAddrBusy(false);
  };
  const removeAddr = async (id: string) => {
    if (!customerId || typeof window === "undefined" || !window.confirm("Excluir este endereço?")) return;
    setAddrBusy(true);
    await fetch(`/api/pedido/${slug}/customer-address/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ customerId }),
    }).catch(() => {});
    await reloadProfile();
    setAddrBusy(false);
  };
  const saveAddr = async (v: AddressFormValue): Promise<string | null> => {
    if (!customerId) return "Sessão do cliente não encontrada.";
    setAddrBusy(true);
    try {
      const payload = {
        customerId, label: v.label.trim() || undefined, zipCode: v.zipCode.trim(),
        street: v.street.trim(), number: v.number.trim(), complement: v.complement.trim() || undefined,
        neighborhood: v.neighborhood.trim(), city: v.city.trim(), state: v.state, isDefault: v.isDefault,
      };
      const url = v.id
        ? `/api/pedido/${slug}/customer-address/${v.id}`
        : `/api/pedido/${slug}/customer-address`;
      const res = await fetch(url, {
        method: v.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return (j as { error?: string })?.error ?? "Não foi possível salvar o endereço.";
      }
      await reloadProfile();
      return null;
    } catch {
      return "Erro de rede ao salvar. Tente de novo.";
    } finally {
      setAddrBusy(false);
    }
  };

  if (!name && !displayPhone) return null;
  const canExpand   = Boolean(customerId);
  const displayName = profile?.name || name || "Cliente";
  const firstName   = (name || displayName).split(/\s+/)[0] || "Cliente";
  const defaultAddr = profile?.addresses.find((a) => a.isDefault) ?? profile?.addresses[0] ?? null;
  const otherAddrs  = profile ? profile.addresses.filter((a) => a.id !== defaultAddr?.id) : [];
  const couponHint  = coupons.length > 0
    ? `🎟️ ${coupons.length} ${coupons.length === 1 ? "cupom disponível" : "cupons disponíveis"}`
    : "Meus dados, endereços e cupons";

  return (
    <div className="shrink-0 border-b border-gray-100 bg-white">
      {/* Faixa do cliente — avatar + saudação + dica (cupons). Sutil, destaca sem ofuscar. */}
      <div className="flex items-stretch gap-2 bg-gradient-to-r from-brand-50/80 via-white to-white px-3 py-2">
        <button
          type="button"
          onClick={() => canExpand && setOpen((v) => !v)}
          disabled={!canExpand}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-xs font-bold text-white shadow-sm">
            {customerInitials(displayName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-ink">Olá, {firstName} 👋</span>
            <span className="block truncate text-[11px] font-medium text-brand-700/80">{couponHint}</span>
          </span>
          {canExpand && (
            <svg className={`h-4 w-4 shrink-0 text-brand-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          )}
        </button>
        <button
          onClick={onReset}
          className="shrink-0 self-center rounded-lg px-2.5 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          Trocar
        </button>
      </div>

      {/* Área do cliente (desenrola) — abas + conteúdo de ALTURA FIXA */}
      {open && (
        <div className="border-t border-gray-100 bg-white">
          {/* Abas */}
          <div className="flex gap-1 px-3 pt-1">
            {CUSTOMER_TABS.map((t) => {
              const activeTab = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${activeTab ? "text-brand-700" : "text-gray-400 hover:text-gray-600"}`}
                >
                  <span aria-hidden>{t.emoji}</span>
                  {t.label}
                  {t.id === "coupons" && coupons.length > 0 && (
                    <span className="rounded-full bg-brand-100 px-1.5 text-[9px] font-bold text-brand-700">{coupons.length}</span>
                  )}
                  {activeTab && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
                </button>
              );
            })}
          </div>

          {/* Conteúdo — altura FIXA (h-[280px]) pra a área não pular ao trocar de aba */}
          <div className="h-[280px] overflow-y-auto border-t border-gray-100 bg-gray-50/50 px-4 py-3">
            {loading && !profile ? (
              <div className="flex items-center gap-2 py-3 text-xs text-gray-500">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
                Carregando seus dados…
              </div>
            ) : tab === "info" ? (
              <div className="space-y-3">
                {/* Meus dados */}
                <section>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Meus dados</p>
                  <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white text-xs shadow-sm">
                    <div className="flex justify-between gap-2 px-3.5 py-2.5">
                      <span className="text-gray-400">Nome</span>
                      <span className="min-w-0 truncate font-semibold text-ink">{profile?.name || name || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-2 px-3.5 py-2.5">
                      <span className="text-gray-400">Telefone</span>
                      <span className="min-w-0 truncate font-semibold text-ink">{displayPhone || profile?.phone || "—"}</span>
                    </div>
                    {profile?.email && (
                      <div className="flex justify-between gap-2 px-3.5 py-2.5">
                        <span className="text-gray-400">E-mail</span>
                        <span className="min-w-0 truncate font-semibold text-ink">{profile.email}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-2 px-3.5 py-2.5">
                      <span className="text-gray-400">Nível</span>
                      <span className="text-[11px] font-medium text-gray-400">Em breve</span>
                    </div>
                  </div>
                </section>

                {/* Meus endereços — padrão em destaque + lista + adicionar/editar */}
                <section>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Meus endereços</p>
                    {profile && profile.addresses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAddrForm(EMPTY_ADDRESS(false))}
                        className="text-[11px] font-bold text-brand-600 hover:text-brand-700"
                      >
                        + Adicionar
                      </button>
                    )}
                  </div>
                  {defaultAddr ? (
                    <>
                      {/* Endereço padrão em destaque */}
                      <div className="rounded-2xl border border-brand-200 bg-brand-50/60 px-3.5 py-2.5 text-xs shadow-sm">
                        <div className="flex items-center gap-1.5">
                          <span aria-hidden className="text-sm">📍</span>
                          {defaultAddr.label && <span className="font-bold text-ink">{defaultAddr.label}</span>}
                          <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Padrão</span>
                          <button
                            type="button"
                            onClick={() => setAddrForm(addressToForm(defaultAddr))}
                            className="ml-auto text-[10px] font-semibold text-brand-600 hover:text-brand-700"
                          >
                            Editar
                          </button>
                        </div>
                        <p className="mt-0.5 pl-6 text-gray-600">{formatProfileAddress(defaultAddr)}</p>
                      </div>

                      {/* Todos os endereços (expansível) — só se houver outros */}
                      {otherAddrs.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setAddrOpen((v) => !v)}
                            className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-3.5 py-2 text-[11px] font-semibold text-gray-500 shadow-sm hover:bg-gray-50"
                          >
                            <span>Ver todos os endereços ({profile!.addresses.length})</span>
                            <svg className={`h-3.5 w-3.5 shrink-0 transition-transform ${addrOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                            </svg>
                          </button>
                          {addrOpen && (
                            <ul className="mt-1.5 space-y-1.5">
                              {otherAddrs.map((a) => (
                                <li key={a.id} className="rounded-xl border border-gray-100 bg-white px-3.5 py-2 text-xs shadow-sm">
                                  <div className="flex items-center gap-1.5">
                                    <span aria-hidden className="text-sm">📍</span>
                                    {a.label && <span className="font-semibold text-ink">{a.label}</span>}
                                  </div>
                                  <p className="mt-0.5 pl-6 text-gray-600">{formatProfileAddress(a)}</p>
                                  <div className="mt-1.5 flex gap-3 pl-6">
                                    <button type="button" disabled={addrBusy} onClick={() => void setAddrDefault(a.id)} className="text-[10px] font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-40">Tornar padrão</button>
                                    <button type="button" disabled={addrBusy} onClick={() => setAddrForm(addressToForm(a))} className="text-[10px] font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-40">Editar</button>
                                    <button type="button" disabled={addrBusy} onClick={() => void removeAddr(a.id)} className="text-[10px] font-semibold text-red-500 hover:text-red-700 disabled:opacity-40">Excluir</button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddrForm(EMPTY_ADDRESS(true))}
                      className="w-full rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 px-3.5 py-3 text-center text-[11px] font-semibold text-brand-600 hover:bg-brand-50"
                    >
                      + Adicionar meu primeiro endereço
                    </button>
                  )}
                </section>
              </div>
            ) : (
              /* Aba: Meus cupons */
              <section>
                {coupons.length > 0 ? (
                  <ul className="space-y-2">
                    {coupons.map((w) => (
                      <li key={w.id} className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm">
                        <div className="flex items-stretch">
                          <div className="flex w-14 shrink-0 items-center justify-center bg-gradient-to-br from-brand-500 to-brand-600 text-2xl">
                            {w.isReward ? "🎁" : "🏷️"}
                          </div>
                          <div className="min-w-0 flex-1 px-3.5 py-2.5">
                            <p className="truncate text-sm font-bold text-ink">{w.label}</p>
                            <p className="text-[11px] text-gray-500">
                              {w.isReward ? "Recompensa — resgatada no pedido" : "Desconto no seu pedido"}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium text-gray-400">
                              {w.expiresAt ? `Válido até ${new Date(w.expiresAt).toLocaleDateString("pt-BR")}` : "Sem validade"}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center">
                    <p className="text-2xl">🎁</p>
                    <p className="mt-1 text-xs font-semibold text-gray-500">Você ainda não tem cupons</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">Eles chegam pelas mensagens do restaurante.</p>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {/* Modal de adicionar/editar endereço */}
      {addrForm && (
        <AddressFormModal
          value={addrForm}
          busy={addrBusy}
          onSave={saveAddr}
          onClose={() => setAddrForm(null)}
        />
      )}
    </div>
  );
}

// ── Birthday prompt ───────────────────────────────────────────────────────────
// Shown once, at the start of the chat, to an ALREADY-IDENTIFIED customer who has
// no birthday on file — so the CRM can send a birthday "mimo". Cute, dismissible,
// asks only day + month. Never blocks ordering; self-hides when not needed.

const BIRTHDAY_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function BirthdayPrompt({ slug, customerId, name }: { slug: string; customerId?: string; name: string | null }) {
  const [status, setStatus] = useState<"idle" | "ask" | "saving" | "done" | "hidden">("idle");
  const [day, setDay]       = useState("");
  const [month, setMonth]   = useState("");

  useEffect(() => {
    if (!customerId) { setStatus("hidden"); return; }
    try { if (sessionStorage.getItem(`foocci_bday_${customerId}`) === "1") { setStatus("hidden"); return; } } catch { /* ignore */ }
    let active = true;
    fetch(`/api/pedido/${slug}/birthday?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => (r.ok ? r.json() : { needsBirthday: false }))
      .then((j) => { if (active) setStatus(j?.needsBirthday ? "ask" : "hidden"); })
      .catch(() => { if (active) setStatus("hidden"); });
    return () => { active = false; };
  }, [slug, customerId]);

  function remember() { try { if (customerId) sessionStorage.setItem(`foocci_bday_${customerId}`, "1"); } catch { /* ignore */ } }
  function dismiss() { remember(); setStatus("hidden"); }

  async function save() {
    const d = Number(day), m = Number(month);
    if (!d || !m) return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/pedido/${slug}/birthday`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, day: d, month: m }),
      });
      if (res.ok) { remember(); setStatus("done"); setTimeout(() => setStatus("hidden"), 5000); }
      else setStatus("ask");
    } catch { setStatus("ask"); }
  }

  if (status === "idle" || status === "hidden") return null;
  const firstName = name?.trim().split(/\s+/)[0] ?? "";

  if (status === "done") {
    return (
      <div className="shrink-0 border-b border-pink-100 bg-pink-50 px-4 py-2.5 text-center text-sm text-pink-700">
        🎉 Aêê{firstName ? `, ${firstName}` : ""}! Anotado. No seu dia tem uma surpresa esperando 🎂🎁
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-pink-100 bg-gradient-to-r from-pink-50 to-orange-50 px-4 py-3">
      <p className="text-sm font-semibold text-gray-800">
        🎂 {firstName ? `${firstName}, quando` : "Quando"} é seu aniversário?
      </p>
      <p className="mt-0.5 text-xs text-gray-600">No seu dia a gente adora mandar um mimo especial 🎁 Conta pra gente?</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Dia"
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-pink-400 focus:outline-none">
          <option value="">Dia</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês"
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-pink-400 focus:outline-none">
          <option value="">Mês</option>
          {BIRTHDAY_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <button type="button" disabled={!day || !month || status === "saving"} onClick={save}
          className="rounded-lg bg-pink-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-50">
          {status === "saving" ? "Salvando…" : "Salvar 🎂"}
        </button>
        <button type="button" onClick={dismiss} className="text-xs font-medium text-gray-400 hover:text-gray-600">Agora não</button>
      </div>
    </div>
  );
}

// ── Sales behavior control ────────────────────────────────────────────────────
// Governs how assertively the AI engages during browsing.
// The menu is the primary experience; AI is support only.

type SalesBehavior = {
  aggressiveness:           "low" | "medium" | "high";
  autoSuggestions:          boolean; // promote AI cards to product grid automatically
  interruptNavigation:      boolean; // auto-switch category tabs
  suggestOnAdd:             boolean; // call AI when user adds an item
  suggestOnIdle:            boolean; // call AI directly after inactivity (legacy)
  suggestOnCheckoutIntent:  boolean; // show AI suggestions when user taps Finalizar
  passivePermissionPrompt:  boolean; // ask permission before suggesting to passive users
};

const SALES_BEHAVIOR: SalesBehavior = {
  aggressiveness:           "medium",
  autoSuggestions:          false,
  interruptNavigation:      false,
  suggestOnAdd:             false,
  suggestOnIdle:            false,
  suggestOnCheckoutIntent:  true,
  // Clean opening: the Waiter never auto-pops a permission CTA ("Quer ajuda para
  // escolher? / Me sugere algo / Agora não"). Suggestions come ONLY from the
  // single "Quero uma sugestão" button (or the customer asking). The "Pedir de
  // novo" feature is a visual menu category, not a chat prompt.
  passivePermissionPrompt:  false,
};

// Product cards are shown only when the API returns mode "SUGGESTION" or "INTERVENTION"
// and the current stage is BROWSE. No client-side card inference from any other source.

// Passive trigger: seconds of inactivity before permission prompt fires.
const PASSIVE_TRIGGER_MS   = 8_000;  // 8 s — slightly more patient
// After declining the CTA is silenced permanently for the session (sessionStorage persisted).
const SILENT_COOLDOWN_MS   = 5 * 60 * 1000; // 5 min (cooldown between retries, but max=1 means it never retries)

// ── Address complete panel ────────────────────────────────────────────────────
// Shown after ViaCEP auto-fills street/neighborhood/city/state.
// Customer fills: number (required), complement and referencePoint (optional).

function AddressCompletePanel({
  address,
  onConfirm,
  onEditCep,
}: {
  address: Address;
  onConfirm: (number: string, complement: string, referencePoint: string) => void;
  onEditCep: () => void;
}) {
  const [num, setNum] = useState("");
  const [comp, setComp] = useState("");
  const [ref, setRef] = useState("");

  return (
    <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
      <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2">
        <p className="text-xs font-semibold text-gray-900">
          {address.street || "Logradouro não encontrado"}
        </p>
        <p className="text-xs text-gray-500">
          {[address.neighborhood, address.city, address.state].filter(Boolean).join(", ")}
          {address.cep ? ` · ${address.cep}` : ""}
        </p>
        <button
          type="button"
          onClick={onEditCep}
          className="mt-1 text-[10px] underline"
          style={{ color: "var(--brand-primary)" }}
        >
          Alterar CEP
        </button>
      </div>
      <div className="space-y-2">
        <input
          type="text"
          value={num}
          onChange={(e) => setNum(e.target.value)}
          placeholder="Número *"
          autoFocus
          style={{ fontSize: "16px" }}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <input
          type="text"
          value={comp}
          onChange={(e) => setComp(e.target.value)}
          placeholder="Complemento (apto, bloco…)"
          style={{ fontSize: "16px" }}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <input
          type="text"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Ponto de referência (opcional)"
          style={{ fontSize: "16px" }}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <button
        type="button"
        onClick={() => onConfirm(num, comp, ref)}
        disabled={!num.trim()}
        className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: "var(--brand-primary)" }}
      >
        Confirmar endereço
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PedidoClient({
  slug, restaurantName, logoUrl, phone, categories,
  knownCustomerPhone = null, knownCustomerName = null,
  knownCustomerId = null, knownDefaultAddress = null,
  pedidoToken = null,
  instagramUrl = null, tiktokUrl = null,
  banners = [],
  brandPrimaryColor = null, brandSecondaryColor = null,
  deliveryFee = null, freeDeliveryAbove = null, deliveryMode = "simple",
  deliveryEstimatedMinutes = null, averagePreparationMinutes = null,
  ga4Id = null,
  restaurantIsOpen = true,
  closedMessage = null,
  isOrderingPaused = false,
  pauseReason = null,
  pausedUntil = null,
  recoveryCart,
  repeatOrder,
  repeatMenuItems: repeatMenuItemsProp,
  pixOnlineEnabled = true,
  cardOnlineEnabled = false,
  aiIncluded = true,
}: Props) {
  const pc = brandPrimaryColor || '#25d366';
  const sc = brandSecondaryColor || '#128c7e';
  // ── Chat ─────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [inputText, setInputText] = useState("");
  const [ui, setUi] = useState<UIState>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Tracks categories already introduced this session — prevents repeated intros.
  const visitedCategoryIds = useRef<Set<string>>(new Set());
  // ── Idle timer refs ───────────────────────────────────────────────
  const lastActivityRef = useRef<number>(Date.now());
  const idleFiredRef    = useRef<boolean>(false);

  // ── Menu nav ──────────────────────────────────────────────────────
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [selectedProduct, setSelectedProduct] = useState<MenuItem | null>(null);
  // Tracks whether the currently-open product modal was opened from a Foocci
  // suggestion (vs normal menu browsing) so the modal's add handlers can
  // attribute the resulting cart line as an upsell. Ref (not state) so the
  // value is read synchronously at add-time, immune to render ordering.
  const selectedUpsellRef = useRef(false);
  const openProduct = useCallback((item: MenuItem, fromUpsell = false) => {
    selectedUpsellRef.current = fromUpsell;
    setSelectedProduct(item);
  }, []);

  // ── Chat Inbox — session + conversation tracking ─────────────────
  // sessionId: stable per-tab identifier (survives re-renders, resets on new tab)
  // convId:    returned by server on first logged message, stored in sessionStorage
  const sessionIdRef = useRef<string>(uid());
  const [convId, setConvId] = useState<string | null>(null);
  // humanMode: an operator took over this Cardápio conversation from Atendimento.
  // While true, the AI does not reply; customer messages still reach the operator.
  const [humanMode, setHumanMode] = useState(false);
  const humanModeRef = useRef(false);
  useEffect(() => {
    const sKey = `foocci_sid_${slug}`;
    const cKey = `foocci_cid_${slug}`;
    const existing = sessionStorage.getItem(sKey);
    if (existing) {
      sessionIdRef.current = existing;
    } else {
      sessionStorage.setItem(sKey, sessionIdRef.current);
    }
    const savedConvId = sessionStorage.getItem(cKey);
    if (savedConvId) setConvId(savedConvId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Operator reply polling ───────────────────────────────────────
  // When an operator replies from Atendimento on a Cardápio conversation, the
  // message is stored server-side. Poll for those and surface them in the chat
  // so the customer sees the store's response. Deduped by message id.
  const lastOpPollRef = useRef<string | null>(null); // ISO timestamp of newest seen op msg
  const seenOpIdsRef  = useRef<Set<string>>(new Set());

  // Toggle human-mode in response to the server's aiActive flag. Pushes a one-off
  // system message on each transition so the customer understands who is replying.
  const applyAiActive = useCallback((aiActive: boolean) => {
    const nextHuman = !aiActive;
    if (nextHuman === humanModeRef.current) return; // no transition
    humanModeRef.current = nextHuman;
    setHumanMode(nextHuman);
    setMessages((prev) => [
      ...prev,
      {
        id:      uid(),
        role:    "assistant" as const,
        content: nextHuman
          ? "Atendimento humano ativo. A equipe da loja assumiu a conversa 👩‍💼"
          : "A IA voltou a te atender 😊",
        ts:         new Date(),
        isOperator: nextHuman,
      },
    ]);
  }, []);

  useEffect(() => {
    if (!convId) return;
    let cancelled = false;

    async function poll() {
      try {
        const qs = new URLSearchParams({ conversationId: convId! });
        if (lastOpPollRef.current) qs.set("after", lastOpPollRef.current);
        const res = await fetch(`/api/pedido/${slug}/operator-messages?${qs}`);
        if (!res.ok) return;
        const json = await res.json() as {
          messages?: { id: string; content: string; sentAt: string }[];
          aiActive?: boolean;
        };
        if (!cancelled && typeof json.aiActive === "boolean") applyAiActive(json.aiActive);
        const incoming = json.messages ?? [];
        if (cancelled || incoming.length === 0) return;

        const fresh = incoming.filter((m) => !seenOpIdsRef.current.has(m.id));
        if (fresh.length === 0) return;
        fresh.forEach((m) => seenOpIdsRef.current.add(m.id));
        lastOpPollRef.current = fresh[fresh.length - 1]!.sentAt;

        setMessages((prev) => [
          ...prev,
          ...fresh.map((m) => ({
            id:         `op-${m.id}`,
            role:       "assistant" as const,
            content:    m.content,
            ts:         new Date(m.sentAt),
            isOperator: true,
          })),
        ]);
        setHistory((prev) => [
          ...prev,
          ...fresh.map((m) => ({ role: "assistant" as const, content: m.content })),
        ]);
      } catch {
        /* network blip — try again next tick */
      }
    }

    poll();
    const interval = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, slug]);

  // ── UTM + source capture — read from URL params and persist to sessionStorage ─
  const utmKey      = `foocci-utm-${slug}`;

  const SRC_NORMALIZE: Record<string, string> = {
    instagram: "instagram", ig: "instagram",
    whatsapp:  "whatsapp",  wa: "whatsapp",
    google:    "google",
    qrcode:    "qrcode",    qr: "qrcode",
    crm:       "crm",
    manual:    "manual",
    direct:    "direct",
  };

  useEffect(() => {
    const sp          = new URLSearchParams(window.location.search);
    const srcParam    = sp.get("src");
    const utmSource   = sp.get("utm_source");
    const medium      = sp.get("utm_medium");
    const campaign    = sp.get("utm_campaign");
    const content     = sp.get("utm_content");
    const tlid        = sp.get("_tlid");
    const campaignId  = sp.get("campaignId");
    const customerId  = sp.get("customerId");

    // Normalize: src > utm_source > direct
    const rawSrc   = srcParam ?? utmSource ?? null;
    const source   = rawSrc ? (SRC_NORMALIZE[rawSrc.toLowerCase()] ?? "other") : "direct";

    sessionStorage.setItem(utmKey, JSON.stringify({
      source, medium, campaign, content, tlid, campaignId, customerId,
      landingPath: window.location.pathname + window.location.search,
      firstSeenAt: new Date().toISOString(),
    }));

    // "Indique um amigo": a ?ref=<customerId> link marks who referred this visitor.
    // Persisted in localStorage (30-day validity) so the friend can order later and
    // the referrer still gets the credit at checkout.
    const ref = sp.get("ref");
    if (ref) {
      try {
        localStorage.setItem(`foocci-ref-${slug}`, JSON.stringify({ ref, at: new Date().toISOString() }));
      } catch { /* storage unavailable — referral simply won't track */ }
    }

    // A "visita" (para o KPI de conversão) NÃO é registrada aqui. Uma abertura
    // anônima não conta — só conta quem passa da tela de telefone (obrigatória).
    // Esse registro é feito no servidor, em /api/qr/[slug]/identify, que é o
    // sinal confiável de "entrou identificado" (à prova de ad-block, 1 por
    // entrada). O antigo beacon de abertura foi removido para não contar
    // desistências nem contar em dobro.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Referrer captured from a ?ref link — valid for 30 days after the click. */
  function getReferrerId(): string | undefined {
    try {
      const raw = localStorage.getItem(`foocci-ref-${slug}`);
      if (!raw) return undefined;
      const { ref, at } = JSON.parse(raw) as { ref?: string; at?: string };
      if (!ref) return undefined;
      if (at && Date.now() - new Date(at).getTime() > 30 * 86_400_000) return undefined;
      return ref;
    } catch { return undefined; }
  }

  function getUtm(): {
    source?: string; medium?: string; campaign?: string; content?: string;
    tlid?: string; campaignId?: string; customerId?: string;
  } {
    try {
      const raw = sessionStorage.getItem(utmKey);
      return raw ? (JSON.parse(raw) as ReturnType<typeof getUtm>) : {};
    } catch { return {}; }
  }

  function fireGtag(event: string, params?: Record<string, string | number | undefined>) {
    if (!ga4Id) return;
    const w = window as typeof window & { gtag?: (...args: unknown[]) => void };
    if (typeof w.gtag === "function") w.gtag("event", event, params ?? {});
  }

  // ── Cart ──────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartRestored, setCartRestored] = useState(false);
  // "Pedir novamente" module — dismissed once acted on or when the customer taps "Ver cardápio".
  // Products suggested by the AI — rendered in the product grid, not in chat.
  const [suggestedProducts, setSuggestedProducts] = useState<MenuItem[]>([]);
  // ID of the harmonically suggested item — shown with ⭐ in the carousel.
  const [pinnedCardId, setPinnedCardId] = useState<string | null>(null);
  // Server-side session memory — sent each turn, updated from memoryPatch responses.
  // waiterMemoryRef keeps the value always current so sendText (which has a stale
  // closure over the state) reads the latest value even before React re-renders.
  const [waiterMemory, setWaiterMemory] = useState<Partial<WaiterMemory>>({});
  const waiterMemoryRef = useRef<Partial<WaiterMemory>>({});

  // ── Cart recovery: restore draft items from recovery link ─────────
  useEffect(() => {
    if (!recoveryCart?.length) return;
    setCart(recoveryCart.map((item) => ({
      id:         item.id,
      baseItemId: item.id,
      name:       item.name,
      price:      item.price,
      qty:        item.qty,
    })));
    setCartRestored(true);
    // Auto-dismiss the banner after 6 seconds
    const t = setTimeout(() => setCartRestored(false), 6_000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Guided flow mode ──────────────────────────────────────────────
  // Activated when user accepts the "Can I suggest something?" prompt.
  // Drives a fixed step sequence without calling the AI for each step.
  const [guidedMode, setGuidedMode] = useState(false);

  // ── Cross-flow identity: read what /qr/[slug] or a prior session stored ───
  const [storedCustomer] = useState<{
    phone: string; name: string; customerId?: string; displayPhone?: string;
  } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(`foocci-customer-${slug}`);
      return raw
        ? (JSON.parse(raw) as { phone: string; name: string; customerId?: string; displayPhone?: string })
        : null;
    } catch { return null; }
  });

  // A waToken-resolved SSR identity must never be shadowed by a stale anonymous
  // (or different-customer) identity left in sessionStorage from a prior visit.
  // Only trust the stored identity when there is no SSR phone, or when the stored
  // phone resolves to the same number (±9th digit / formatting) as the SSR phone.
  const trustedStored = (() => {
    if (!storedCustomer) return null;
    if (!knownCustomerPhone) return storedCustomer;
    if (!storedCustomer.phone) return null;
    const ssr = new Set(phoneCandidates(knownCustomerPhone));
    const sameNumber = phoneCandidates(storedCustomer.phone).some((c) => ssr.has(c));
    return sameNumber ? storedCustomer : null;
  })();

  // Effective phone: from server (WhatsApp link) or from session-stored identify response
  const effectiveCustomerPhone = knownCustomerPhone ?? trustedStored?.phone ?? null;
  // Effective customerId: from server prop or from session-stored identify response
  const effectiveCustomerId = knownCustomerId ?? trustedStored?.customerId ?? undefined;

  // Proof-of-phone token for the gated "área do cliente" endpoints. From the SSR prop
  // (validated waToken) or, when the SSR couldn't resolve it, the waToken still in the
  // URL. Without it, profile/address/coupons reveal nothing — so the returning
  // WhatsApp customer (who has it) keeps the full experience; a bare-web visitor who
  // only typed a phone does not silently inherit a stranger's saved data.
  const [authToken, setAuthToken] = useState<string | null>(pedidoToken ?? null);
  useEffect(() => {
    if (authToken || typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("waToken");
    if (t) setAuthToken(t);
  }, [authToken]);
  const authTokenHeaders: Record<string, string> = authToken ? { "x-pedido-token": authToken } : {};

  // customerName declared early so enterBrowsing / handlePhoneIdentified can reference its setter
  const [customerName, setCustomerName] = useState(
    knownCustomerName?.trim().split(/\s+/)[0] ?? trustedStored?.name ?? "",
  );

  // ── Display phone for identity strip ──────────────────────────────
  const [identifiedPhone, setIdentifiedPhone] = useState<string | null>(
    knownCustomerPhone
      ? formatDisplayPhone(knownCustomerPhone)
      : (trustedStored?.displayPhone ?? null),
  );

  // ── Entry / identification ─────────────────────────────────────────
  // "wa-validating": waToken present in URL but server couldn't resolve it — show
  //                  loading state while client validates the token via API.
  const [entryPhase, setEntryPhase] = useState<"identifying" | "wa-validating" | "browsing">(() => {
    if (typeof window === "undefined") return "browsing";
    if (sessionStorage.getItem(`foocci-entry-${slug}`)) return "browsing";
    if (knownCustomerPhone) return "browsing";
    if (storedCustomer) return "browsing";
    // waToken in URL but server failed — validate client-side before showing phone prompt
    if (new URLSearchParams(window.location.search).has("waToken")) return "wa-validating";
    return "identifying";
  });
  const [identifiedName, setIdentifiedName] = useState<string | null>(
    knownCustomerName ?? trustedStored?.name ?? null,
  );
  // True when the customer arrived via a WhatsApp link (src=whatsapp in URL).
  // Used to personalise the greeting and skip re-identification prompts.
  const [isWaEntry] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("src") === "whatsapp",
  );

  function enterBrowsing(name?: string | null) {
    sessionStorage.setItem(`foocci-entry-${slug}`, "1");
    if (name) { setIdentifiedName(name); setCustomerName(name); }
    setEntryPhase("browsing");
  }

  // customerId state updated when PhoneEntryCard resolves identity client-side
  const [sessionCustomerId, setSessionCustomerId] = useState<string | undefined>(undefined);
  const resolvedCustomerId = effectiveCustomerId ?? sessionCustomerId;

  function handlePhoneIdentified(name: string | null, customerId?: string, displayPhone?: string) {
    if (customerId) setSessionCustomerId(customerId);
    if (displayPhone) setIdentifiedPhone(displayPhone);
    enterBrowsing(name);
  }

  function handleResetIdentity() {
    try { sessionStorage.removeItem(`foocci-customer-${slug}`); } catch { /* ignore */ }
    try { sessionStorage.removeItem(`foocci-entry-${slug}`); } catch { /* ignore */ }
    setIdentifiedName(null);
    setCustomerName("");
    setIdentifiedPhone(null);
    setSessionCustomerId(undefined);
    setEntryPhase("identifying");
  }

  // ── Persist SSR-resolved WhatsApp identity to sessionStorage ────────────────
  // When knownCustomerPhone is set by the server (from waToken), enterBrowsing()
  // is never called, so foocci-entry-{slug} and foocci-customer-{slug} are never
  // written.  This effect fills that gap so same-tab navigation without the token
  // in the URL correctly skips the phone prompt.
  useEffect(() => {
    if (entryPhase !== "browsing" || !knownCustomerPhone) return;
    try {
      sessionStorage.setItem(`foocci-entry-${slug}`, "1");
      // Always overwrite — SSR-confirmed identity must upgrade any stale anonymous entry
      // from a prior visit so the phone prompt is skipped and auto-identify fires correctly.
      const entry: Record<string, string | undefined> = {
        phone:        knownCustomerPhone,
        name:         knownCustomerName ?? "",
        displayPhone: formatDisplayPhone(knownCustomerPhone),
      };
      if (knownCustomerId) entry.customerId = knownCustomerId;
      sessionStorage.setItem(`foocci-customer-${slug}`, JSON.stringify(entry));
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPhase]);

  // ── Client-side waToken validation (fallback when server couldn't resolve) ───
  // Fires when entryPhase is "wa-validating": reads the waToken from the URL,
  // hits the whatsapp-session endpoint, and either enters browsing with the
  // resolved identity or falls back to the normal phone-entry prompt.
  useEffect(() => {
    if (entryPhase !== "wa-validating") return;
    const token = new URLSearchParams(window.location.search).get("waToken") ?? "";
    if (!token) { setEntryPhase("identifying"); return; }

    let cancelled = false;
    fetch(`/api/pedido/${slug}/whatsapp-session?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok: boolean; phone?: string; name?: string; customerId?: string } | null) => {
        if (cancelled) return;
        if (data?.ok && data.phone) {
          if (data.customerId) setSessionCustomerId(data.customerId);
          const firstName = data.name ?? null;
          if (firstName) { setCustomerName(firstName); setIdentifiedName(firstName); }
          const displayPh = formatDisplayPhone(data.phone);
          setIdentifiedPhone(displayPh);
          try {
            sessionStorage.setItem(`foocci-customer-${slug}`, JSON.stringify({
              phone: data.phone, name: firstName ?? "", customerId: data.customerId, displayPhone: displayPh,
            }));
          } catch { /* ignore */ }
          sessionStorage.setItem(`foocci-entry-${slug}`, "1");
          setEntryPhase("browsing");
        } else {
          setEntryPhase("identifying");
        }
      })
      .catch(() => { if (!cancelled) setEntryPhase("identifying"); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPhase, slug]);

  // ── Auto-identify via known WhatsApp phone ────────────────────────
  // When knownCustomerPhone is set by the server (from waToken) but no customerId
  // was resolved (customer wasn't in the DB at page-render time), silently call
  // the identify API to create/find the customer and store the ID for checkout.
  useEffect(() => {
    if (!effectiveCustomerPhone) return;     // no phone context
    if (resolvedCustomerId)       return;     // already have an ID
    if (entryPhase !== "browsing") return;   // only run after phone-entry resolved/skipped
    let cancelled = false;

    fetch(`/api/qr/${slug}/identify`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        phone: effectiveCustomerPhone,
        ...(customerName?.trim() ? { name: customerName.trim() } : {}),
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: { found?: boolean; name?: string; customerId?: string; normalizedPhone?: string } | null) => {
        if (cancelled || !data) return;
        if (data.customerId) setSessionCustomerId(data.customerId);
        if (data.name && !customerName) { setCustomerName(data.name); setIdentifiedName(data.name); }
        if (data.normalizedPhone || effectiveCustomerPhone) {
          const phone = data.normalizedPhone ?? effectiveCustomerPhone ?? "";
          try {
            sessionStorage.setItem(`foocci-customer-${slug}`, JSON.stringify({
              phone, name: data.name ?? customerName ?? "", customerId: data.customerId, displayPhone: identifiedPhone,
            }));
          } catch { /* ignore */ }
        }
      })
      .catch(() => { /* silent — identification is best-effort */ });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, effectiveCustomerPhone, entryPhase]);

  // ── Cart draft sync (Phase 1 abandoned-cart capture) ─────────────────────
  // Debounced, fire-and-forget. Persists an identified customer's cart to
  // OrderDraft so Phase 2/3 can detect abandonment and (eventually) recover it.
  // Never blocks the UI; failures are silently dropped.
  const draftSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (entryPhase !== "browsing")                        return;
    if (!resolvedCustomerId && !effectiveCustomerPhone)   return;
    if (cart.length === 0)                                return;

    if (draftSyncTimerRef.current) clearTimeout(draftSyncTimerRef.current);
    draftSyncTimerRef.current = setTimeout(() => {
      const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
      void fetch(`/api/pedido/${slug}/draft`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          customerId: resolvedCustomerId,
          phone:      effectiveCustomerPhone,
          items: cart.map((i) => ({
            menuItemId: i.baseItemId,
            quantity:   i.qty,
            unitPrice:  i.price,
            notes:      i.notes,
          })),
          subtotal,
          deliveryFee:     0,
          fulfillmentType: "DELIVERY",
        }),
      })
        .then((r) => r.json())
        .then((res: { ok?: boolean; draftId?: string }) => {
          if (res.ok && res.draftId) {
            try { sessionStorage.setItem(`foocci-draft-${slug}`, res.draftId); } catch { /* ignore */ }
          }
        })
        .catch(() => {});
    }, 1200);

    return () => {
      if (draftSyncTimerRef.current) clearTimeout(draftSyncTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, entryPhase, resolvedCustomerId, effectiveCustomerPhone]);

  // ── Exit signal: flush cart to draft immediately on page hide ────────────
  // Fires sendBeacon so the server receives the latest cart snapshot even if
  // the user closes the tab before the 1200 ms debounce fires.
  useEffect(() => {
    const flush = () => {
      if (entryPhase !== "browsing")                      return;
      if (!resolvedCustomerId && !effectiveCustomerPhone) return;
      if (cart.length === 0)                              return;
      const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const payload  = JSON.stringify({
        customerId: resolvedCustomerId,
        phone:      effectiveCustomerPhone,
        items: cart.map((i) => ({
          menuItemId: i.baseItemId,
          quantity:   i.qty,
          unitPrice:  i.price,
          notes:      i.notes,
        })),
        subtotal,
        deliveryFee:     0,
        fulfillmentType: "DELIVERY",
      });
      try {
        navigator.sendBeacon(
          `/api/pedido/${slug}/draft`,
          new Blob([payload], { type: "application/json" }),
        );
      } catch { /* sendBeacon unavailable — silent fail */ }
    };

    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, entryPhase, resolvedCustomerId, effectiveCustomerPhone, slug]);

  // ── Stage / flow ──────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("BROWSE");
  const ACTIVE_ORDER_KEY = `foocci_active_order_${slug}`;

  // ── AI permission state ───────────────────────────────────────────
  // idle            → timer running, prompt not yet shown
  // pending         → passive permission prompt visible (during browsing)
  // consultive      → user accepted — AI may suggest
  // silent          → user declined — AI stays quiet until cooldown
  type AIPermState = "idle" | "pending" | "consultive" | "silent";
  const [aiPermState, setAiPermState] = useState<AIPermState>("idle");
  const silentUntilRef    = useRef<number>(0);     // epoch ms when silence expires
  // Read from sessionStorage so decline/shown persists across soft-reloads within the same session.
  const permPromptCountRef = useRef<number>(
    typeof window !== "undefined" && !!sessionStorage.getItem(`foocci-cta-seen-${slug}`) ? 1 : 0
  );
  // (contextChosenRef removed — qualification suppression handled by options contract)
  const guidedStepRef     = useRef<"size" | "starters" | "main" | "drinks" | "dessert" | "done">("size");
  // Type of upsell pending at checkout ("drink" | "dessert")
  const checkoutPendingRef     = useRef(false);
  // Stable ref so sendText can call proceedToCheckout without being in its deps
  const proceedToCheckoutRef   = useRef<() => void>(() => {});

  // ── Upsell engine ─────────────────────────────────────────────────
  // offeredDrink / offeredDessert: set to true once that phase has been
  //   triggered (regardless of whether the customer accepted or skipped).
  // lastUpsellCategory: the phase currently awaiting the customer's decision
  //   (non-null while the suggestion is "live"); cleared once the phase resolves.
  // Persisted to localStorage so a page refresh doesn't re-trigger the same offer.
  type UpsellState = { offeredDrink: boolean; offeredDessert: boolean; lastUpsellCategory: "drink" | "dessert" | null };
  const UPSELL_KEY = `foocci-upsell-${slug}`;
  const [upsellState, setUpsellStateRaw] = useState<UpsellState>(() => {
    if (typeof window === "undefined") return { offeredDrink: false, offeredDessert: false, lastUpsellCategory: null };
    try {
      const raw = localStorage.getItem(UPSELL_KEY);
      if (raw) return JSON.parse(raw) as UpsellState;
    } catch { /* ignore */ }
    return { offeredDrink: false, offeredDessert: false, lastUpsellCategory: null };
  });
  function setUpsellState(updater: UpsellState | ((prev: UpsellState) => UpsellState)) {
    setUpsellStateRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { localStorage.setItem(UPSELL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // ── Checkout data ─────────────────────────────────────────────────
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup" | null>(null);
  const [address, setAddress] = useState<Address>({
    cep:            knownDefaultAddress?.cep          ?? "",
    street:         knownDefaultAddress?.street        ?? "",
    number:         knownDefaultAddress?.number        ?? "",
    neighborhood:   knownDefaultAddress?.neighborhood  ?? "",
    city:           knownDefaultAddress?.city          ?? "",
    state:          knownDefaultAddress?.state         ?? "",
    complement:     knownDefaultAddress?.complement    ?? "",
    referencePoint: "",
  });
  const [cepInputValue,  setCepInputValue]  = useState("");
  const [cepLoading,     setCepLoading]     = useState(false);
  const [cepError,       setCepError]       = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [paymentMethodSub, setPaymentMethodSub] = useState<PaymentMethodSub | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  // ── Troco (dinheiro) ──────────────────────────────────────────
  // changeFor = a cédula que o cliente vai usar (ex.: R$100). null = valor exato.
  // cashPanelOpen abre o passo "precisa de troco?" ao escolher Dinheiro; o valor
  // digitado fica em cashChangeInput até ser confirmado.
  const [changeFor,      setChangeFor]      = useState<number | null>(null);
  const [cashPanelOpen,  setCashPanelOpen]  = useState(false);
  const [cashChangeInput, setCashChangeInput] = useState("");

  // ── Coupon state ──────────────────────────────────────────────
  const [appliedCoupon, setAppliedCoupon] = useState<{
    promotionId: string; couponCode: string; discountAmount: number;
    discountType: string; name: string;
    /** Set when the applied discount comes from a wallet coupon (iFood-style). */
    customerCouponId?: string;
  } | null>(null);
  const [couponError,   setCouponError]   = useState<string | null>(null);
  // Wallet coupons (earned via CRM campaigns), redeemable in the cart.
  const [walletCoupons, setWalletCoupons] = useState<Array<{ id: string; label: string; discountType: string; discountValue: number; isReward?: boolean; expiresAt: string | null }>>([]);
  const [walletOpen,    setWalletOpen]    = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [pixCopyPaste,    setPixCopyPaste]    = useState<string | null>(null);
  const [pixQrCodeBase64, setPixQrCodeBase64] = useState<string | null>(null);
  const [pixCopied,       setPixCopied]       = useState(false);
  // ── Cartão online (SumUp checkout transparente) ───────────────
  // onlineMethod distingue "Pagar agora" via Pix vs Cartão. cardCheckout guarda
  // o que o widget do SumUp precisa (checkoutId + params). cardStatus controla a
  // tela do cartão (formulário → verificando → aguardando/erro).
  const [onlineMethod, setOnlineMethod] = useState<"pix" | "card">("pix");
  const [cardCheckout, setCardCheckout] = useState<
    | { provider: "mercadopago"; publicKey: string; amount?: number }
    | { provider: "sumup"; checkoutId: string; currency?: string; amount?: string; merchantCode?: string; locale?: string; maxInstallments?: number }
    | null
  >(null);
  const [cardStatus, setCardStatus] = useState<"form" | "verifying" | "pending" | "failed">("form");
  const [orderTrackingData, setOrderTrackingData]   = useState<OrderTrackingData | null>(null);
  const [activeOrderId,     setActiveOrderId]       = useState<string | null>(null);
  const [showActiveBanner,  setShowActiveBanner]    = useState(false);
  const trackingPollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const categoryBarRef     = useRef<HTMLDivElement>(null);
  const mobileProductsRef  = useRef<HTMLDivElement>(null);
  const desktopProductsRef = useRef<HTMLDivElement>(null);
  const [categoryFadeEnd, setCategoryFadeEnd] = useState(true);

  // Switching category always starts at the FIRST product — reset the product
  // scroll to the top/left whenever the selected category changes.
  useEffect(() => {
    if (mobileProductsRef.current)  mobileProductsRef.current.scrollLeft = 0;
    if (desktopProductsRef.current) desktopProductsRef.current.scrollTop = 0;
  }, [selectedCategoryId]);

  // ── Delivery-quote state (distance mode) ──────────────────────────────────────
  const [quoteDeliveryFee, setQuoteDeliveryFee] = useState<number | null>(null);
  const [quoteStatus,      setQuoteStatus]      = useState<string | null>(null);
  const [quoteError,       setQuoteError]       = useState<string | null>(null);
  const [quoteLoading,     setQuoteLoading]     = useState(false);
  // Derived: prefer the geocoded fee over the page-load floor fee
  const resolvedDeliveryFee = quoteDeliveryFee ?? deliveryFee;

  // Clear coupon when delivery method changes (channel compatibility may differ)
  useEffect(() => {
    setAppliedCoupon(null);
    setCouponError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryMethod]);

  // ── Poll payment status while in PAYMENT_LINK / CARD_FORM stage ───────────────
  // For card, this is the backstop: the SumUp webhook confirms the order async,
  // so even if the inline /card/confirm misses, polling advances to DONE.
  useEffect(() => {
    if ((stage !== "PAYMENT_LINK" && stage !== "CARD_FORM") || !orderId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pedido/payment-status?orderId=${orderId}`);
        const data = await res.json();
        if (data.paymentStatus === "PAID") {
          clearInterval(interval);
          setStage("DONE");
        } else if (data.paymentStatus === "EXPIRED") {
          clearInterval(interval);
          setPaymentUrl(null);
          setPixCopyPaste(null);
          setPixQrCodeBase64(null);
        }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(interval);
  }, [stage, orderId]);

  // ── Generate Pix QR client-side when no image from MP API ────────────
  // Handles the refresh path where only pixCopyPaste is restored (no base64 from MP).
  useEffect(() => {
    if (!pixCopyPaste || pixQrCodeBase64) return;
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(pixCopyPaste, { width: 176, margin: 1 })
        .then((dataUrl) => setPixQrCodeBase64(dataUrl))
        .catch(() => {});
    });
  }, [pixCopyPaste, pixQrCodeBase64]);

  // ── Mount the card widget while in CARD_FORM (Mercado Pago OR SumUp) ──────────
  // Loads the operator SDK, mounts its card UI, and completes the charge. The card
  // is collected inside the operator's iframe — it never touches us. The
  // payment-status poll above is the async backstop (webhook).
  useEffect(() => {
    if (stage !== "CARD_FORM" || !cardCheckout) return;
    let cancelled = false;
    let controller: { unmount?: () => void } | null = null;
    setCardStatus("form");

    // Ensure the SDK script is present, then wait for its global before calling back.
    const ensureSdk = (src: string, globalName: string, onReady: () => void) => {
      const w = window as unknown as Record<string, unknown>;
      if (!document.querySelector(`script[src="${src}"]`)) {
        const s = document.createElement("script");
        s.src = src; s.async = true;
        document.body.appendChild(s);
      }
      if (w[globalName]) { onReady(); return; }
      let tries = 0;
      const t = setInterval(() => {
        if (cancelled) { clearInterval(t); return; }
        if (w[globalName]) { clearInterval(t); onReady(); }
        else if (++tries > 40) { clearInterval(t); setCardStatus("failed"); } // ~10s
      }, 250);
    };

    // ── Mercado Pago — token model (Card Payment Brick) ──────────────
    if (cardCheckout.provider === "mercadopago") {
      const mp = cardCheckout;
      const mountMp = () => {
        const MP = (window as unknown as {
          MercadoPago?: new (k: string, o?: unknown) => { bricks: () => { create: (t: string, id: string, s: unknown) => Promise<{ unmount?: () => void }> } };
        }).MercadoPago;
        if (!MP || cancelled) return;
        try {
          const inst = new MP(mp.publicKey, { locale: "pt-BR" });
          inst.bricks().create("cardPayment", "mp-card-container", {
            initialization: { amount: mp.amount ?? 0 },
            callbacks: {
              onReady: () => {},
              onError: () => { if (!cancelled) setCardStatus("failed"); },
              onSubmit: (arg: { formData?: Record<string, unknown> } & Record<string, unknown>) => {
                const fd = (arg.formData ?? arg) as Record<string, unknown>;
                setCardStatus("verifying");
                return fetch(`/api/pedido/${slug}/card/charge`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    orderId,
                    token:           fd.token,
                    installments:    fd.installments,
                    paymentMethodId: fd.payment_method_id,
                    issuerId:        fd.issuer_id,
                    payerEmail:      (fd.payer as { email?: string } | undefined)?.email,
                  }),
                })
                  .then((r) => r.json().catch(() => ({})))
                  .then((data) => {
                    if (cancelled) return;
                    if (data.status === "approved") setStage("DONE");
                    else if (data.status === "pending") setCardStatus("pending");
                    else setCardStatus("failed");
                  })
                  .catch(() => { if (!cancelled) setCardStatus("failed"); });
              },
            },
          }).then((c) => { controller = c; }).catch(() => { if (!cancelled) setCardStatus("failed"); });
        } catch { if (!cancelled) setCardStatus("failed"); }
      };
      ensureSdk("https://sdk.mercadopago.com/js/v2", "MercadoPago", mountMp);
      return () => { cancelled = true; try { controller?.unmount?.(); } catch { /* ignore */ } };
    }

    // ── SumUp — checkout model (card widget) ─────────────────────────
    const su = cardCheckout;
    const verifyPaid = async (): Promise<boolean> => {
      if (!orderId) return false;
      try {
        const res = await fetch(`/api/pedido/${slug}/card/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json().catch(() => ({}));
        return data.status === "paid";
      } catch { return false; }
    };
    const mountSumUp = () => {
      const SumUpCard = (window as unknown as {
        SumUpCard?: { mount: (o: Record<string, unknown>) => { unmount?: () => void } };
      }).SumUpCard;
      if (!SumUpCard || cancelled) return;
      const maxInst = su.maxInstallments ?? 1;
      controller = SumUpCard.mount({
        id:         "sumup-card-container",
        checkoutId: su.checkoutId,
        locale:     su.locale ?? "pt-BR",
        currency:   su.currency ?? "BRL",
        ...(su.amount ? { amount: su.amount } : {}),
        ...(maxInst > 1 ? { showInstallments: true, installments: maxInst } : {}),
        onResponse: async (type: string) => {
          if (cancelled) return;
          if (type === "success") {
            setCardStatus("verifying");
            let paid = false;
            for (let i = 0; i < 3 && !paid && !cancelled; i++) {
              paid = await verifyPaid();
              if (!paid) await new Promise((r) => setTimeout(r, 1500));
            }
            if (cancelled) return;
            if (paid) { try { controller?.unmount?.(); } catch { /* ignore */ } setStage("DONE"); }
            else setCardStatus("pending");
          } else if (type === "error" || type === "fail") {
            setCardStatus("failed");
          }
        },
      });
    };
    ensureSdk("https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js", "SumUpCard", mountSumUp);
    return () => { cancelled = true; try { controller?.unmount?.(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, cardCheckout, orderId, slug]);

  // ── Category bar: show right-fade hint when more categories are off-screen ──
  useEffect(() => {
    const el = categoryBarRef.current;
    if (!el) return;
    const check = () => setCategoryFadeEnd(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [categories]);

  // ── On mount: check localStorage for an in-progress order ─────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_ORDER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { orderId: string; createdAt: number };
      if (Date.now() - parsed.createdAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(ACTIVE_ORDER_KEY);
        return;
      }

      // Check payment status first: if Pix payment is still pending, restore QR screen.
      // This handles the page-refresh case for the MP Pix flow.
      fetch(`/api/pedido/payment-status?orderId=${parsed.orderId}`)
        .then((r) => r.json())
        .then((payData: { paymentStatus: string }) => {
          if (payData.paymentStatus === "LINK_SENT") {
            // Pending Pix — fetch copy-paste key and restore QR screen
            fetch(`/api/pedido/pix-payment?orderId=${parsed.orderId}`)
              .then((r) => r.json())
              .then((pixData: { pixCopyPaste?: string }) => {
                if (pixData.pixCopyPaste) {
                  setPixCopyPaste(pixData.pixCopyPaste);
                  // pixQrCodeBase64 will be generated by the QR-generation effect above
                  setOrderId(parsed.orderId);
                  setStage("PAYMENT_LINK");
                }
              })
              .catch(() => {});
            return;
          }

          if (payData.paymentStatus === "PAID") {
            // Payment confirmed — go straight to order tracking
            fetch(`/api/pedido/order-status?orderId=${parsed.orderId}`)
              .then((r) => r.json())
              .then((orderData: OrderTrackingData) => {
                setOrderId(parsed.orderId);
                setOrderTrackingData(orderData);
                setStage("DONE");
              })
              .catch(() => {});
            return;
          }

          // All other states (PENDING, PAY_ON_DELIVERY, etc.) → normal active-order banner
          fetch(`/api/pedido/order-status?orderId=${parsed.orderId}`)
            .then((r) => r.json())
            .then((data: OrderTrackingData) => {
              if (!data.isFinal) {
                setActiveOrderId(parsed.orderId);
                setOrderTrackingData(data);
                setShowActiveBanner(true);
              } else {
                localStorage.removeItem(ACTIVE_ORDER_KEY);
              }
            })
            .catch(() => {});
        })
        .catch(() => {
          // payment-status failed — fall back to order-status banner
          fetch(`/api/pedido/order-status?orderId=${parsed.orderId}`)
            .then((r) => r.json())
            .then((data: OrderTrackingData) => {
              if (!data.isFinal) {
                setActiveOrderId(parsed.orderId);
                setOrderTrackingData(data);
                setShowActiveBanner(true);
              } else {
                localStorage.removeItem(ACTIVE_ORDER_KEY);
              }
            })
            .catch(() => {});
        });
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // ── Poll order status while in DONE stage ─────────────────────────
  useEffect(() => {
    if (stage !== "DONE") {
      if (trackingPollRef.current) clearInterval(trackingPollRef.current);
      return;
    }
    const currentId = orderId ?? activeOrderId;
    if (!currentId) return;

    const poll = () => {
      fetch(`/api/pedido/order-status?orderId=${currentId}`)
        .then((r) => r.json())
        .then((data: OrderTrackingData) => {
          setOrderTrackingData(data);
          if (data.isFinal) {
            if (trackingPollRef.current) clearInterval(trackingPollRef.current);
            try { localStorage.removeItem(ACTIVE_ORDER_KEY); } catch { /* ignore */ }
          }
        })
        .catch(() => {});
    };

    poll(); // immediate first fetch
    trackingPollRef.current = setInterval(poll, 12_000);
    return () => {
      if (trackingPollRef.current) clearInterval(trackingPollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, orderId, activeOrderId]);

  // ── Derived ───────────────────────────────────────────────────────
  // activeUpsell: the last offered type (persists after resolution so the
  // backend's resolveSalesPhase() knows not to re-suggest the same type).
  const activeUpsell = useMemo((): "drink" | "dessert" | null => {
    if (upsellState.offeredDessert) return "dessert";
    if (upsellState.offeredDrink)   return "drink";
    return null;
  }, [upsellState]);

  // upsellPending: true while a suggestion is live and awaiting customer response.
  // Controls checkout button appearance — no "Finalizar" language during this window.
  const upsellPending = upsellState.lastUpsellCategory !== null;

  // ── "Pedir de novo" virtual category (W3 — visual menu section, not a chat button) ──
  // Repeatable items (last order + most frequent) for an identified customer, loaded
  // once from the existing repeat-order API. Resolved against the live menu so cards
  // behave exactly like normal products (per-item add; never auto-added).
  // Seed immediately from the SSR repeatOrder payload (already present on first
  // render, same source the banner uses) so the category can show without waiting
  // for the fetch; the fetch then augments it with the fuller list (most frequent).
  const [repeatItemIds, setRepeatItemIds] = useState<string[]>(
    () => (repeatOrder?.items ?? []).map((i) => i.menuItemId).filter((id): id is string => !!id),
  );
  // Full menu-item objects for repeatable items, resolved on the SERVER independently
  // of category visibility (see /services/menu/pedidoMenuItem). Seeded from SSR and
  // augmented by the fetch below, so a repeat item whose home category is hidden from
  // the delivery menu still resolves to a real card instead of vanishing.
  const [repeatPool, setRepeatPool] = useState<MenuItem[]>(() => repeatMenuItemsProp ?? []);
  const repeatFetchedRef = useRef(false);
  useEffect(() => {
    if (!REPEAT_ORDER_UI_ENABLED) return; // standby — no repeat-order fetch
    if (repeatFetchedRef.current || entryPhase !== "browsing") return;
    const cid = resolvedCustomerId;
    const ph  = effectiveCustomerPhone;
    if (!cid && !ph) return; // anonymous → never show "Pedir de novo"
    repeatFetchedRef.current = true;
    const qs = cid ? `customerId=${encodeURIComponent(cid)}` : `phone=${encodeURIComponent(ph!)}`;
    fetch(`/api/pedido/${slug}/repeat-order?${qs}`)
      .then((r) => r.json())
      .then((d: { repeatItems?: Array<{ menuItemId: string }>; repeatMenuItems?: MenuItem[] }) => {
        const ids = (d.repeatItems ?? []).map((i) => i.menuItemId);
        // Merge server-resolved full objects into the pool BEFORE swapping ids, so
        // every id resolves to a card regardless of its home-category visibility.
        if (d.repeatMenuItems && d.repeatMenuItems.length > 0) {
          setRepeatPool((prev) => {
            const merged = new Map(prev.map((i) => [i.id, i]));
            for (const it of d.repeatMenuItems!) merged.set(it.id, it);
            return [...merged.values()];
          });
        }
        if (ids.length > 0) setRepeatItemIds(ids);
        if (process.env.NODE_ENV !== "production") {
          console.info("[repeat-order] fetched", { received: ids.length, pool: d.repeatMenuItems?.length ?? 0, via: cid ? "customerId" : "phone" });
        }
      })
      .catch(() => { /* non-fatal — repeat section just won't appear */ });
  }, [entryPhase, resolvedCustomerId, effectiveCustomerPhone, slug]);

  // Map repeatable ids → MenuItem objects. Lookup pool = the visible menu UNION plus
  // the server-resolved repeat pool (which includes items whose home category is
  // hidden), so the "Comprar novamente" section never silently drops a valid item.
  const repeatMenuItems = useMemo(() => {
    if (repeatItemIds.length === 0) return [];
    const byId = new Map<string, MenuItem>();
    for (const c of categories) for (const i of c.items) byId.set(i.id, i);
    for (const i of repeatPool) byId.set(i.id, i); // server pool wins (visibility-agnostic)
    const mapped = repeatItemIds.map((id) => byId.get(id)).filter((x): x is MenuItem => !!x);
    if (process.env.NODE_ENV !== "production" && repeatItemIds.length > 0 && mapped.length === 0) {
      console.info("[repeat-order] no ids matched the live menu", { ids: repeatItemIds.length, menuItems: byId.size });
    }
    return mapped;
  }, [repeatItemIds, categories, repeatPool]);

  // Categories shown in the UI: prepend the virtual "Pedir de novo" when there is
  // real history. This is what tabs + currentCategoryItems read from.
  const displayCategories = useMemo<MenuCategory[]>(
    () => (REPEAT_ORDER_UI_ENABLED ? (buildDisplayCategories(categories, repeatMenuItems) as MenuCategory[]) : categories),
    [repeatMenuItems, categories],
  );

  const currentCategoryItems = useMemo(
    () => displayCategories.find((c) => c.id === selectedCategoryId)?.items ?? [],
    [displayCategories, selectedCategoryId],
  );

  const selectedCategory = useMemo(
    () => displayCategories.find((c) => c.id === selectedCategoryId) ?? null,
    [displayCategories, selectedCategoryId],
  );

  // ── Tab / salesPhase sync ─────────────────────────────────────────
  // Auto-switch is disabled (interruptNavigation: false) — the AI suggests via
  // text only; the user navigates categories on their own terms.
  useEffect(() => {
    if (!SALES_BEHAVIOR.interruptNavigation) return;
    const phase = upsellState.lastUpsellCategory;
    if (!phase) return;
    const target =
      phase === "drink" ? findBeverageCat(categories) : findDessertCat(categories);
    if (target) setSelectedCategoryId(target.id);
  }, [upsellState.lastUpsellCategory, categories]);

  // ── Auto-scroll ───────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ui]);

  // ── sendText ──────────────────────────────────────────────────────
  // Only called for AI-driven moments: BROWSE (initial greeting, item adds,
  // category intros, upsell suggestions, free-text chat, back-to-menu).
  // Checkout stage transitions use pushAssistantMessage instead — no AI call.
  // Closure reads of deliveryMethod/address/customerName/paymentMode are safe
  // here because sendText is never called in the same React tick as those setters.
  const sendText = useCallback(
    async (
      text: string,
      cartSnap: CartItem[],
      stageSnap: Stage,
      upsellOfferedSnap: "drink" | "dessert" | "extras" | null,
      options?: {
        event?:         "ON_ENTRY" | "ON_MENU_MODE" | "ON_USER_MESSAGE" | "ON_ITEM_ADDED" | "ON_CART_UPDATED" | "ON_IDLE" | "ON_CHECKOUT_STARTED" | "AFTER_CHECKOUT" | "ON_PERMISSION_ACCEPT";
        lastAddedId?:   string;
        silent?:        boolean;
        categoryIntro?: { name: string; description: string };
        displayText?:   string;  // shown in the user bubble; text is still sent to the backend
      },
    ) => {
      const event         = options?.event ?? "ON_USER_MESSAGE";
      const lastAddedId   = options?.lastAddedId;
      const silent        = options?.silent ?? false;
      const categoryIntro = options?.categoryIntro;
      const displayText   = options?.displayText;

      // Plan without the AI Waiter: this function is the only place that talks to the
      // AI, so the whole conversation layer is cut here, before any network. The one
      // AI-mediated funnel transition — "Finalizar pedido" waiting for the upsell
      // turn — degrades to opening the operational checkout directly. Everything else
      // (item added, idle nudge, typed text) is simply dropped: with no Waiter there
      // is nobody to answer, and a fake reply would be the store lying about itself.
      if (!aiIncluded) {
        if (checkoutPendingRef.current) {
          checkoutPendingRef.current = false;
          proceedToCheckoutRef.current();
        }
        return;
      }

      setUi("thinking");
      const trimmed = text.trim();

      if (!silent && trimmed) {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "user" as const, content: displayText ?? trimmed, ts: new Date() },
        ]);
      }

      const newHistory: HistoryEntry[] = trimmed
        ? [...history, { role: "user" as const, content: trimmed }]
        : [...history];

      const addrStr = deliveryMethod === "delivery" ? formatAddress(address) : null;
      const pmStr   = resolvePaymentMethod(paymentMode, paymentMethodSub);

      try {
        const res = await fetch(`/api/pedido/${slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message:        trimmed || " ",
            history,
            cart:           cartSnap,
            stage:          stageSnap,
            upsellOffered:  upsellOfferedSnap,
            deliveryMethod,
            address:        addrStr || null,
            paymentMethod:  pmStr   || null,
            customerName:   customerName || null,
            customerPhone:  effectiveCustomerPhone,
            customerId:     resolvedCustomerId ?? undefined,
            event,
            lastAddedId,
            categoryIntro: categoryIntro ?? null,
            waiterMemory:  Object.keys(waiterMemoryRef.current).length > 0 ? waiterMemoryRef.current : undefined,
            sessionId:     sessionIdRef.current,
            conversationId: convId ?? undefined,
          }),
        });

        const data        = await res.json();
        const reply       = (data?.data?.reply   ?? "") as string;
        const rawCards    = (Array.isArray(data?.data?.cards)   ? data.data.cards   : []) as string[];
        const apiOptions  = (Array.isArray(data?.data?.options) ? data.data.options : []) as WaiterOption[];
        const responseMode = (data?.data?.mode ?? "BROWSE") as string;
        const newPinned   = (data?.data?.pinnedCardId ?? null) as string | null;

        // Persist conversationId returned by server (created on first logged message)
        const returnedConvId = data?.data?.conversationId as string | null | undefined;
        if (returnedConvId && returnedConvId !== convId) {
          setConvId(returnedConvId);
          try { sessionStorage.setItem(`foocci_cid_${slug}`, returnedConvId); } catch { /* ignore */ }
        }

        // Sync human-mode. When an operator owns the Cardápio conversation the
        // server returns aiActive=false and an empty reply — show the human-mode
        // banner instead of an AI bubble; the customer's message already reached
        // the operator in Atendimento.
        if (typeof data?.data?.aiActive === "boolean") {
          applyAiActive(data.data.aiActive);
          if (data.data.aiActive === false) {
            return; // operator owns the chat — finally{} resets the typing state
          }
        }

        if (data?.data?.memoryPatch && typeof data.data.memoryPatch === "object") {
          // Update ref synchronously so the next sendText call (even before re-render)
          // ships the latest memory to the server — prevents stage repeat on rapid clicks.
          // max-stage-wins: checkoutUpsellStage can only advance, never downgrade.
          const patch = data.data.memoryPatch as Partial<WaiterMemory>;
          const mergedStage = maxUpsellStage(
            waiterMemoryRef.current.checkoutUpsellStage,
            patch.checkoutUpsellStage,
          );
          waiterMemoryRef.current = { ...waiterMemoryRef.current, ...patch, checkoutUpsellStage: mergedStage };
          setWaiterMemory(waiterMemoryRef.current);
        }

        // Cards always go to the external carousel — never rendered inline in chat.
        // Buttons are shown alongside cards for INTERVENTION (checkout upsell) mode.
        let hasShownCards = false;
        const allowCards = responseMode !== "CHECKOUT_SUPPORT" && stageSnap === "BROWSE";

        if (allowCards && rawCards.length > 0) {
          const flat = categories.flatMap((c) => c.items);
          const seen = new Set<string>();
          const resolved = rawCards
            .filter((id) => { const first = !seen.has(id); seen.add(id); return first; })
            .map((id) => flat.find((i) => i.id === id))
            .filter((i): i is MenuItem => !!i);

          if (resolved.length > 0) {
            hasShownCards = true;
            setSuggestedProducts(resolved);
            setPinnedCardId(newPinned);
          }
        }

        // Clear stale grid when this response carries no valid cards.
        if (allowCards && !hasShownCards) {
          setSuggestedProducts([]);
          setPinnedCardId(null);
        }

        // Cards and buttons are always shown together when both are present.
        const finalOptions: WaiterOption[] | undefined = apiOptions.length > 0 ? apiOptions : undefined;

        // Checkout auto-advance: if checkout was pending and Waiter returned CHECKOUT_SUPPORT
        // (no more upsells to show), advance to the operational checkout flow now.
        // When INTERVENTION+cards is returned instead, stay in BROWSE so the user reviews cards.
        if (checkoutPendingRef.current && responseMode === "CHECKOUT_SUPPORT") {
          checkoutPendingRef.current = false;
          proceedToCheckoutRef.current();
          return; // skip message push — proceedToCheckout shows its own prompt
        }
        // Non-CHECKOUT_SUPPORT response (e.g. INTERVENTION upsell): reset flag so the
        // next "Finalizar pedido" click fires normally and advances to the next stage.
        checkoutPendingRef.current = false;

        if (reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: "assistant" as const,
              content: reply,
              ts: new Date(),
              options: finalOptions,
            },
          ]);
        }
        if (reply) {
          setHistory([...newHistory, { role: "assistant" as const, content: reply }]);
        }
      } catch {
        // "Finalizar pedido" is the ONE funnel transition that goes through the AI
        // (ON_CHECKOUT_STARTED → wait for CHECKOUT_SUPPORT). When that call fails —
        // AI down, or the restaurant's plan simply doesn't include the Waiter — the
        // money path must not die with it: skip the upsell and open the operational
        // checkout directly. Everything after this point is click-driven and AI-free.
        //
        // Found on 2026-08-03 while proving the plano-de-entrada store: with the AI
        // blocked, the click showed "Ops!" AND left checkoutPendingRef stuck true, so
        // the rapid-click guard silently killed the button until a full page reload.
        if (checkoutPendingRef.current) {
          checkoutPendingRef.current = false;
          proceedToCheckoutRef.current();
          return;
        }
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant" as const, content: "Ops! Tivemos um problema. Tente novamente.", ts: new Date() },
        ]);
      } finally {
        setUi("idle");
      }
    },
    [slug, history, deliveryMethod, address, customerName, paymentMode, paymentMethodSub, effectiveCustomerPhone, resolvedCustomerId, categories, applyAiActive, aiIncluded],
  );

  // ── Deterministic message helpers ─────────────────────────────────
  // Push messages into the chat without calling the AI.
  // Used at checkout stages where responses must not vary.

  const pushAssistantMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "assistant" as const, content: text, ts: new Date() },
    ]);
  }, []);

  const pushUserMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user" as const, content: text, ts: new Date() },
    ]);
  }, []);

  // ── Repeat order (W3): hydrate the cart from a validated last-order payload ──
  // Adds only the validated/available items (current prices), never auto-finalizes,
  // and merges into any existing cart so the customer can still edit normally.
  const hydrateRepeatCart = useCallback((data: RepeatOrderPayload) => {
    if (!data.items.length) {
      pushAssistantMessage("Seu último pedido não está disponível hoje, mas posso te sugerir algo parecido 😊");
      return;
    }
    const repeatItems: CartItem[] = data.items.map((it) => ({
      id:         it.variantId ? `${it.menuItemId}_${it.variantId}` : it.menuItemId,
      baseItemId: it.menuItemId,
      name:       it.name,
      price:      it.price,
      qty:        it.qty,
      ...(it.variantId ? { variantId: it.variantId, variantName: it.variantName ?? undefined } : {}),
    }));
    setCart((prev) => {
      const map = new Map(prev.map((c) => [c.id, { ...c }]));
      for (const it of repeatItems) {
        const ex = map.get(it.id);
        if (ex) map.set(it.id, { ...ex, qty: ex.qty + it.qty });
        else    map.set(it.id, it);
      }
      return Array.from(map.values());
    });
    fireGtag("repeat_order", { items: repeatItems.length, source: "repeat_order" });
    pushAssistantMessage(
      data.unavailableCount > 0
        ? "Alguns itens do último pedido não estão disponíveis hoje, então adicionei apenas os disponíveis. Confira antes de finalizar 😊"
        : "Pronto, coloquei seu último pedido no carrinho. Confira antes de finalizar 😊",
    );
    if (data.priceChanged) {
      pushAssistantMessage("Os valores podem ter mudado desde seu último pedido.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushAssistantMessage]);

  // ── Welcome message (fires once, first time user enters browsing) ────────
  const greetedRef = useRef(
    typeof window !== "undefined" && !!sessionStorage.getItem(`foocci-entry-${slug}`)
  );
  useEffect(() => {
    if (entryPhase !== "browsing" || greetedRef.current) return;
    greetedRef.current = true;
    fireGtag("view_menu", { restaurant: restaurantName, ...getUtm() });
    const name = identifiedName;
    // Without the Waiter, the greeting must not offer help nobody will give
    // ("eu te ajudo a escolher" with no AI behind it is the store lying about
    // itself) and must not show "Quero uma sugestão". "Pedir novamente" stays —
    // it opens a menu category, no AI involved.
    const canRepeat = Boolean(repeatOrder && repeatOrder.items.length > 0);
    const greeting = aiIncluded
      ? (name
          ? `Oi, ${name}! 👋\nFica à vontade pra olhar o cardápio. Se quiser, eu te ajudo a escolher.`
          : `Oi! 👋\nFica à vontade pra olhar o cardápio. Se quiser, eu te ajudo a escolher.`)
      : (name
          ? `Oi, ${name}! 👋\nFica à vontade pra olhar o cardápio. É só tocar no prato para adicionar.`
          : `Oi! 👋\nFica à vontade pra olhar o cardápio. É só tocar no prato para adicionar.`);
    const openingOptions = aiIncluded
      ? buildOpeningOptions({ canRepeat })
      : buildOpeningOptions({ canRepeat }).filter((o) => o.value !== SUGGESTION_OPTION_VALUE);
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant" as const,
        content: greeting,
        ts: new Date(),
        ...(openingOptions.length > 0 ? { options: openingOptions } : {}),
      },
    ]);
    // Fire ON_ENTRY to the server for Atendimento logging + early conversationId
    // init. Non-fatal — ordering continues if this fails.
    const sid = sessionIdRef.current;
    if (sid && aiIncluded) {
      fetch(`/api/pedido/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "", event: "ON_ENTRY", history: [], cart: [],
          sessionId: sid,
          ...(resolvedCustomerId    ? { customerId:    resolvedCustomerId }    : {}),
          ...(effectiveCustomerPhone ? { customerPhone: effectiveCustomerPhone } : {}),
          ...(customerName           ? { customerName:  customerName }           : {}),
        }),
      })
        .then((r) => r.json())
        .then((json: { data?: { conversationId?: string | null; aiActive?: boolean } }) => {
          const cid = json?.data?.conversationId;
          if (cid) setConvId(cid);
          if (typeof json?.data?.aiActive === "boolean") applyAiActive(json.data.aiActive);
        })
        .catch(() => { /* non-fatal */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPhase]);

  // ── Idle timer — fires ON_IDLE after 45 s of inactivity during BROWSE ─────
  // sendText/cart/activeUpsell are intentionally omitted from deps: the effect
  // must NOT restart on cart changes (that would reset the timer on every item add).
  // lastActivityRef is updated imperatively from handleSubmit / handleItemAdd.
  useEffect(() => {
    if (entryPhase !== "browsing" || stage !== "BROWSE") {
      idleFiredRef.current = false;
      return;
    }
    const IDLE_MS = 45_000;
    const id = setInterval(() => {
      if (idleFiredRef.current) return;
      if (!SALES_BEHAVIOR.suggestOnIdle) return;
      if (Date.now() - lastActivityRef.current >= IDLE_MS) {
        idleFiredRef.current = true;
        sendText("", cart, "BROWSE", activeUpsell, { event: "ON_IDLE", silent: true });
      }
    }, 5_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPhase, stage]);

  // ── Passive permission prompt ─────────────────────────────────────
  // After PASSIVE_TRIGGER_MS of inactivity, gently ask permission to suggest.
  // Fires only for passive users (cart ≤ 1 item, no recent rejection, BROWSE).
  // Never fires while the suggestion grid is already showing (user is reviewing cards).
  useEffect(() => {
    if (!SALES_BEHAVIOR.passivePermissionPrompt) return;
    if (entryPhase !== "browsing" || stage !== "BROWSE") return;
    if (aiPermState !== "idle") return;
    if (suggestedProducts.length > 0) return;
    if (guidedMode) return;

    const id = setInterval(() => {
      if (aiPermState !== "idle") return;
      if (permPromptCountRef.current >= 1) return; // max 1 prompt per session
      if (Date.now() < silentUntilRef.current) return;
      if (cart.reduce((s, i) => s + i.qty, 0) > 1) return;
      if (suggestedProducts.length > 0) return; // double-check inside interval
      if (guidedMode) return;
      if (Date.now() - lastActivityRef.current < PASSIVE_TRIGGER_MS) return;
      permPromptCountRef.current += 1;
      sessionStorage.setItem(`foocci-cta-seen-${slug}`, "1");
      setAiPermState("pending");
    }, 2_000);
    return () => clearInterval(id);
  // aiPermState, cart, suggestedProducts and guidedMode intentionally included
  }, [entryPhase, stage, aiPermState, cart, suggestedProducts, guidedMode]);

  // ── First-item trigger ────────────────────────────────────────────
  // When the cart reaches exactly 1 item and the user is passive (idle),
  // start a 3 s countdown then show the permission prompt.
  // Skipped when the suggestion grid is already active — no double-prompting.
  useEffect(() => {
    if (!SALES_BEHAVIOR.passivePermissionPrompt) return;
    if (
      cart.length !== 1 ||
      aiPermState !== "idle" ||
      stage !== "BROWSE" ||
      entryPhase !== "browsing" ||
      permPromptCountRef.current >= 1 ||
      suggestedProducts.length > 0 ||
      guidedMode
    ) return;
    const t = setTimeout(() => {
      permPromptCountRef.current += 1;
      sessionStorage.setItem(`foocci-cta-seen-${slug}`, "1");
      setAiPermState("pending");
    }, 3_000);
    return () => clearTimeout(t);
  }, [cart.length, aiPermState, stage, entryPhase, suggestedProducts.length, guidedMode]);

  // ── Reset consultive after a suggestion is shown ("already suggested") ──
  // Once the product grid shows AI-picked cards in consultive mode, the job
  // is done — return to idle so the system goes back to observing.
  // Skip during guided flow: guided mode manages aiPermState itself.
  useEffect(() => {
    if (guidedMode) return;
    if (suggestedProducts.length > 0 && aiPermState === "consultive") {
      setAiPermState("idle");
    }
  }, [suggestedProducts.length, aiPermState, guidedMode]);

  // Clear grid suggestions when cart is emptied or customer leaves BROWSE
  useEffect(() => {
    if (cart.length === 0 || stage !== "BROWSE") setSuggestedProducts([]);
  }, [cart.length, stage]);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleItemAdd = useCallback(
    (item: MenuItem, fromUpsell = false) => {
      const effectivePrice = item.promotion?.promotionalPrice ?? item.price;
      // Upsell adds use a distinct cart-line id so they never merge with a
      // normally-browsed line of the same product — keeps attribution clean and
      // lets repeated upsell adds of the same item merge with each other.
      const cartId   = fromUpsell ? `${item.id}__upsell` : item.id;
      const existing = cart.find((c) => c.id === cartId);
      const newCart = existing
        ? cart.map((c) => c.id === cartId ? { ...c, qty: c.qty + 1 } : c)
        : [...cart, { id: cartId, baseItemId: item.id, name: item.name, price: effectivePrice, qty: 1, ...(fromUpsell ? { isUpsell: true } : {}) }];
      setCart(newCart);
      fireGtag("add_to_cart", { item_name: item.name, value: effectivePrice, currency: "BRL" });
      lastActivityRef.current = Date.now();
      idleFiredRef.current    = false;
      if (stage === "BROWSE") {
        sendText("", newCart, stage, activeUpsell, { event: "ON_ITEM_ADDED", lastAddedId: item.id, silent: true });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, stage, activeUpsell, sendText, ga4Id],
  );

  const handleVariantAdd = useCallback(
    (item: MenuItem, variant: MenuItemVariant, fromUpsell = false) => {
      const cartId   = `${item.id}_${variant.id}${fromUpsell ? "__upsell" : ""}`;
      const cartName = `${item.name} — ${variant.name}`;
      const existing = cart.find((c) => c.id === cartId);
      const newCart  = existing
        ? cart.map((c) => c.id === cartId ? { ...c, qty: c.qty + 1 } : c)
        : [...cart, {
            id: cartId, baseItemId: item.id, name: cartName,
            price: variant.price, qty: 1,
            variantId: variant.id, variantName: variant.name,
            ...(fromUpsell ? { isUpsell: true } : {}),
          }];
      setCart(newCart);
      setSelectedProduct(null);
      fireGtag("add_to_cart", { item_name: `${item.name} — ${variant.name}`, value: variant.price, currency: "BRL" });
      lastActivityRef.current = Date.now();
      idleFiredRef.current    = false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, ga4Id],
  );

  const handleCustomizedAdd = useCallback(
    (item: MenuItem, notes: string, selectedOptions: SelectedOption[], selectedExtras: SelectedExtra[], fromUpsell = false) => {
      const optionsExtra = selectedOptions.reduce((s, o) => s + o.priceAdjustment * o.qty, 0);
      const extrasExtra  = selectedExtras.reduce((s, e) => s + e.unitPrice * e.qty, 0);
      const finalPrice   = (item.promotion?.promotionalPrice ?? item.price) + optionsExtra + extrasExtra;
      const hasAny       = notes.trim() || selectedOptions.length > 0 || selectedExtras.length > 0;

      let newCart: CartItem[];
      if (!hasAny) {
        const cartId   = fromUpsell ? `${item.id}__upsell` : item.id;
        const existing = cart.find((c) => c.id === cartId);
        newCart = existing
          ? cart.map((c) => c.id === cartId ? { ...c, qty: c.qty + 1 } : c)
          : [...cart, { id: cartId, baseItemId: item.id, name: item.name, price: finalPrice, qty: 1, ...(fromUpsell ? { isUpsell: true } : {}) }];
      } else {
        newCart = [
          ...cart,
          {
            id:              `${item.id}_c${uid()}`,
            baseItemId:      item.id,
            name:            item.name,
            price:           finalPrice,
            qty:             1,
            notes:           notes.trim() || undefined,
            ...(fromUpsell ? { isUpsell: true } : {}),
            selectedOptions: selectedOptions.length > 0 ? selectedOptions : undefined,
            selectedExtras:  selectedExtras.length  > 0 ? selectedExtras  : undefined,
          },
        ];
      }

      setCart(newCart);
      setSelectedProduct(null);
      fireGtag("add_to_cart", { item_name: item.name, value: finalPrice, currency: "BRL" });
      lastActivityRef.current = Date.now();
      idleFiredRef.current    = false;
      if (stage === "BROWSE") {
        sendText("", newCart, stage, activeUpsell, { event: "ON_ITEM_ADDED", lastAddedId: item.id, silent: true });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, stage, activeUpsell, sendText, ga4Id],
  );

  // ── Guided flow step handler ──────────────────────────────────────
  // Client-side state machine — no AI calls. Each step pushes a message with
  // buttons and optionally fills the product grid from the local catalog.
  // Each guided step that needs to show products calls sendText (silent) so products
  // come exclusively from WaiterBrainV2 — no client-side catalog filtering.
  const handleGuidedStep = useCallback(
    async (value: string) => {
      const step = guidedStepRef.current;

      const addMsg = (content: string, opts?: WaiterOption[]) => {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant" as const, content, ts: new Date(), options: opts },
        ]);
      };

      switch (step) {
        case "size":
          guidedStepRef.current = "starters";
          addMsg("Vai querer entrada? 🥗", [
            { label: "Sim, quero entrada", value: "wants_starter" },
            { label: "Direto ao prato",    value: "skip_starter"  },
          ]);
          break;

        case "starters":
          guidedStepRef.current = "main";
          if (value === "wants_starter") {
            await sendText("quero entrada", cart, stage, activeUpsell, { event: "ON_USER_MESSAGE", silent: true });
          }
          addMsg("Prefere algo leve ou uma refeição completa? 🍽️", [
            { label: "Leve",     value: "light"    },
            { label: "Completo", value: "complete" },
          ]);
          break;

        case "main":
          guidedStepRef.current = "drinks";
          // Route through API so WaiterBrainV2 returns official product cards.
          await sendText(value, cart, stage, activeUpsell, { event: "ON_USER_MESSAGE", silent: true });
          addMsg("Vai querer bebida? 🥤", [
            { label: "Sim, quero bebida", value: "wants_drink" },
            { label: "Não, obrigado",     value: "skip_drink"  },
          ]);
          break;

        case "drinks":
          guidedStepRef.current = "dessert";
          if (value === "wants_drink") {
            await sendText("quero bebida", cart, stage, activeUpsell, { event: "ON_USER_MESSAGE", silent: true });
          }
          addMsg("Vai querer sobremesa? 🍰", [
            { label: "Sim, quero sobremesa", value: "wants_dessert" },
            { label: "Não, obrigado",        value: "skip_dessert"  },
          ]);
          break;

        case "dessert":
          guidedStepRef.current = "done";
          setGuidedMode(false);
          setAiPermState("idle");
          if (value === "wants_dessert") {
            await sendText("quero sobremesa", cart, stage, activeUpsell, { event: "ON_USER_MESSAGE", silent: true });
          }
          addMsg("Tudo pronto! 🎉 Quando quiser finalizar, clique em Finalizar pedido 😊");
          break;

        default:
          break;
      }
    },
    [cart, stage, activeUpsell, sendText],
  );

  // ── Permission prompt handlers ────────────────────────────────────

  const handlePermissionAccept = useCallback(() => {
    setAiPermState("consultive");
    // Route through ON_USER_MESSAGE so Sales Intelligence Core handles it:
    // "quero uma sugestão" → wants_recommendation → Leve/Completo buttons
    void sendText("quero uma sugestão", cart, stage, null, { event: "ON_USER_MESSAGE", silent: true });
  }, [cart, stage, sendText]);

  const handlePermissionDecline = useCallback(() => {
    setAiPermState("silent");
    silentUntilRef.current = Date.now() + SILENT_COOLDOWN_MS;
    // Persist so a soft-reload within the same browser session doesn't re-show the CTA.
    sessionStorage.setItem(`foocci-cta-seen-${slug}`, "1");
    pushAssistantMessage("Perfeito 😊 fica à vontade — qualquer coisa é só me chamar.");
  }, [pushAssistantMessage, slug]);

  // ── Checkout proceed helper ───────────────────────────────────────
  // Called by continue_checkout option or after all upsells resolve.

  const proceedToCheckout = useCallback(() => {
    checkoutPendingRef.current = false;
    setSuggestedProducts([]);
    setUpsellState((prev) => ({ ...prev, lastUpsellCategory: null }));
    const resumeStage = computeResumeStage(deliveryMethod, address, customerName, paymentMode, paymentMethodSub);
    setStage(resumeStage);
    if (resumeStage === "DELIVERY_TYPE") {
      sendText("", cart, "BROWSE", null, { event: "ON_CHECKOUT_STARTED", silent: true });
    } else {
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT[resumeStage] ?? "Se já estiver tudo certo, pode finalizar 👇");
    }
  }, [deliveryMethod, address, customerName, paymentMode, paymentMethodSub, cart, sendText, pushAssistantMessage]);

  // Keep ref in sync so sendText can call proceedToCheckout without circular deps
  useEffect(() => { proceedToCheckoutRef.current = proceedToCheckout; }, [proceedToCheckout]);

  // ── Option button handler ─────────────────────────────────────────
  // Receives the button value + label. Label is shown in the user bubble;
  // value is what is sent to the backend and used for routing.
  const handleOptionSelect = useCallback(
    (value: string, label?: string) => {
      if (ui === "thinking") return;

      // "see_other" → clear product grid, return to browsing.
      if (value === "see_other") { setSuggestedProducts([]); return; }

      // "add_to_cart" → add first shown product to cart.
      if (value === "add_to_cart") {
        const firstItem = suggestedProducts[0];
        if (firstItem) {
          // From the suggestion grid → attribute as a Foocci upsell.
          if (firstItem.hasVariants || firstItem.optionGroups.length > 0 || firstItem.extras.some((e) => e.price > 0))
            openProduct(firstItem, true);
          else handleItemAdd(firstItem, true);
        }
        return;
      }

      // "continue_browsing" → dismiss suggestion, apply cooldown.
      if (value === "continue_browsing") {
        setSuggestedProducts([]);
        setAiPermState("silent");
        silentUntilRef.current = Date.now() + SILENT_COOLDOWN_MS;
        return;
      }

      // "browse_menu" → dismiss any active suggestion, return to passive browsing.
      if (value === "browse_menu") { setSuggestedProducts([]); return; }

      // "repeat_last_order" → hydrate cart from the last order (W3).
      // Use the SSR payload when present; otherwise fetch fresh for the current customer.
      if (value === "repeat_last_order") {
        setSuggestedProducts([]);
        if (repeatOrder && repeatOrder.items.length > 0) {
          hydrateRepeatCart(repeatOrder);
          return;
        }
        const cid = resolvedCustomerId;
        if (!cid) {
          pushAssistantMessage("Pra repetir seu último pedido, preciso te identificar primeiro 😊");
          return;
        }
        fetch(`/api/pedido/${slug}/repeat-order?customerId=${encodeURIComponent(cid)}`)
          .then((r) => r.json())
          .then((d: { ok: boolean; repeatOrder: RepeatOrderPayload | null }) => {
            if (d.repeatOrder && d.repeatOrder.items.length > 0) hydrateRepeatCart(d.repeatOrder);
            else pushAssistantMessage("Seu último pedido não está disponível hoje, mas posso te sugerir algo parecido 😊");
          })
          .catch(() => pushAssistantMessage("Não consegui recuperar seu último pedido agora 😕"));
        return;
      }

      // "see_suggestions" (clean opening) → trigger the recommendation flow ONCE.
      // The top-of-handler `ui === "thinking"` guard prevents concurrent sends;
      // we also strip the button so it can't be re-tapped and duplicate the reply.
      if (value === SUGGESTION_OPTION_VALUE) {
        setMessages((prev) =>
          prev.map((m) => (m.options?.some((o) => o.value === SUGGESTION_OPTION_VALUE) ? { ...m, options: undefined } : m)),
        );
        sendText("me sugere algo", cart, stage, activeUpsell, { displayText: "Quero uma sugestão" });
        return;
      }

      // "Pedir novamente" (ao lado das sugestões) → abre a categoria "Comprar
      // novamente" (itens recentes do cliente), sem despejar tudo no carrinho.
      if (value === REPEAT_OPTION_VALUE) {
        setMessages((prev) =>
          prev.map((m) => (m.options?.some((o) => o.value === REPEAT_OPTION_VALUE) ? { ...m, options: undefined } : m)),
        );
        setSuggestedProducts([]);
        setSelectedCategoryId(REPEAT_CATEGORY_ID);
        return;
      }

      // "see_final_suggestions" → show pairing suggestions before checkout.
      if (value === "see_final_suggestions") {
        setSuggestedProducts([]);
        sendText("quero ver opções para acompanhar", cart, stage, activeUpsell);
        return;
      }

      // "continue_checkout" → skip upsell and advance to checkout if pending, else acknowledge.
      if (value === "continue_checkout") {
        setSuggestedProducts([]);
        if (checkoutPendingRef.current) {
          proceedToCheckout();
        } else {
          pushAssistantMessage("Ótimo! Pode finalizar quando quiser 😊");
        }
        return;
      }

      // "open_whatsapp:NUMBER" → open WhatsApp in new tab (HUMAN_CONTACT response)
      if (value.startsWith("open_whatsapp:")) {
        const number = value.replace("open_whatsapp:", "").replace(/\D/g, "");
        if (number) window.open(`https://wa.me/${number}`, "_blank", "noopener,noreferrer");
        return;
      }

      // "open_url:URL" → open social/external link in new tab (SOCIAL_CHANNELS response)
      if (value.startsWith("open_url:")) {
        const url = value.replace("open_url:", "");
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      // All other values (qualification, custom choices) → send to API.
      // displayText shows the human label in the bubble; value goes to the backend.
      setSuggestedProducts([]);
      sendText(value, cart, stage, activeUpsell, { displayText: label });
    },
    [cart, stage, activeUpsell, sendText, ui, suggestedProducts, handleItemAdd, pushAssistantMessage, proceedToCheckout, repeatOrder, hydrateRepeatCart, resolvedCustomerId, slug, openProduct],
  );

  // Sends a category intro via the standard sendText path so cards are preserved
  // and history is updated consistently. No user bubble is shown (silent: true).
  const sendCategoryIntro = useCallback(
    (cat: MenuCategory) => {
      if (!cat.description) return;
      sendText(cat.name, cart, "BROWSE", activeUpsell, {
        silent:        true,
        categoryIntro: { name: cat.name, description: cat.description },
      });
    },
    [cart, activeUpsell, sendText],
  );

  // Category tab click — selects the category and, on first visit, triggers a
  // clean AI category intro (no user bubble, natural presentation).
  const handleCategorySelect = useCallback(
    (cat: MenuCategory) => {
      setSelectedCategoryId(cat.id);
      if (
        stage !== "BROWSE" ||
        entryPhase !== "browsing" ||
        !cat.description ||
        visitedCategoryIds.current.has(cat.id)
      ) return;
      visitedCategoryIds.current.add(cat.id);
      sendCategoryIntro(cat);
    },
    [stage, entryPhase, sendCategoryIntro],
  );

  const handleFinalizeClick = useCallback(() => {
    // Dismiss any passive prompt when user taps Finalizar.
    if (aiPermState === "silent" || aiPermState === "pending") {
      silentUntilRef.current = 0;
      setAiPermState("idle");
    }

    if (isOrderingPaused) {
      const untilMsg = pausedUntil && new Date(pausedUntil) > new Date()
        ? ` Reabrimos às ${new Date(pausedUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
        : "";
      pushAssistantMessage(`Pedidos estão pausados no momento.${untilMsg} Você pode explorar o cardápio, mas não é possível finalizar enquanto estivermos pausados ⏸`);
      return;
    }
    if (entryPhase !== "browsing") {
      pushAssistantMessage("Informe seu WhatsApp antes de finalizar 📱");
      return;
    }
    if (cart.length === 0) {
      pushAssistantMessage("Adicione pelo menos um item antes de finalizar 👆");
      return;
    }
    if (stage !== "BROWSE") return;

    // Rapid-click guard: if a request is already in flight, ignore.
    if (checkoutPendingRef.current) return;

    // Delegate upsell sequencing to WaiterBrain via ON_CHECKOUT_STARTED.
    // INTERVENTION+cards → stay in BROWSE, advance upsell stage in memory.
    // CHECKOUT_SUPPORT   → sendText auto-advances via proceedToCheckoutRef.
    checkoutPendingRef.current = true;
    sendText("", cart, "BROWSE", null, { event: "ON_CHECKOUT_STARTED", silent: true });
  }, [cart, stage, entryPhase, isOrderingPaused, pausedUntil, sendText, pushAssistantMessage, aiPermState]);

  const handleDeliveryMethod = useCallback(
    (type: "delivery" | "pickup") => {
      setDeliveryMethod(type);
      if (type === "pickup") {
        pushUserMessage("🏪 Retirada no local");
        if (customerName.trim()) {
          // Name already known — skip ASK_NAME
          setStage("PAYMENT");
          pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["PAYMENT"]!);
        } else {
          setStage("ASK_NAME");
          pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["ASK_NAME"]!);
        }
      } else {
        pushUserMessage("🛵 Entrega");
        if (knownDefaultAddress?.cep) {
          setStage("SAVED_ADDRESS_OFFER");
          pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["SAVED_ADDRESS_OFFER"]!);
        } else {
          setStage("CEP_INPUT");
          pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["CEP_INPUT"]!);
        }
      }
    },
    [pushUserMessage, pushAssistantMessage, customerName],
  );

  const handleCepLookup = useCallback(
    async (rawCep: string) => {
      const cleanCep = rawCep.replace(/\D/g, "");
      if (cleanCep.length !== 8) {
        setCepError("CEP inválido — use 8 dígitos.");
        return;
      }
      setCepLoading(true);
      setCepError(null);
      try {
        const res  = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
        if (!res.ok || data.erro) {
          setCepError("CEP não encontrado. Verifique e tente novamente.");
          return;
        }
        const formatted = cleanCep.slice(0, 5) + "-" + cleanCep.slice(5);
        setAddress((prev) => ({
          ...prev,
          cep:          formatted,
          street:       data.logradouro ?? "",
          neighborhood: data.bairro     ?? "",
          city:         data.localidade ?? "",
          state:        data.uf         ?? "",
        }));
        pushUserMessage(`CEP ${formatted}`);
        setStage("ADDRESS_COMPLETE");
        pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["ADDRESS_COMPLETE"]!);
      } catch {
        setCepError("Erro ao buscar CEP. Verifique sua conexão e tente novamente.");
      } finally {
        setCepLoading(false);
      }
    },
    [pushUserMessage, pushAssistantMessage],
  );

  // ── Delivery quote runner ─────────────────────────────────────────────────────
  // Accepts the final address directly so it is never stale from React state.
  // Called automatically when ADDRESS_CONFIRM is entered so the customer never
  // sees a placeholder fee — only a loading state or the real geocoded result.
  const runDeliveryQuote = useCallback(
    async (quoteAddress: Address) => {
      if (deliveryMethod !== "delivery" || deliveryMode !== "distance") return;
      setQuoteLoading(true);
      setQuoteDeliveryFee(null);
      setQuoteStatus(null);
      setQuoteError(null);
      try {
        const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
        const res = await fetch(`/api/pedido/${slug}/delivery-quote`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ address: quoteAddress, subtotal: sub, deliveryType: "delivery" }),
        });
        const data = await res.json() as {
          deliveryFee?: number; distanceKm?: number | null;
          maxDistanceKm?: number | null; calculationStatus?: string; reason?: string;
        };
        if (data.calculationStatus === "distance_blocked") {
          setQuoteError(
            data.reason ??
            "Não conseguimos calcular a entrega para esse endereço. Revise o endereço ou fale com o restaurante.",
          );
        } else if (data.calculationStatus === "out_of_range") {
          const distPart = data.distanceKm != null
            ? ` Distância estimada: ${data.distanceKm.toFixed(1).replace(".", ",")} km.`
            : "";
          setQuoteError(`Esse endereço está fora da área de entrega.${distPart}`);
        } else {
          setQuoteDeliveryFee(data.deliveryFee ?? null);
          setQuoteStatus(data.calculationStatus ?? null);
        }
      } catch {
        setQuoteError("Erro ao calcular a taxa de entrega. Tente novamente.");
      }
      setQuoteLoading(false);
    },
    [deliveryMethod, deliveryMode, cart, slug],
  );

  const handleAddressComplete = useCallback(
    (num: string, complement: string, referencePoint: string) => {
      if (!num.trim()) return;
      // Build final address as a local variable — passed directly to runDeliveryQuote
      // so the quote fires with the correct address even before React flushes setAddress.
      const finalAddress: Address = {
        ...address,
        number:         num.trim(),
        complement:     complement.trim(),
        referencePoint: referencePoint.trim(),
      };
      setAddress(finalAddress);
      setStage("ADDRESS_CONFIRM");
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["ADDRESS_CONFIRM"]!);
      // Auto-fire the delivery quote immediately — customer sees loading, not a stale fee.
      void runDeliveryQuote(finalAddress);
    },
    [pushAssistantMessage, address, runDeliveryQuote],
  );

  // Quote already ran automatically on ADDRESS_CONFIRM entry.
  // This handler just advances the stage — no fetch needed here.
  const handleAddressConfirm = useCallback(() => {
    pushUserMessage("Endereço confirmado ✓");
    // If name + payment were already collected (e.g. customer is changing address
    // from the review screen), skip straight back to REVIEW_ORDER.
    const checkoutComplete =
      customerName.trim() &&
      paymentMode &&
      (paymentMode === "pay_now" || paymentMethodSub !== null);
    if (checkoutComplete) {
      setStage("REVIEW_ORDER");
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["REVIEW_ORDER"]!);
    } else if (customerName.trim()) {
      setStage("PAYMENT");
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["PAYMENT"]!);
    } else {
      setStage("ASK_NAME");
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["ASK_NAME"]!);
    }
  }, [pushUserMessage, pushAssistantMessage, customerName, paymentMode, paymentMethodSub]);

  const handleNameInput = useCallback(
    (text: string) => {
      pushUserMessage(text);
      if (!isValidName(text)) {
        pushAssistantMessage("Não entendi 😅 Qual é o seu nome?");
        return;
      }
      const firstName = text.trim().split(/\s+/)[0] ?? text.trim();
      setCustomerName(text.trim());
      setStage("PAYMENT");
      // Use the name immediately — feels personal and confirms the AI heard it.
      pushAssistantMessage(`Perfeito, ${firstName}! 🙌 Quer pagar agora ou na entrega? 👇`);
    },
    [pushUserMessage, pushAssistantMessage],
  );

  // (Unified payment handlers — handlePayNowPix / handleArrivalPayment — are
  //  defined below, after handleOnlinePaymentSelect / handlePaymentMethodSub.)

  const handlePaymentMethodSub = useCallback(
    (method: PaymentMethodSub, changeForValue: number | null = null) => {
      setPaymentMethodSub(method);
      // Troco só faz sentido no dinheiro; qualquer outro método zera.
      setChangeFor(method === "cash" ? changeForValue : null);
      setCashPanelOpen(false);
      setStage("REVIEW_ORDER");
      const labels: Record<PaymentMethodSub, string> = {
        card_machine:  "💳 Cartão na maquininha",
        pix_in_person: "📱 Pix",
        cash:          "💵 Dinheiro",
      };
      const echoed =
        method === "cash" && changeForValue
          ? `💵 Dinheiro (troco para R$ ${changeForValue.toFixed(2).replace(".", ",")})`
          : labels[method];
      pushUserMessage(echoed);
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["REVIEW_ORDER"]!);
    },
    [pushUserMessage, pushAssistantMessage],
  );

  const handleFinalConfirm = useCallback(async () => {
    if (!customerName.trim() || !paymentMode || cart.length === 0) return;
    if (paymentMode !== "pay_now" && !paymentMethodSub) return;

    const utm = getUtm();
    fireGtag("submit_order", { currency: "BRL", value: cart.reduce((s, i) => s + i.price * i.qty, 0) });

    setUi("thinking");
    try {
      const res = await fetch(`/api/pedido/${slug}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart,
          customerName,
          customerPhone:  effectiveCustomerPhone  ?? undefined,
          customerId:     resolvedCustomerId       ?? undefined,
          deliveryMethod,
          address,
          paymentMode,
          paymentMethodSub,
          onlineMethod: paymentMode === "pay_now" ? onlineMethod : undefined,
          changeFor: paymentMethodSub === "cash" ? changeFor : undefined,
          clientDeliveryFee: deliveryMethod === "delivery" && deliveryMode !== "manual"
            ? computeEffectiveFee(
                cart.reduce((s, i) => s + i.price * i.qty, 0),
                resolvedDeliveryFee,
                freeDeliveryAbove,
              )
            : undefined,
          couponCode:      appliedCoupon?.customerCouponId ? undefined : (appliedCoupon?.couponCode || undefined),
          customerCouponId: appliedCoupon?.customerCouponId || undefined,
          trackingLinkId:  utm.tlid    || undefined,
          trafficSource:   utm.source  || undefined,
          trafficMedium:   utm.medium  || undefined,
          trafficCampaign: utm.campaign || undefined,
          trafficContent:  utm.content  || undefined,
          referrerId:      getReferrerId(),
        }),
      });
      const data = await res.json();

      // ── Card (SumUp): finalize created the order + checkout; show the widget ──
      if (paymentMode === "pay_now" && onlineMethod === "card") {
        if (!res.ok || !data.card?.checkoutId) {
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: "assistant" as const, content: (data && data.error) || "Não foi possível iniciar o pagamento com cartão. Tente novamente.", ts: new Date() },
          ]);
          return;
        }
        const cardOrderId = data.orderId ?? null;
        setOrderId(cardOrderId);
        if (cardOrderId) {
          try { localStorage.setItem(ACTIVE_ORDER_KEY, JSON.stringify({ orderId: cardOrderId, createdAt: Date.now() })); } catch { /* ignore */ }
        }
        setCardStatus("form");
        setCardCheckout(data.card);
        setStage("CARD_FORM");
        return;
      }

      const resolvedOrderId = data.orderId ?? data.data?.orderId ?? null;
      setOrderId(resolvedOrderId);

      if (resolvedOrderId) {
        try {
          localStorage.setItem(ACTIVE_ORDER_KEY, JSON.stringify({ orderId: resolvedOrderId, createdAt: Date.now() }));
        } catch { /* ignore */ }
      }

      if (paymentMode === "pay_now" && (data.pixCopyPaste || data.paymentUrl)) {
        if (data.pixCopyPaste) {
          // MP direct Pix — show inline QR screen
          setPixCopyPaste(data.pixCopyPaste);
          // Normalize to full data URL so client-generated QR uses the same format
          setPixQrCodeBase64(
            data.pixQrCodeBase64 ? `data:image/png;base64,${data.pixQrCodeBase64}` : null
          );
          setPaymentUrl(null);
        } else {
          // Stone / Checkout Pro redirect
          setPaymentUrl(data.paymentUrl);
          setPixCopyPaste(null);
        }
        setStage("PAYMENT_LINK");
      } else {
        setStage("DONE");
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant" as const, content: "Erro ao confirmar pedido. Tente novamente.", ts: new Date() },
      ]);
    } finally {
      setUi("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, cart, customerName, effectiveCustomerPhone, resolvedCustomerId, deliveryMethod, address, paymentMode, paymentMethodSub, onlineMethod, changeFor, ga4Id, appliedCoupon]);

  const handleOnlinePaymentSelect = useCallback(() => {
    setStage("REVIEW_ORDER");
    pushUserMessage("⚡ Pix — QR Code");
    pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["REVIEW_ORDER"]!);
  }, [pushUserMessage, pushAssistantMessage]);

  // ── Unified payment screen handlers ──────────────────────────────────────────
  // "Pagar agora" (online Pix): set pay_now then go straight to review — same
  // flow as the previous two-step PAYMENT → ONLINE_METHOD_SELECT path.
  const handlePayNowPix = useCallback(() => {
    setOnlineMethod("pix");
    setPaymentMode("pay_now");
    handleOnlinePaymentSelect();
  }, [handleOnlinePaymentSelect]);

  // "Pagar agora" via Cartão de crédito (SumUp): set pay_now + card, then review.
  // finalize returns the SumUp checkout and the flow enters CARD_FORM (widget).
  const handlePayNowCard = useCallback(() => {
    setOnlineMethod("card");
    setPaymentMode("pay_now");
    setStage("REVIEW_ORDER");
    pushUserMessage("💳 Cartão de crédito");
    pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["REVIEW_ORDER"]!);
  }, [pushUserMessage, pushAssistantMessage]);

  // "Pagar na entrega/retirada": set BOTH the arrival mode and the chosen
  // sub-method in one tap, then advance to review — identical state + payload to
  // the previous PAYMENT → PAYMENT_METHOD path.
  const handleArrivalPayment = useCallback(
    (sub: DeliverySubId) => {
      setPaymentMode(deliveryMethod === "pickup" ? "pay_on_pickup" : "pay_on_delivery");
      handlePaymentMethodSub(sub);
    },
    [deliveryMethod, handlePaymentMethodSub],
  );

  const handleCancelPix = useCallback(() => {
    setPixCopyPaste(null);
    setPixQrCodeBase64(null);
    setPixCopied(false);
    setPaymentUrl(null);
    setOrderId(null);
    try { localStorage.removeItem(ACTIVE_ORDER_KEY); } catch { /* ignore */ }
    setStage("REVIEW_ORDER");
  }, []);

  // Returns customer to payment-mode selection so they can choose a different method
  // (e.g. pay on delivery instead of Pix). Resets payment selections so the PAYMENT
  // stage renders fresh options. The pending Pix order stays AWAITING_PAYMENT in the
  // DB — it will only enter operations if the Pix is actually paid via webhook.
  const handleChangePaymentMethod = useCallback(() => {
    setPixCopyPaste(null);
    setPixQrCodeBase64(null);
    setPixCopied(false);
    setPaymentUrl(null);
    setOrderId(null);
    try { localStorage.removeItem(ACTIVE_ORDER_KEY); } catch { /* ignore */ }
    setPaymentMode(null);
    setPaymentMethodSub(null);
    setChangeFor(null);
    setCashPanelOpen(false);
    setCashChangeInput("");
    setStage("PAYMENT");
    pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["PAYMENT"]!);
  }, [pushAssistantMessage]);

  // Load the customer's wallet coupons (earned via CRM campaigns).
  const loadWallet = useCallback(async () => {
    if (!resolvedCustomerId) { setWalletCoupons([]); return; }
    try {
      const res = await fetch(`/api/pedido/${slug}/coupons?customerId=${encodeURIComponent(resolvedCustomerId)}`, {
        headers: authTokenHeaders, // proof of phone possession — no token, no wallet
      });
      const j   = await res.json();
      setWalletCoupons(Array.isArray(j?.coupons) ? j.coupons : []);
    } catch { setWalletCoupons([]); }
  }, [slug, resolvedCustomerId, authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply a wallet coupon. discountAmount here is display-only — the server
  // recomputes it authoritatively at finalize from the coupon in the DB.
  const applyWalletCoupon = useCallback((w: { id: string; label: string; discountType: string; discountValue: number; isReward?: boolean }) => {
    const sub      = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const isManFee = deliveryMethod === "delivery" && deliveryMode === "manual";
    const fee      = deliveryMethod === "delivery" && !isManFee
      ? computeEffectiveFee(sub, resolvedDeliveryFee, freeDeliveryAbove)
      : 0;
    // A CUSTOM reward ("sobremesa grátis") never discounts the total — it's fulfilled
    // by the restaurant. FREE_SHIPPING discounts exactly the delivery fee (server
    // recomputes; on pickup it's kept in the wallet, not consumed).
    const discountAmount = w.isReward
      ? 0
      : w.discountType === "FREE_SHIPPING"
      ? Math.round(fee * 100) / 100
      : w.discountType === "PERCENTAGE"
      ? Math.round(Math.min((sub * w.discountValue) / 100, sub) * 100) / 100
      : Math.round(Math.min(w.discountValue, sub + fee) * 100) / 100;
    setCouponError(null);
    setAppliedCoupon({
      promotionId: "", couponCode: w.label, discountAmount,
      discountType: w.discountType, name: w.label, customerCouponId: w.id,
    });
    setWalletOpen(false);
  }, [cart, deliveryMethod, deliveryMode, resolvedDeliveryFee, freeDeliveryAbove]);

  const handleBackToBrowse = useCallback(() => {
    // Return to browsing without wiping checkout data.
    // deliveryMethod, address, customerName, paymentMode, paymentMethodSub are
    // preserved so the customer can resume from where they left off.
    // upsellState is reset so it won't re-trigger on the next Finalize click
    // (the resume flow jumps straight past upsells to the correct stage).
    setStage("BROWSE");
    setOrderId(null);
    setUpsellState({ offeredDrink: false, offeredDessert: false, lastUpsellCategory: null });
    lastActivityRef.current = Date.now();
    idleFiredRef.current    = false;
    sendText("", cart, "BROWSE", activeUpsell, { event: "ON_MENU_MODE", silent: true });
  }, [cart, activeUpsell, sendText]);

  // Change delivery address from the review screen.
  // Cart, customerName, paymentMode and paymentMethodSub are all preserved.
  // After re-entering the address, handleAddressConfirm will detect that checkout
  // is already complete and jump straight back to REVIEW_ORDER.
  const handleChangeAddress = useCallback(() => {
    setAddress({ cep: "", street: "", number: "", neighborhood: "", city: "", state: "", complement: "", referencePoint: "" });
    setCepInputValue("");
    setStage("CEP_INPUT");
    pushAssistantMessage("Informe o novo CEP de entrega. 📍");
  }, [pushAssistantMessage]);

  const handleUseSavedAddress = useCallback(() => {
    pushUserMessage("✅ Sim, entregar nesse endereço");
    setStage("ADDRESS_CONFIRM");
    pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["ADDRESS_CONFIRM"]!);
    void runDeliveryQuote(address);
  }, [pushUserMessage, pushAssistantMessage, runDeliveryQuote, address]);

  const handleRejectSavedAddress = useCallback(() => {
    setAddress({ cep: "", street: "", number: "", neighborhood: "", city: "", state: "", complement: "", referencePoint: "" });
    setCepInputValue("");
    pushUserMessage("📍 Usar outro endereço");
    setStage("CEP_INPUT");
    pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["CEP_INPUT"]!);
  }, [pushUserMessage, pushAssistantMessage]);

  // ── Input submit ──────────────────────────────────────────────────
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || ui === "thinking") return;
    setInputText("");
    // Blur to dismiss keyboard after sending — prevents layout staying collapsed
    inputRef.current?.blur();
    // Any user message resets the idle timer
    lastActivityRef.current = Date.now();
    idleFiredRef.current    = false;
    // Exit passive states the moment the user initiates conversation
    if (aiPermState === "silent" || aiPermState === "pending") {
      silentUntilRef.current = 0;
      setAiPermState("consultive");
    }

    switch (stage) {
      case "ASK_NAME":        handleNameInput(text);      break;
      // Post-order: route to AFTER_CHECKOUT directive (logistics-only, no product suggestions)
      case "DONE":
      case "PAYMENT_LINK":
        sendText(text, cart, stage, activeUpsell, { event: "AFTER_CHECKOUT" });
        break;
      // Checkout button stages: guard against sales AI firing during checkout
      case "DELIVERY_TYPE":
      case "ADDRESS_CONFIRM":
      case "PAYMENT":
      case "PAYMENT_METHOD":
      case "ONLINE_METHOD_SELECT":
      case "REVIEW_ORDER":
        sendText(text, cart, stage, activeUpsell, { event: "AFTER_CHECKOUT" });
        break;
      default: sendText(text, cart, stage, activeUpsell); break;
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  // ── Checkout UI panels ────────────────────────────────────────────

  function renderCheckoutPanel() {
    // Active-order banner — shown in BROWSE when customer has an in-progress order
    if (stage === "BROWSE" && showActiveBanner && orderTrackingData) {
      return (
        <div className="shrink-0 border-t border-orange-100 bg-orange-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-orange-800">🍽️ Pedido em andamento</p>
              <p className="truncate text-[11px] text-orange-600">
                #{orderTrackingData.orderNumber} · {ORDER_STATUS_LABELS[orderTrackingData.status] ?? orderTrackingData.status}
              </p>
            </div>
            <button
              onClick={() => {
                setOrderId(activeOrderId);
                setStage("DONE");
                setShowActiveBanner(false);
              }}
              className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: pc }}
            >
              Acompanhar
            </button>
          </div>
        </div>
      );
    }

    if (stage === "DELIVERY_TYPE") {
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-gray-500">Como vai receber?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleDeliveryMethod("delivery")}
              className="flex flex-col items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              <span>🛵</span> Entrega
            </button>
            <button
              onClick={() => handleDeliveryMethod("pickup")}
              className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              <span>🏪</span> Retirada
            </button>
          </div>
        </div>
      );
    }

    if (stage === "SAVED_ADDRESS_OFFER") {
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
          <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <p className="font-semibold">{address.street}, {address.number}</p>
            {address.neighborhood && <p>{address.neighborhood}</p>}
            {(address.city || address.state) && (
              <p className="text-gray-500">{[address.city, address.state].filter(Boolean).join("/")} {address.cep ? `· ${address.cep}` : ""}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleUseSavedAddress}
              className="flex flex-col items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              <span>✅</span> Sim, entregar aqui
            </button>
            <button
              type="button"
              onClick={handleRejectSavedAddress}
              className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              <span>📍</span> Usar outro endereço
            </button>
          </div>
        </div>
      );
    }

    if (stage === "CEP_INPUT") {
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-gray-500">Qual é o seu CEP? 📍</p>
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="numeric"
              value={cepInputValue}
              onChange={(e) => {
                let v = e.target.value.replace(/\D/g, "").slice(0, 8);
                if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
                setCepInputValue(v);
                setCepError(null);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCepLookup(cepInputValue); }}
              placeholder="00000-000"
              maxLength={9}
              disabled={cepLoading}
              autoFocus
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
              style={{ "--tw-ring-color": "var(--brand-primary)", fontSize: "16px" } as React.CSSProperties}
            />
            <button
              type="button"
              onClick={() => void handleCepLookup(cepInputValue)}
              disabled={cepLoading || cepInputValue.replace(/\D/g, "").length < 8}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--brand-primary)" }}
            >
              {cepLoading ? "…" : "Buscar"}
            </button>
          </div>
          {cepError && (
            <p className="mt-2 text-xs text-red-600">{cepError}</p>
          )}
          <p className="mt-2 text-xs text-gray-400">
            Não sabe o CEP?{" "}
            <a
              href="https://buscacepinter.correios.com.br/app/endereco/index.php"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Consultar nos Correios
            </a>
          </p>
          <button
            type="button"
            onClick={() => {
              setDeliveryMethod(null);
              setCepInputValue("");
              setCepError(null);
              setStage("DELIVERY_TYPE");
            }}
            className="mt-2 w-full rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
          >
            ← Voltar para entrega/retirada
          </button>
        </div>
      );
    }

    if (stage === "ADDRESS_COMPLETE") {
      return (
        <AddressCompletePanel
          address={address}
          onConfirm={handleAddressComplete}
          onEditCep={() => {
            setAddress((prev) => ({ ...prev, cep: "", street: "", neighborhood: "", city: "", state: "" }));
            setCepInputValue(address.cep);
            setStage("CEP_INPUT");
          }}
        />
      );
    }

    if (stage === "ADDRESS_CONFIRM") {
      const addrSubtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const effectiveFeeForAddr = computeEffectiveFee(addrSubtotal, resolvedDeliveryFee, freeDeliveryAbove);
      const prepMin  = averagePreparationMinutes ?? 20;
      const etaLow   = deliveryMethod === "pickup"
        ? prepMin - 5
        : prepMin + (deliveryEstimatedMinutes ?? 30) - 10;
      const etaHigh  = deliveryMethod === "pickup"
        ? prepMin + 10
        : prepMin + (deliveryEstimatedMinutes ?? 30) + 10;
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3" data-testid="checkout-area">
          <div className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <p className="font-semibold">{address.street}, {address.number}</p>
            <p>{address.neighborhood}{address.complement ? ` — ${address.complement}` : ""}</p>
            {(address.city || address.state) && (
              <p className="text-gray-500">{[address.city, address.state].filter(Boolean).join("/")} {address.cep ? `· ${address.cep}` : ""}</p>
            )}
            {address.referencePoint && (
              <p className="text-gray-500">Ref: {address.referencePoint}</p>
            )}
          </div>

          {/* ── Delivery fee section ─────────────────────────────────────────────── */}
          {deliveryMethod === "delivery" && (
            <>
              {/* Distance mode — loading: quote is running, never show a placeholder amount */}
              {deliveryMode === "distance" && quoteLoading && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
                  <span>🛵 Taxa de entrega</span>
                  <span>Calculando…</span>
                </div>
              )}

              {/* Distance mode — quote confirmed: show real fee (calculated or fallback) */}
              {deliveryMode === "distance" && !quoteLoading && !quoteError && !!quoteStatus && (
                <div className={`mb-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${quoteStatus === "distance_min_fee_fallback" ? "bg-amber-50" : "bg-green-50"}`}>
                  <span className="text-gray-600">🛵 Taxa de entrega</span>
                  <span className="font-semibold text-gray-800">
                    {effectiveFeeForAddr === 0
                      ? "Grátis"
                      : `R$ ${effectiveFeeForAddr.toFixed(2).replace(".", ",")}`}
                  </span>
                </div>
              )}

              {/* Non-distance modes (simple / manual): show immediately, no quote needed */}
              {deliveryMode !== "distance" && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-green-50 px-3 py-1.5 text-xs">
                  <span className="text-gray-600">🛵 Taxa de entrega</span>
                  <span className="font-semibold text-gray-800">
                    {deliveryMode === "manual"
                      ? "A combinar"
                      : resolvedDeliveryFee == null
                      ? "—"
                      : effectiveFeeForAddr === 0
                      ? "Grátis"
                      : `R$ ${effectiveFeeForAddr.toFixed(2).replace(".", ",")}`}
                  </span>
                </div>
              )}

              {/* Fallback amber warning: distance unknown, estimated fee applied */}
              {quoteStatus === "distance_min_fee_fallback" && !quoteError && (
                <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Taxa estimada — não conseguimos calcular a distância exata. O restaurante poderá ajustar na entrega.
                </div>
              )}

              {/* Error: out_of_range or distance_blocked — fee chip is hidden above */}
              {!!quoteError && (
                <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {quoteError}
                </div>
              )}
            </>
          )}

          <p className="mb-2 text-xs text-gray-500">
            ⏱ Previsão de {deliveryMethod === "pickup" ? "retirada" : "entrega"}: <span className="font-semibold text-gray-700">{Math.max(5, etaLow)}–{etaHigh} min</span>
          </p>
          <div className="flex gap-2">
            <button
              data-testid="address-confirm-button"
              onClick={handleAddressConfirm}
              disabled={
                quoteLoading ||
                !!quoteError ||
                (deliveryMethod === "delivery" && deliveryMode === "distance" && !quoteStatus)
              }
              className="flex-1 rounded-xl py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {quoteLoading ? "Calculando…" : "Confirmar endereço"}
            </button>
            <button
              onClick={() => {
                // Explicit address edit — clear collected address so the user
                // re-enters it from scratch (not auto-skipped by computeResumeStage).
                setAddress({ cep: "", street: "", number: "", neighborhood: "", city: "", state: "", complement: "", referencePoint: "" });
                setCepInputValue("");
                setQuoteDeliveryFee(null);
                setQuoteStatus(null);
                setQuoteError(null);
                setStage("CEP_INPUT");
              }}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Editar
            </button>
          </div>
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setDeliveryMethod(null);
                setAddress({ cep: "", street: "", number: "", neighborhood: "", city: "", state: "", complement: "", referencePoint: "" });
                setCepInputValue("");
                setQuoteDeliveryFee(null);
                setQuoteStatus(null);
                setQuoteError(null);
                setStage("DELIVERY_TYPE");
              }}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              ← Trocar entrega/retirada
            </button>
          </div>
        </div>
      );
    }

    if (stage === "PAYMENT") {
      const showPayNow = shouldShowPayNow(pixOnlineEnabled, cardOnlineEnabled);
      const arrivalOptions = deliveryPaymentOptions();
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3" data-testid="checkout-area">
          <p className="mb-3 text-sm font-bold text-gray-800">Como você quer pagar?</p>

          {/* Bloco 1 — Pagar agora (online) */}
          {showPayNow && (
            <div className="mb-3" data-testid="pay-now-block">
              <p className="text-xs font-semibold text-gray-700">Pagar agora</p>
              <p className="mb-2 text-[11px] text-gray-400">Você paga online antes do pedido ser enviado ao restaurante.</p>
              <div className="flex flex-col gap-2">
                {payNowOptions(pixOnlineEnabled, cardOnlineEnabled).map((opt) => {
                  const isCard = opt.id === "card_online";
                  return (
                  <button
                    key={opt.id}
                    data-testid={isCard ? "card-online-select-btn" : "pix-online-select-btn"}
                    onClick={isCard ? handlePayNowCard : handlePayNowPix}
                    className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-left hover:bg-indigo-100 active:scale-[0.99] transition-all"
                  >
                    <span className="shrink-0 text-lg">{opt.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-indigo-800">{opt.label}</p>
                      {opt.hint && <p className="text-xs text-indigo-600">{opt.hint}</p>}
                    </div>
                    <span className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white">{isCard ? "Pagar" : "Gerar QR Pix"}</span>
                  </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bloco 2 — Pagar na entrega/retirada (on arrival) */}
          {arrivalOptions.length > 0 && (
            <div data-testid="pay-on-arrival-block">
              <p className="text-xs font-semibold text-gray-700">{arrivalBlockTitle(deliveryMethod)}</p>
              <p className="mb-2 text-[11px] text-gray-400">Você paga quando {deliveryMethod === "pickup" ? "retirar" : "receber"} o pedido.</p>
              <div className="flex flex-col gap-2">
                {arrivalOptions.map((opt) => (
                  <button
                    key={opt.id}
                    data-testid={`arrival-pay-${opt.id}`}
                    onClick={() => handleArrivalPayment(opt.id)}
                    className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100 active:scale-[0.99] transition-all"
                  >
                    <span className="shrink-0 text-lg">{opt.emoji}</span>
                    <span className="flex-1">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (deliveryMethod === "delivery") {
                  setStage("ADDRESS_CONFIRM");
                } else {
                  setDeliveryMethod(null);
                  setStage("DELIVERY_TYPE");
                }
              }}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              ← Voltar para {deliveryMethod === "delivery" ? "endereço" : "entrega/retirada"}
            </button>
          </div>
        </div>
      );
    }

    if (stage === "PAYMENT_METHOD") {
      // Total (itens + frete conhecido - desconto) pra validar/calcular o troco.
      // Espelha o cálculo do REVIEW_ORDER; frete "a combinar" fica de fora.
      const pmSubtotal   = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const pmManualFee  = deliveryMethod === "delivery" && deliveryMode === "manual";
      const pmFee        = deliveryMethod === "delivery" && !pmManualFee
        ? computeEffectiveFee(pmSubtotal, resolvedDeliveryFee, freeDeliveryAbove)
        : 0;
      const pmDiscount   = appliedCoupon?.discountAmount ?? 0;
      const paymentTotal = Math.max(0, Math.round((pmSubtotal + pmFee - pmDiscount) * 100) / 100);

      const parsedChange = parseMoneyBR(cashChangeInput);
      const changeOk     = parsedChange != null && parsedChange > paymentTotal;
      const trocoPreview = changeOk ? parsedChange - paymentTotal : null;
      const suggestedNote = Math.max(10, Math.ceil((paymentTotal + 10) / 10) * 10);

      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3" data-testid="checkout-area">
          <p className="mb-2 text-xs font-semibold text-gray-500">{paymentMode === "pay_on_delivery" ? "Como prefere pagar na entrega?" : "Como prefere pagar na retirada?"}</p>
          <div className="flex flex-col gap-2">
            {(["card_machine", "pix_in_person", "cash"] as PaymentMethodSub[]).map((m) => {
              const labels = { card_machine: "💳 Cartão na maquininha", pix_in_person: "📱 Pix na entrega", cash: "💵 Dinheiro" };
              const isCashOpen = m === "cash" && cashPanelOpen;
              return (
                <button
                  key={m}
                  data-testid={m === "cash" ? "pay-cash-btn" : undefined}
                  onClick={() => {
                    // Dinheiro abre o passo de troco em vez de avançar direto.
                    if (m === "cash") { setCashChangeInput(""); setCashPanelOpen(true); }
                    else handlePaymentMethodSub(m);
                  }}
                  className={`rounded-xl border px-4 py-2.5 text-left text-sm font-semibold text-gray-700 ${isCashOpen ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100"}`}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>

          {/* Troco (dinheiro): expande abaixo do botão, não empurra o fluxo. */}
          {cashPanelOpen && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3" data-testid="cash-change-panel">
              <p className="text-sm font-semibold text-gray-800">Vai precisar de troco?</p>
              <p className="mt-0.5 text-xs text-gray-500">Pra quanto você vai pagar? Deixe em branco se tiver o valor certo.</p>
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <span className="text-sm font-semibold text-gray-400">R$</span>
                <input
                  inputMode="decimal"
                  value={cashChangeInput}
                  onChange={(e) => setCashChangeInput(e.target.value)}
                  placeholder={`ex.: ${suggestedNote}`}
                  data-testid="cash-change-input"
                  className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-300"
                  autoFocus
                />
              </div>
              {parsedChange != null && !changeOk && (
                <p className="mt-1.5 text-xs text-red-500">
                  Precisa ser maior que o total (R$ {paymentTotal.toFixed(2).replace(".", ",")}).
                </p>
              )}
              {trocoPreview != null && (
                <p className="mt-1.5 text-xs font-semibold text-emerald-700">
                  💰 Você recebe R$ {trocoPreview.toFixed(2).replace(".", ",")} de troco.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => handlePaymentMethodSub("cash", null)}
                  data-testid="cash-no-change-btn"
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Não preciso de troco
                </button>
                <button
                  type="button"
                  disabled={!changeOk}
                  onClick={() => { if (changeOk) handlePaymentMethodSub("cash", parsedChange); }}
                  data-testid="cash-confirm-change-btn"
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  style={{ backgroundColor: "var(--brand-primary)" }}
                >
                  Confirmar troco
                </button>
              </div>
            </div>
          )}

          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setCashPanelOpen(false);
                setPaymentMode(null);
                setStage("PAYMENT");
              }}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              ← Voltar para forma de pagamento
            </button>
          </div>
        </div>
      );
    }

    if (stage === "ONLINE_METHOD_SELECT") {
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-4" data-testid="checkout-area">
          <p className="text-sm font-semibold text-gray-800">Escolha como quer pagar online</p>
          <p className="mt-1 mb-3 text-xs text-gray-500">
            Por enquanto, o pagamento online disponível é Pix.
          </p>
          <div className="flex flex-col gap-2">
            <button
              data-testid="pix-online-select-btn"
              onClick={handleOnlinePaymentSelect}
              className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-left hover:bg-indigo-100 active:scale-[0.99] transition-all"
            >
              <span className="mt-0.5 shrink-0 text-lg">⚡</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-indigo-800">Pix</p>
                <p className="text-xs text-indigo-600">QR Code ou copia e cola</p>
              </div>
              <span className="shrink-0 self-center rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white">
                Gerar QR Code Pix
              </span>
            </button>
            {(["Cartão de crédito", "Cartão de débito", "Boleto"] as const).map((label) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 cursor-not-allowed opacity-50"
              >
                <span className="mt-0.5 shrink-0 text-lg">💳</span>
                <div>
                  <p className="text-sm font-semibold text-gray-500">{label}</p>
                  <p className="text-xs text-gray-400">Em breve</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setPaymentMode(null);
                setStage("PAYMENT");
              }}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              ← Voltar para forma de pagamento
            </button>
          </div>
        </div>
      );
    }

    if (stage === "REVIEW_ORDER") {
      const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const isManualFee = deliveryMethod === "delivery" && deliveryMode === "manual";
      const appliedFee  = deliveryMethod === "delivery" && !isManualFee
        ? computeEffectiveFee(subtotal, resolvedDeliveryFee, freeDeliveryAbove)
        : 0;
      const total       = subtotal + appliedFee;
      const discount    = appliedCoupon?.discountAmount ?? 0;
      const finalTotal  = Math.max(0, Math.round((total - discount) * 100) / 100);
      const pmLabel = resolvePaymentMethod(paymentMode, paymentMethodSub) ?? "—";
      const prepMin  = averagePreparationMinutes ?? 20;
      const etaLow   = deliveryMethod === "pickup"
        ? prepMin - 5
        : prepMin + (deliveryEstimatedMinutes ?? 30) - 10;
      const etaHigh  = deliveryMethod === "pickup"
        ? prepMin + 10
        : prepMin + (deliveryEstimatedMinutes ?? 30) + 10;
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3" data-testid="checkout-area">
          <p className="mb-2 text-xs font-semibold text-gray-500">Revise seu pedido</p>

          {/* Cart items */}
          <div className="mb-2 max-h-28 overflow-y-auto">
            {cart.map((c) => (
              <div key={c.id} className="py-0.5">
                <div className="flex justify-between text-xs text-gray-700">
                  <span>{c.name} × {c.qty}</span>
                  <span>R$ {(c.price * c.qty).toFixed(2).replace(".", ",")}</span>
                </div>
                {(c.selectedOptions?.length || c.selectedExtras?.length || c.notes) && (
                  <p className="text-[10px] text-gray-400 line-clamp-1 ml-1">
                    {[
                      c.selectedOptions?.map((o) => `${o.qty}× ${o.optionName}`).join(", "),
                      c.selectedExtras?.map((e) => `${e.qty}× ${e.name}`).join(", "),
                      c.notes,
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Delivery fee row */}
          {deliveryMethod === "delivery" && (
            <div className="flex justify-between py-0.5 text-xs text-gray-600">
              <span>Taxa de entrega</span>
              <span>
                {isManualFee
                  ? "A combinar"
                  : appliedFee === 0
                  ? "Grátis"
                  : `R$ ${appliedFee.toFixed(2).replace(".", ",")}`}
              </span>
            </div>
          )}

          {/* Coupon input / applied coupon */}
          <div className="py-1">
            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-lg bg-green-50 px-2.5 py-1.5 text-xs">
                <span className="font-medium text-green-700">
                  {appliedCoupon.discountType === "CUSTOM" ? "🎁" : "🏷"} {appliedCoupon.couponCode}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-green-700">
                    {appliedCoupon.discountType === "CUSTOM" ? "resgatada no pedido" : `-${discount.toFixed(2).replace(".", ",")} R$`}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setAppliedCoupon(null); setCouponError(null); }}
                    className="text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Meus cupons (wallet earned via CRM campaigns). O dropdown é um
                    OVERLAY (absolute): abre pra baixo POR CIMA do conteúdo, sem
                    empurrar o resto do layout do resumo. */}
                {resolvedCustomerId && (
                  <div className="relative rounded-lg border border-brand-200 bg-brand-50/40">
                    <button
                      type="button"
                      onClick={() => { const nx = !walletOpen; setWalletOpen(nx); if (nx) void loadWallet(); }}
                      className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-semibold text-brand-700"
                    >
                      <span>🎁 Meus cupons</span>
                      <svg className={`h-3.5 w-3.5 transition-transform ${walletOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {walletOpen && (
                      <>
                        {/* clique fora fecha o overlay */}
                        <button
                          type="button"
                          aria-label="Fechar cupons"
                          onClick={() => setWalletOpen(false)}
                          className="fixed inset-0 z-20 cursor-default"
                        />
                        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-xl border border-brand-200 bg-white shadow-xl">
                          {walletCoupons.length === 0 ? (
                            <p className="px-2.5 py-2 text-[11px] text-gray-500">Você ainda não tem cupons. Eles chegam pelas mensagens do restaurante.</p>
                          ) : walletCoupons.map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => applyWalletCoupon(w)}
                              className="flex w-full items-center justify-between gap-2 border-t border-brand-100 px-2.5 py-2 text-left first:border-t-0 hover:bg-brand-50/60"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-bold text-ink">{w.isReward ? `🎁 ${w.label}` : w.label}</span>
                                {w.isReward && <span className="block text-[10px] text-gray-500">Recompensa — resgatada no pedido</span>}
                              </span>
                              <span className="shrink-0 text-[10px] text-gray-500">
                                {w.expiresAt ? `vence ${new Date(w.expiresAt).toLocaleDateString("pt-BR")}` : "sem validade"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Cupom digitado foi removido: o cliente agora só SELECIONA um
                    cupom da carteira ("Meus cupons") — nada de código manual. */}
                {!resolvedCustomerId && (
                  <p className="px-0.5 text-[11px] text-gray-400">
                    Identifique-se para ver e usar seus cupons.
                  </p>
                )}
              </div>
            )}
            {couponError && (
              <p className="mt-1 text-xs text-red-500">{couponError}</p>
            )}
          </div>

          {/* Discount row */}
          {appliedCoupon && (
            <div className="flex justify-between py-0.5 text-xs text-green-600">
              <span>Desconto</span>
              <span>-R$ {discount.toFixed(2).replace(".", ",")}</span>
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between border-t border-gray-100 pt-1.5 pb-2 text-sm font-bold text-gray-900">
            <span>Total{isManualFee ? " (+ frete)" : ""}</span>
            <span>R$ {finalTotal.toFixed(2).replace(".", ",")}</span>
          </div>

          {/* Order details summary */}
          <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 space-y-0.5 text-xs text-gray-600">
            {customerName && (
              <p><span className="font-semibold text-gray-800">Nome:</span> {customerName}</p>
            )}
            <p>
              <span className="font-semibold text-gray-800">Recebimento:</span>{" "}
              {deliveryMethod === "delivery" ? "🛵 Entrega" : "🏪 Retirada"}
            </p>
            {deliveryMethod === "delivery" && address.street && (
              <p>
                <span className="font-semibold text-gray-800">Endereço:</span>{" "}
                {address.street}{address.number ? `, ${address.number}` : ""}
                {address.neighborhood ? `, ${address.neighborhood}` : ""}
              </p>
            )}
            <p>
              <span className="font-semibold text-gray-800">Pagamento:</span> {pmLabel}
              {paymentMethodSub === "cash" && (
                changeFor
                  ? <span className="text-emerald-700"> • troco para R$ {changeFor.toFixed(2).replace(".", ",")}</span>
                  : <span className="text-gray-400"> • sem troco</span>
              )}
            </p>
            <p>
              <span className="font-semibold text-gray-800">Previsão:</span>{" "}
              ⏱ {Math.max(5, etaLow)}–{etaHigh} min
            </p>
          </div>

          <button
            data-testid="checkout-confirm-btn"
            onClick={handleFinalConfirm}
            disabled={ui === "thinking"}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {ui === "thinking" ? "Confirmando…" : "Confirmar pedido 🎉"}
          </button>
          <div className="mt-2 flex flex-wrap gap-2 justify-center">
            <button
              onClick={handleBackToBrowse}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
            >
              Editar pedido
            </button>
            {deliveryMethod === "delivery" && (
              <button
                onClick={handleChangeAddress}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
              >
                Alterar endereço
              </button>
            )}
            <button
              onClick={() => {
                setPaymentMode(null);
                setPaymentMethodSub(null);
                setChangeFor(null);
                setCashPanelOpen(false);
                setCashChangeInput("");
                setStage("PAYMENT");
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
            >
              Trocar pagamento
            </button>
          </div>
        </div>
      );
    }

    if (stage === "PAYMENT_LINK") {
      // ── Pix QR (Mercado Pago direct) ──────────────────────────────
      if (pixCopyPaste) {
        return (
          <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-4" data-testid="checkout-area">
            <p className="text-sm font-semibold text-gray-800">Aguardando pagamento Pix</p>
            <p className="mt-1 text-xs text-gray-500">
              Escaneie o QR Code ou use o código copia e cola abaixo.
            </p>

            {pixQrCodeBase64 ? (
              <div className="mt-3 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pixQrCodeBase64}
                  alt="QR Code Pix"
                  className="h-44 w-44 rounded-xl border border-gray-200 shadow-sm"
                />
              </div>
            ) : (
              <div className="mt-3 flex justify-center">
                <div className="h-44 w-44 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center">
                  <span className="text-xs text-gray-400">Gerando QR…</span>
                </div>
              </div>
            )}

            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pix Copia e Cola</p>
              <p className="break-all font-mono text-[11px] text-gray-700 select-all">{pixCopyPaste}</p>
            </div>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(pixCopyPaste).then(() => {
                  setPixCopied(true);
                  setTimeout(() => setPixCopied(false), 3000);
                }).catch(() => {});
              }}
              className="mt-2.5 w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              {pixCopied ? "✅ Código copiado!" : "Copiar código Pix"}
            </button>

            <p className="mt-2.5 text-center text-[10px] text-gray-400 animate-pulse">
              ⏳ Aguardando confirmação do pagamento…
            </p>

            <p className="mt-2 text-center text-[10px] text-gray-400">
              Seu pedido só será enviado ao restaurante após a confirmação do pagamento.
            </p>

            <button
              data-testid="change-payment-btn"
              type="button"
              onClick={handleChangePaymentMethod}
              className="mt-3 w-full rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 active:scale-95 transition-all"
            >
              Trocar forma de pagamento
            </button>

            <button
              data-testid="back-to-review-btn"
              type="button"
              onClick={handleCancelPix}
              className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
            >
              Voltar para revisar pedido
            </button>
          </div>
        );
      }

      // ── Redirect link (Stone / Checkout Pro fallback) ──────────────
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-4">
          <p className="text-sm font-semibold text-gray-800">💳 Pagamento online</p>
          <p className="mt-1 text-xs text-gray-500">
            Clique no botão abaixo para pagar. Seu pedido será confirmado automaticamente após o pagamento.
          </p>
          {paymentUrl ? (
            <>
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 transition-colors"
              >
                Ir para o pagamento →
              </a>
              <p className="mt-2 text-[10px] text-gray-400 text-center animate-pulse">⏳ Aguardando confirmação do pagamento…</p>
              <p className="mt-1 text-center text-[10px] text-gray-400">
                Seu pedido só será enviado ao restaurante após a confirmação do pagamento.
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-red-500">Link expirado ou erro. Recarregue a página para tentar novamente.</p>
          )}
          <button
            data-testid="change-payment-btn"
            type="button"
            onClick={handleChangePaymentMethod}
            className="mt-3 w-full rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 active:scale-95 transition-all"
          >
            Trocar forma de pagamento
          </button>
          <button
            data-testid="back-to-review-btn"
            type="button"
            onClick={handleCancelPix}
            className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
          >
            Voltar para revisar pedido
          </button>
        </div>
      );
    }

    if (stage === "CARD_FORM") {
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-4" data-testid="card-form-area">
          <p className="mb-1 text-sm font-bold text-gray-800">Pagamento com cartão</p>
          <p className="mb-3 text-[11px] text-gray-400">
            Seus dados são processados com segurança e não passam pelo restaurante.
          </p>

          {/* The operator mounts its card fields inside its container (iframe). */}
          {cardCheckout?.provider === "mercadopago" ? (
            <div
              id="mp-card-container"
              className={cardStatus === "verifying" ? "pointer-events-none opacity-60" : ""}
            />
          ) : (
            <div
              id="sumup-card-container"
              className={cardStatus === "verifying" ? "pointer-events-none opacity-60" : ""}
            />
          )}

          {cardStatus === "verifying" && (
            <p className="mt-3 text-center text-xs text-gray-500">Confirmando pagamento…</p>
          )}
          {cardStatus === "pending" && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
              Estamos confirmando seu pagamento. Isso pode levar alguns segundos…
            </p>
          )}
          {cardStatus === "failed" && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
              Não foi possível concluir. Confira os dados do cartão e tente novamente.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setCardCheckout(null);
              setCardStatus("form");
              setOrderId(null);
              try { localStorage.removeItem(ACTIVE_ORDER_KEY); } catch { /* ignore */ }
              setStage("REVIEW_ORDER");
            }}
            className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
          >
            Voltar para revisar pedido
          </button>
        </div>
      );
    }

    if (stage === "DONE") {
      return (
        <OrderTrackingPanel
          data={orderTrackingData}
          brandColor={pc}
          onNewOrder={() => {
            try { localStorage.removeItem(ACTIVE_ORDER_KEY); } catch { /* ignore */ }
            setOrderTrackingData(null);
            setActiveOrderId(null);
            setShowActiveBanner(false);
            setOrderId(null);
            window.location.reload();
          }}
        />
      );
    }

    return null;
  }

  // ── Input area ────────────────────────────────────────────────────
  // Text input is hidden during the two entry phases (identifying / choosing) —
  // those phases own the bottom control surface with their own dedicated panels.
  // Sem o Garçom, o composer de BROWSE ("Peça uma sugestão…") é uma caixa que
  // ninguém responde — some. O input de ASK_NAME fica: é o funil operacional
  // pedindo o nome, não conversa com IA.
  const showInput = (stage === "BROWSE" && entryPhase === "browsing" && aiIncluded)
    || stage === "ASK_NAME";
  const inputPlaceholder =
    stage === "ASK_NAME"        ? "Seu nome…" :
    humanMode                   ? "Digite sua mensagem para o atendente…" :
    "Peça uma sugestão…";

  // ── Render ────────────────────────────────────────────────────────
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  // Extracted: header (shared between mobile and desktop — rendered once)
  const header = (
    <div className="shrink-0 flex items-center gap-2 px-4 py-3 shadow" style={{ backgroundColor: sc }}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={restaurantName} className="h-9 w-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white leading-none" style={{ backgroundColor: pc }}>
          {restaurantName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{restaurantName}</p>
        <p className="text-[10px] text-green-200">
          {ui === "thinking" ? "digitando…" : "online"}
        </p>
      </div>

      {/* Social/contact icons — only rendered when the restaurant has the link configured */}
      {buildInstagramUrl(instagramUrl) && (
        <a
          href={buildInstagramUrl(instagramUrl)!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir Instagram"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:text-white active:scale-90"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
          </svg>
        </a>
      )}
      {buildTikTokUrl(tiktokUrl) && (
        <a
          href={buildTikTokUrl(tiktokUrl)!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir TikTok"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:text-white active:scale-90"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34v-7a8.16 8.16 0 0 0 4.77 1.52V6.37a4.85 4.85 0 0 1-1-.32z"/>
          </svg>
        </a>
      )}
      {buildWhatsAppUrl(phone) && (
        <a
          href={buildWhatsAppUrl(phone)!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:text-white active:scale-90"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
          </svg>
        </a>
      )}

      <button
        onClick={() => setCartOpen(true)}
        aria-label={cartCount > 0 ? `Ver carrinho — ${cartCount} ${cartCount === 1 ? "item" : "itens"}` : "Carrinho vazio"}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center text-white transition active:scale-90"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        {cartCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white">
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        )}
      </button>
    </div>
  );

  return (
    <div data-testid="phone-frame" data-stage={stage} className="fixed inset-0 flex flex-col lg:flex-row bg-[#ece5dd]" style={{ '--brand-primary': pc, '--brand-secondary': sc } as React.CSSProperties}>

      {/* ═══════════════════════════════════════════════════════════
          LEFT PANEL — Chat
          Mobile : flex-1 (full width, menu stacked below)
          Desktop: fixed 420px–460px wide column
      ═══════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0
                      lg:flex-none lg:w-1/2 lg:shrink-0
                      lg:border-r lg:border-gray-200
                      lg:shadow-[2px_0_12px_rgba(0,0,0,0.07)]">

        {header}

        {/* Emergency pause banner — overrides business hours */}
        {isOrderingPaused && (
          <div className="mx-3 mt-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex gap-2">
            <span className="text-base shrink-0 mt-0.5">⏸</span>
            <span>
              {"Pedidos pausados temporariamente."}
              {pauseReason ? ` ${pauseReason}.` : ""}
              {pausedUntil && new Date(pausedUntil) > new Date()
                ? ` Reabrimos às ${new Date(pausedUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
                : ""}
              {" Você pode explorar o cardápio enquanto isso."}
            </span>
          </div>
        )}

        {/* Closed banner — shown when the restaurant is outside business hours */}
        {!restaurantIsOpen && !isOrderingPaused && (
          <div className="mx-3 mt-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex gap-2">
            <span className="text-base shrink-0 mt-0.5">🕐</span>
            <span>
              {closedMessage
                ? `${closedMessage} Você pode explorar o cardápio, mas pedidos ficam pausados até reabrirmos.`
                : "Estamos fechados no momento. Você pode explorar o cardápio, mas pedidos são aceitos somente durante o horário de funcionamento."}
            </span>
          </div>
        )}

        {/* Identity strip — thin bar shown when customer is recognised; taps open
            the customer area (dados, endereços, cupons). */}
        {entryPhase === "browsing" && (identifiedName || identifiedPhone) && (
          <CustomerIdentityStrip
            slug={slug}
            customerId={resolvedCustomerId}
            authToken={authToken}
            name={identifiedName}
            displayPhone={identifiedPhone}
            onReset={handleResetIdentity}
          />
        )}

        {/* Birthday prompt — identified customer with no birthday on file (CRM mimo) */}
        {entryPhase === "browsing" && resolvedCustomerId && (
          <BirthdayPrompt slug={slug} customerId={resolvedCustomerId} name={identifiedName ?? customerName} />
        )}

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#ece5dd]">

          {/* WhatsApp token validation — brief loading state before phone prompt */}
          {entryPhase === "wa-validating" && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm flex items-center gap-2.5 text-sm text-gray-600">
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
                Identificando seu atendimento...
              </div>
            </div>
          )}

          {/* Phone entry inside chat — doesn't block menu on desktop */}
          {entryPhase === "identifying" && (
            <>
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-sm leading-relaxed shadow-sm text-gray-900">
                  Olá! 👋 Informe seu WhatsApp para identificarmos seu cadastro. 📱
                </div>
              </div>
              <div className="flex justify-start">
                <PhoneEntryCard slug={slug} onIdentified={handlePhoneIdentified} />
              </div>
            </>
          )}

          {/* Repeat-order agora é um botão "Pedir novamente" ao lado de "Quero
              uma sugestão" na abertura (abre a categoria "Comprar novamente") —
              não é mais um balão separado. */}

          {messages.map((msg) => (
            <Bubble
              key={msg.id}
              msg={msg}
              onOptionSelect={handleOptionSelect}
              onItemAdd={(item) => {
                // Product cards rendered inside an AI chat bubble are Foocci
                // suggestion cards → attribute the add as an upsell.
                if (item.hasVariants || item.optionGroups.length > 0 || item.extras.some((e) => e.price > 0))
                  openProduct(item, true);
                else handleItemAdd(item, true);
              }}
            />
          ))}

          {/* Passive permission prompt — soft ask before AI engages */}
          {aiPermState === "pending" && stage === "BROWSE" && entryPhase === "browsing" && (
            <div className="flex justify-start" data-testid="waiter-permission-prompt">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white shadow-sm px-4 py-3">
                <p className="text-sm text-gray-900 mb-3 leading-relaxed">
                  Quer ajuda para escolher? 😊
                </p>
                <div className="flex flex-col gap-1.5">
                  <button
                    data-testid="waiter-permission-accept"
                    onClick={handlePermissionAccept}
                    className="w-full rounded-xl py-2 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Me sugere algo ✨
                  </button>
                  <button
                    data-testid="waiter-permission-decline"
                    onClick={handlePermissionDecline}
                    className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Agora não
                  </button>
                </div>
              </div>
            </div>
          )}


          {ui === "thinking" && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Desktop cart summary — below chat, above input, desktop + BROWSE + cart */}
        {stage === "BROWSE" && cartCount > 0 && (
          <div className="hidden lg:block shrink-0 border-t border-gray-100 bg-white px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900">
                Carrinho &middot; {cartCount} {cartCount === 1 ? "item" : "itens"}
              </p>
              <button
                onClick={() => setCartOpen(true)}
                className="text-xs font-medium text-green-600 hover:underline"
              >
                Editar
              </button>
            </div>
            <div className="mb-3 max-h-[120px] space-y-1 overflow-y-auto">
              {cart.map((item) => (
                <div key={item.id} className="text-xs">
                  <div className="flex justify-between">
                    <span className="min-w-0 truncate text-gray-700">
                      {item.qty}&times; {item.name}
                    </span>
                    <span className="ml-2 shrink-0 font-medium text-gray-600">
                      R$ {(item.price * item.qty).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                  {(item.selectedOptions?.length || item.selectedExtras?.length || item.notes) && (
                    <p className="text-[10px] text-gray-400 line-clamp-1 ml-3">
                      {[
                        item.selectedOptions?.map((o) => `${o.qty}× ${o.optionName}`).join(", "),
                        item.selectedExtras?.map((e) => `${e.qty}× ${e.name}`).join(", "),
                        item.notes,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={handleFinalizeClick}
              className={`flex w-full items-center justify-between rounded-2xl px-5 py-2.5 text-sm font-bold text-white transition-colors ${
                upsellPending
                  ? "bg-gray-400 hover:bg-gray-500"
                  : "hover:opacity-90"
              }`}
              style={!upsellPending ? { backgroundColor: 'var(--brand-primary)' } : undefined}
            >
              <span>{upsellPending ? "Continuar →" : "Finalizar pedido"}</span>
              <span>R$ {cartTotal.toFixed(2).replace(".", ",")}</span>
            </button>
          </div>
        )}

        {/* Mobile: promotion banners — above product area */}
        {stage === "BROWSE" && entryPhase === "browsing" && banners.length > 0 && (
          <div className="lg:hidden shrink-0 flex flex-col gap-2 px-3 pt-2">
            {banners.map((b) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={b.id}
                src={b.imageUrl}
                alt={b.name}
                className="w-full rounded-xl object-cover shadow-sm"
                style={{ aspectRatio: "3/1" }}
              />
            ))}
          </div>
        )}

        {/* Mobile: unified product area — suggestions OR category items, never both */}
        {stage === "BROWSE" && entryPhase === "browsing" && (
          <div data-testid="browse-area" className="lg:hidden shrink-0 border-t border-gray-100 bg-gray-50">
            {suggestedProducts.length > 0 ? (
              <div className="px-3 pt-2 pb-1" data-testid="waiter-suggestion-grid">
                <div
                  className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none" }}
                >
                  {suggestedProducts.map((item) => (
                    <div key={item.id} className="relative shrink-0">
                      {pinnedCardId === item.id && (
                        <span className="absolute -top-1 -right-1 z-10 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">⭐</span>
                      )}
                      <ProductCard
                        item={item}
                        qty={itemCartQty(item, cart)}
                        onAdd={() => (item.hasVariants || item.optionGroups.length > 0 || item.extras.some((e) => e.price > 0)) ? openProduct(item, true) : handleItemAdd(item, true)}
                        onOpen={() => openProduct(item, true)}
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { setSuggestedProducts([]); setPinnedCardId(null); }}
                  className="py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← Voltar ao cardápio
                </button>
              </div>
            ) : currentCategoryItems.length > 0 ? (
              <div className="px-3 pt-1.5 pb-1">
                {selectedCategory?.description && (
                  <p className="mb-1.5 text-[11px] leading-snug text-gray-500 line-clamp-2">
                    {selectedCategory.description}
                  </p>
                )}
                <div
                  ref={mobileProductsRef}
                  className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none" }}
                >
                  {currentCategoryItems.map((item) => (
                    <ProductCard
                      key={item.id}
                      item={item}
                      qty={itemCartQty(item, cart)}
                      onAdd={() => (item.hasVariants || item.optionGroups.length > 0 || item.extras.some((e) => e.price > 0)) ? openProduct(item, false) : handleItemAdd(item, false)}
                      onOpen={() => openProduct(item, false)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Mobile: category carousel — compact, sticky above CartBar/input */}
        {stage === "BROWSE" && entryPhase === "browsing" && displayCategories.length > 0 && (
          <div className="lg:hidden relative shrink-0">
            <div
              ref={categoryBarRef}
              className="flex overflow-x-auto gap-2 border-t border-gray-200 bg-white px-3 py-1.5 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }}
            >
              {displayCategories.map((cat) => (
                <button
                  key={cat.id}
                  data-testid={`category-tab-${cat.id}`}
                  onClick={() => { setSuggestedProducts([]); handleCategorySelect(cat); }}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium min-h-[36px] transition-all ${
                    selectedCategoryId === cat.id
                      ? "bg-gray-700 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95"
                  }`}
                >
                  {categoryEmoji(cat.name)} {cat.name}
                </button>
              ))}
            </div>
            {/* Fade hint: hints that more categories exist off-screen to the right */}
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent transition-opacity duration-200"
              style={{ opacity: categoryFadeEnd ? 1 : 0 }}
            />
          </div>
        )}

        {/* Mobile: CartBar — only visible once customer is identified */}
        {stage === "BROWSE" && entryPhase === "browsing" && (
          <div className="lg:hidden">
            <CartBar cart={cart} onFinalize={handleFinalizeClick} upsellPending={upsellPending} />
          </div>
        )}

        {/* Checkout panels (address / payment / review / done) */}
        {renderCheckoutPanel()}

        {/* Human-mode banner — operator took over from Atendimento */}
        {cartRestored && (
          <div className="shrink-0 flex items-center gap-2 bg-green-50 border-t border-green-200 px-4 py-2 text-xs font-medium text-green-800">
            <span>🛒</span>
            <span>Seu carrinho foi restaurado com os itens anteriores.</span>
            <button type="button" className="ml-auto text-green-600 underline" onClick={() => setCartRestored(false)}>fechar</button>
          </div>
        )}
        {humanMode && (
          <div className="shrink-0 flex items-center gap-2 bg-amber-50 border-t border-amber-200 px-4 py-2 text-xs font-medium text-amber-800">
            <span>👩‍💼</span>
            <span>Atendimento humano ativo. A equipe da loja assumiu a conversa.</span>
          </div>
        )}

        {/* Text input */}
        {/* SEM MICROFONE, DE PROPÓSITO (05/08/2026 — ver docs/agents/interface/oficina.md).
            Todo chat do PAINEL ganhou ditado por voz via @/components/voice. Aqui não:
            esta é a superfície PÚBLICA (loja do cliente final) e a rota de transcrição
            (/api/help/transcribe) é paga por chamada e hoje só autoriza sessão de
            lojista. Ligar o microfone aqui significaria expor uma rota que custa
            dinheiro para a internet inteira — decisão de produto e de custo, não de
            interface. Quando existir uma rota pública com limite por sessão/telefone,
            o botão entra usando o MESMO gancho, sem implementação nova. */}
        {showInput && (
          <form
            onSubmit={handleSubmit}
            className="shrink-0 flex items-center gap-2 bg-white px-3 py-2 border-t border-gray-100"
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={inputPlaceholder}
              style={{ fontSize: "16px" }}
              className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 leading-snug text-gray-900 placeholder-gray-400 focus:border-[#25d366] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || ui === "thinking"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-white shadow disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              ➤
            </button>
          </form>
        )}

        {/* Back to browse */}
        {stage !== "BROWSE" && stage !== "DONE" && stage !== "PAYMENT_LINK" && (
          <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-1.5 text-center">
            <button onClick={handleBackToBrowse} className="text-xs text-gray-400 hover:text-gray-600">
              ← Voltar ao cardápio
            </button>
          </div>
        )}
      </div>
      {/* ═══════════════ end LEFT PANEL ═══════════════ */}

      {/* ═══════════════════════════════════════════════════════════
          RIGHT PANEL — Menu (desktop only, hidden on mobile)
      ═══════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-1/2 flex-col overflow-hidden bg-gray-50 min-w-0">
        {stage === "BROWSE" && entryPhase === "browsing" ? (
          <>
            {/* Product area — fills available space, scrollable */}
            <div ref={desktopProductsRef} className="flex-1 overflow-y-auto p-5">
              {/* Desktop promotion banners */}
              {banners.length > 0 && (
                <div className="mb-4 flex flex-col gap-2">
                  {banners.map((b) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={b.id}
                      src={b.imageUrl}
                      alt={b.name}
                      className="w-full rounded-xl object-cover shadow-sm"
                      style={{ aspectRatio: "3/1" }}
                    />
                  ))}
                </div>
              )}

              {/* Unified product display — suggestions OR category items, never both */}
              {suggestedProducts.length > 0 ? (
                <>
                  <div className="mb-3">
                    <button
                      onClick={() => { setSuggestedProducts([]); setPinnedCardId(null); }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      ← Voltar ao cardápio
                    </button>
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                    {suggestedProducts.map((item) => (
                      <div key={item.id} className="relative">
                        {pinnedCardId === item.id && (
                          <span className="absolute top-2 right-2 z-10 rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-bold text-white shadow">⭐ Sugestão</span>
                        )}
                        <DesktopProductCard
                          item={item}
                          qty={itemCartQty(item, cart)}
                          onAdd={() => (item.hasVariants || item.optionGroups.length > 0 || item.extras.some((e) => e.price > 0)) ? openProduct(item, true) : handleItemAdd(item, true)}
                          onOpen={() => openProduct(item, true)}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : currentCategoryItems.length > 0 ? (
                <>
                  {selectedCategory?.description && (
                    <p className="mb-3 text-sm leading-snug text-gray-500 line-clamp-2">
                      {selectedCategory.description}
                    </p>
                  )}
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                    {currentCategoryItems.map((item) => (
                      <DesktopProductCard
                        key={item.id}
                        item={item}
                        qty={itemCartQty(item, cart)}
                        onAdd={() => (item.hasVariants || item.optionGroups.length > 0 || item.extras.some((e) => e.price > 0)) ? openProduct(item, false) : handleItemAdd(item, false)}
                        onOpen={() => openProduct(item, false)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-gray-400">Nenhum item nesta categoria.</p>
                </div>
              )}
            </div>

            {/* Category nav — compact, sticky at bottom above the scrollable grid */}
            <div className="shrink-0 flex flex-wrap items-center gap-2 border-t border-gray-100 bg-white px-5 py-2.5">
              {displayCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setSuggestedProducts([]); handleCategorySelect(cat); }}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                    selectedCategoryId === cat.id
                      ? "bg-gray-700 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95"
                  }`}
                >
                  {categoryEmoji(cat.name)} {cat.name}
                </button>
              ))}
            </div>
          </>
        ) : stage === "BROWSE" ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="text-sm text-gray-400">Informe seu WhatsApp no chat para ver o cardápio 📱</p>
          </div>
        ) : (
          /* Checkout in progress — right panel shows context */
          <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl">
              🛒
            </div>
            <div>
              <p className="text-base font-bold text-gray-800">Finalizando seu pedido</p>
              <p className="mt-1 text-sm text-gray-500">
                Siga os passos abaixo para concluir seu pedido.
              </p>
            </div>
            {stage !== "DONE" && (
              <button
                onClick={handleBackToBrowse}
                className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ← Voltar ao cardápio
              </button>
            )}
          </div>
        )}
      </div>
      {/* ═══════════════ end RIGHT PANEL ═══════════════ */}

      {/* Product modal */}
      {selectedProduct && (
        <ProductModal
          item={selectedProduct}
          qty={itemCartQty(selectedProduct, cart)}
          onAdd={() => {
            handleItemAdd(selectedProduct, selectedUpsellRef.current);
            setSelectedProduct(null);
          }}
          onAddCustomized={(notes, selectedOptions, selectedExtras) =>
            handleCustomizedAdd(selectedProduct, notes, selectedOptions, selectedExtras, selectedUpsellRef.current)
          }
          onAddVariant={(variant) => handleVariantAdd(selectedProduct, variant, selectedUpsellRef.current)}
          cart={cart}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          onIncrement={(id) =>
            setCart((prev) => prev.map((c) => c.id === id ? { ...c, qty: c.qty + 1 } : c))
          }
          onDecrement={(id) =>
            setCart((prev) => prev.map((c) => c.id === id ? { ...c, qty: Math.max(1, c.qty - 1) } : c))
          }
          onRemove={(id) => setCart((prev) => prev.filter((c) => c.id !== id))}
          onFinalize={handleFinalizeClick}
          onClose={() => setCartOpen(false)}
        />
      )}

      <style jsx>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
