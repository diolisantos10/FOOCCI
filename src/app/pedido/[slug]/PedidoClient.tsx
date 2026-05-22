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
import { buildWhatsAppUrl, buildInstagramUrl, buildTikTokUrl } from "@/lib/social";

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

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  imageUrl: string | null;
  hasVariants: boolean;
  ingredients: string | null;
  servingSize: number | null;
  portionInfo: string | null;
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
  selectedOptions?: SelectedOption[];
  selectedExtras?: SelectedExtra[];
}

type HistoryEntry = { role: "user" | "assistant"; content: string };
type UIState = "idle" | "thinking";

type Stage =
  | "BROWSE"
  | "DELIVERY_TYPE"
  | "CEP_INPUT"
  | "ADDRESS_COMPLETE"
  | "ADDRESS_CONFIRM"
  | "ASK_NAME"
  | "PAYMENT"
  | "PAYMENT_METHOD"
  | "ONLINE_METHOD_SELECT"
  | "REVIEW_ORDER"
  | "PAYMENT_LINK"
  | "DONE";

type PaymentMode = "pay_now" | "pay_on_delivery" | "pay_on_pickup";
type PaymentMethodSub = "card_machine" | "pix_in_person" | "cash";

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
  deliveryFee?: number | null;
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }

function formatTime(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function categoryEmoji(name: string): string {
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
  DELIVERY_TYPE:    "Vai receber em casa ou prefere retirar? 👇",
  CEP_INPUT:        "Qual é o seu CEP? 📍",
  ADDRESS_COMPLETE: "Confirme o endereço de entrega 👇",
  ADDRESS_CONFIRM:  "Endereço certo? Confirma para seguir 👇",
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
  if (mode === "pay_now") return "Link de pagamento";
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
            : "rounded-bl-sm bg-white text-gray-900"
        }`}
      >
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
// Thumbnail — uniform h-44 w-36. Image + name + price + add. No description.

const CARD_IMG_H = "h-[72px]"; // compact image zone — keeps browsing carousel light

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
    /* Fixed outer size keeps the grid perfectly uniform regardless of name length */
    <div data-testid={`product-card-${item.id}`} className="flex h-44 w-36 shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

      {/* Image zone — fixed height, tappable */}
      <button onClick={onOpen} className={`block w-full shrink-0 overflow-hidden ${CARD_IMG_H}`}>
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-100 text-4xl">
            {categoryEmoji(item.name)}
          </div>
        )}
      </button>

      {/* Content zone — fills remaining height, price+button pinned to bottom */}
      <div className="flex flex-1 flex-col px-3 pb-3 pt-2">
        <p
          onClick={onOpen}
          className="cursor-pointer text-[13px] font-semibold leading-snug text-gray-900 line-clamp-2"
        >
          {item.name}
        </p>

        <div className="mt-auto flex items-center justify-between">
          <span className="text-xs font-bold text-gray-900">
            {item.hasVariants && item.variants.length > 0
              ? `A partir de R$ ${itemMinPrice(item).toFixed(2).replace(".", ",")}`
              : `R$ ${item.price.toFixed(2).replace(".", ",")}`}
          </span>
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
  const finalPrice  = item.price + optionsExtra + extrasExtra;

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
      {/* Card — full-screen on mobile, 92vh centered on desktop */}
      <div className="w-full h-full flex flex-col sm:max-w-md sm:h-[92vh] sm:rounded-2xl sm:overflow-hidden sm:shadow-2xl bg-white">

        {/* ── Image — square-ish, capped at 50 vh so content stays visible ── */}
        <div className="relative w-full shrink-0 bg-white overflow-hidden" style={{ aspectRatio: "1 / 1", maxHeight: "50vh" }}>
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 text-7xl">
              {categoryEmoji(item.name)}
            </div>
          )}

          {/* Back arrow — top left */}
          <button
            onClick={onClose}
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 active:scale-90 transition-transform text-lg"
          >
            ←
          </button>
        </div>

        {/* ── Content — scrollable ── */}
        <div className="flex-1 overflow-y-auto px-6 pt-5 pb-2">
          <h2 className="text-xl font-bold leading-snug text-gray-900">{item.name}</h2>

          {item.description && (
            <p className="mt-2 text-sm leading-relaxed text-gray-500">{item.description}</p>
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

        {/* ── Footer — price + CTA pinned to bottom ── */}
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
                <p className="text-2xl font-bold text-gray-900">
                  R$ {(isNaN(finalPrice) ? item.price : finalPrice).toFixed(2).replace(".", ",")}
                </p>
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
      {/* Image */}
      <button
        onClick={onOpen}
        className="block w-full shrink-0 overflow-hidden h-28 bg-gray-100"
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            {categoryEmoji(item.name)}
          </div>
        )}
      </button>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3">
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
          <span className="text-sm font-extrabold text-gray-900">
            {item.hasVariants && item.variants.length > 0
              ? `A partir de R$ ${itemMinPrice(item).toFixed(2).replace(".", ",")}`
              : `R$ ${item.price.toFixed(2).replace(".", ",")}`}
          </span>
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

// ── CustomerIdentityStrip ─────────────────────────────────────────────────────
// Thin bar shown below the header once the customer is identified.
// Shows "Olá, {name} · {phone}" and a "Trocar" button.

function CustomerIdentityStrip({
  name,
  displayPhone,
  onReset,
}: {
  name: string | null;
  displayPhone: string | null;
  onReset: () => void;
}) {
  if (!name && !displayPhone) return null;
  const label = name
    ? `Olá, ${name}${displayPhone ? ` · ${displayPhone}` : ""}`
    : `Cliente identificado${displayPhone ? ` · ${displayPhone}` : ""}`;
  return (
    <div className="shrink-0 flex items-center justify-between gap-2 border-b border-gray-100 bg-white/80 px-4 py-1.5">
      <p className="min-w-0 truncate text-xs text-gray-600">{label}</p>
      <button
        onClick={onReset}
        className="shrink-0 text-[11px] font-medium text-gray-400 transition-colors hover:text-gray-700"
      >
        Trocar
      </button>
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
  passivePermissionPrompt:  true,
};

// Product cards are shown only when the API returns mode "SUGGESTION" or "INTERVENTION"
// and the current stage is BROWSE. No client-side card inference from any other source.

// Passive trigger: seconds of inactivity before permission prompt fires.
const PASSIVE_TRIGGER_MS   = 5_000;  // 5 s
// After declining, how long before the prompt may appear again.
const SILENT_COOLDOWN_MS   = 5 * 60 * 1000; // 5 min

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
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <input
          type="text"
          value={comp}
          onChange={(e) => setComp(e.target.value)}
          placeholder="Complemento (apto, bloco…)"
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <input
          type="text"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Ponto de referência (opcional)"
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
  instagramUrl = null, tiktokUrl = null,
  banners = [],
  brandPrimaryColor = null, brandSecondaryColor = null,
  deliveryFee = null, deliveryMode = "simple",
  deliveryEstimatedMinutes = null, averagePreparationMinutes = null,
  ga4Id = null,
  restaurantIsOpen = true,
  closedMessage = null,
  isOrderingPaused = false,
  pauseReason = null,
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

  // ── Chat Inbox — session + conversation tracking ─────────────────
  // sessionId: stable per-tab identifier (survives re-renders, resets on new tab)
  // convId:    returned by server on first logged message, stored in sessionStorage
  const sessionIdRef = useRef<string>(uid());
  const [convId, setConvId] = useState<string | null>(null);
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

  // ── UTM + source capture — read from URL params and persist to sessionStorage ─
  const utmKey      = `foocci-utm-${slug}`;
  const viewFiredKey = `foocci-view-fired-${slug}`;

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

    // Fire MENU_VIEW once per session per restaurant
    if (!sessionStorage.getItem(viewFiredKey)) {
      sessionStorage.setItem(viewFiredKey, "1");
      fetch("/api/menu/analytics/event", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ slug, source }),
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // Products suggested by the AI — rendered in the product grid, not in chat.
  const [suggestedProducts, setSuggestedProducts] = useState<MenuItem[]>([]);
  // ID of the harmonically suggested item — shown with ⭐ in the carousel.
  const [pinnedCardId, setPinnedCardId] = useState<string | null>(null);
  // Server-side session memory — sent each turn, updated from memoryPatch responses.
  // waiterMemoryRef keeps the value always current so sendText (which has a stale
  // closure over the state) reads the latest value even before React re-renders.
  const [waiterMemory, setWaiterMemory] = useState<Partial<WaiterMemory>>({});
  const waiterMemoryRef = useRef<Partial<WaiterMemory>>({});

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

  // Effective phone: from server (WhatsApp link) or from session-stored identify response
  const effectiveCustomerPhone = knownCustomerPhone ?? storedCustomer?.phone ?? null;
  // Effective customerId: from server prop or from session-stored identify response
  const effectiveCustomerId = knownCustomerId ?? storedCustomer?.customerId ?? undefined;

  // customerName declared early so enterBrowsing / handlePhoneIdentified can reference its setter
  const [customerName, setCustomerName] = useState(
    knownCustomerName?.trim().split(/\s+/)[0] ?? storedCustomer?.name ?? "",
  );

  // ── Display phone for identity strip ──────────────────────────────
  const [identifiedPhone, setIdentifiedPhone] = useState<string | null>(
    knownCustomerPhone
      ? formatDisplayPhone(knownCustomerPhone)
      : (storedCustomer?.displayPhone ?? null),
  );

  // ── Entry / identification ─────────────────────────────────────────
  const [entryPhase, setEntryPhase] = useState<"identifying" | "browsing">(() => {
    if (typeof window === "undefined") return "browsing";
    if (sessionStorage.getItem(`foocci-entry-${slug}`)) return "browsing";
    if (knownCustomerPhone) return "browsing";
    if (storedCustomer) return "browsing";
    return "identifying";
  });
  const [identifiedName, setIdentifiedName] = useState<string | null>(
    knownCustomerName ?? storedCustomer?.name ?? null,
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
  const permPromptCountRef = useRef<number>(0);    // passive prompts shown this session (max 2)
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

  // ── Coupon state ──────────────────────────────────────────────
  const [couponInput,   setCouponInput]   = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    promotionId: string; couponCode: string; discountAmount: number;
    discountType: string; name: string;
  } | null>(null);
  const [couponError,   setCouponError]   = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [pixCopyPaste,    setPixCopyPaste]    = useState<string | null>(null);
  const [pixQrCodeBase64, setPixQrCodeBase64] = useState<string | null>(null);
  const [pixCopied,       setPixCopied]       = useState(false);
  const [orderTrackingData, setOrderTrackingData]   = useState<OrderTrackingData | null>(null);
  const [activeOrderId,     setActiveOrderId]       = useState<string | null>(null);
  const [showActiveBanner,  setShowActiveBanner]    = useState(false);
  const trackingPollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const categoryBarRef     = useRef<HTMLDivElement>(null);
  const [categoryFadeEnd, setCategoryFadeEnd] = useState(true);

  // Clear coupon when delivery method changes (channel compatibility may differ)
  useEffect(() => {
    setAppliedCoupon(null);
    setCouponError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryMethod]);

  // ── Poll payment status while in PAYMENT_LINK stage ───────────────
  useEffect(() => {
    if (stage !== "PAYMENT_LINK" || !orderId) return;
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

  const currentCategoryItems = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId)?.items ?? [],
    [categories, selectedCategoryId],
  );

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
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
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant" as const, content: "Ops! Tivemos um problema. Tente novamente.", ts: new Date() },
        ]);
      } finally {
        setUi("idle");
      }
    },
    [slug, history, deliveryMethod, address, customerName, paymentMode, paymentMethodSub, effectiveCustomerPhone, resolvedCustomerId, categories],
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

  // ── Welcome message (fires once, first time user enters browsing) ────────
  const greetedRef = useRef(
    typeof window !== "undefined" && !!sessionStorage.getItem(`foocci-entry-${slug}`)
  );
  useEffect(() => {
    if (entryPhase !== "browsing" || greetedRef.current) return;
    greetedRef.current = true;
    fireGtag("view_menu", { restaurant: restaurantName, ...getUtm() });
    const name = identifiedName;
    const base = name
      ? `Bem-vindo, ${name}! 😊\nJá deixei nosso cardápio aberto aqui pra você 👇\nSe quiser algo específico, é só me falar que eu te ajudo rapidinho.`
      : `Bem-vindo! 😊\nJá deixei nosso cardápio aberto aqui pra você 👇\nSe quiser algo específico, é só me falar que eu te ajudo rapidinho.`;
    const greeting = phone
      ? `${base}\n\nSe preferir falar direto com a loja, toque no ícone do WhatsApp no topo da tela.`
      : base;
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant" as const,
        content: greeting,
        ts: new Date(),
      },
    ]);
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
      if (permPromptCountRef.current >= 2) return; // max 2 prompts per session
      if (Date.now() < silentUntilRef.current) return;
      if (cart.reduce((s, i) => s + i.qty, 0) > 1) return;
      if (suggestedProducts.length > 0) return; // double-check inside interval
      if (guidedMode) return;
      if (Date.now() - lastActivityRef.current < PASSIVE_TRIGGER_MS) return;
      permPromptCountRef.current += 1;
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
    if (
      cart.length !== 1 ||
      aiPermState !== "idle" ||
      stage !== "BROWSE" ||
      entryPhase !== "browsing" ||
      permPromptCountRef.current >= 2 ||
      suggestedProducts.length > 0 ||
      guidedMode
    ) return;
    const t = setTimeout(() => {
      permPromptCountRef.current += 1;
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
    (item: MenuItem) => {
      const existing = cart.find((c) => c.id === item.id);
      const newCart = existing
        ? cart.map((c) => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
        : [...cart, { id: item.id, baseItemId: item.id, name: item.name, price: item.price, qty: 1 }];
      setCart(newCart);
      fireGtag("add_to_cart", { item_name: item.name, value: item.price, currency: "BRL" });
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
    (item: MenuItem, variant: MenuItemVariant) => {
      const cartId   = `${item.id}_${variant.id}`;
      const cartName = `${item.name} — ${variant.name}`;
      const existing = cart.find((c) => c.id === cartId);
      const newCart  = existing
        ? cart.map((c) => c.id === cartId ? { ...c, qty: c.qty + 1 } : c)
        : [...cart, {
            id: cartId, baseItemId: item.id, name: cartName,
            price: variant.price, qty: 1,
            variantId: variant.id, variantName: variant.name,
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
    (item: MenuItem, notes: string, selectedOptions: SelectedOption[], selectedExtras: SelectedExtra[]) => {
      const optionsExtra = selectedOptions.reduce((s, o) => s + o.priceAdjustment * o.qty, 0);
      const extrasExtra  = selectedExtras.reduce((s, e) => s + e.unitPrice * e.qty, 0);
      const finalPrice   = item.price + optionsExtra + extrasExtra;
      const hasAny       = notes.trim() || selectedOptions.length > 0 || selectedExtras.length > 0;

      let newCart: CartItem[];
      if (!hasAny) {
        const existing = cart.find((c) => c.id === item.id);
        newCart = existing
          ? cart.map((c) => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
          : [...cart, { id: item.id, baseItemId: item.id, name: item.name, price: finalPrice, qty: 1 }];
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
    pushAssistantMessage("Perfeito 😊 fica à vontade — qualquer coisa é só me chamar.");
  }, [pushAssistantMessage]);

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
          if (firstItem.hasVariants || firstItem.optionGroups.length > 0 || firstItem.extras.some((e) => e.price > 0))
            setSelectedProduct(firstItem);
          else handleItemAdd(firstItem);
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
    [cart, stage, activeUpsell, sendText, ui, suggestedProducts, handleItemAdd, pushAssistantMessage, proceedToCheckout],
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
  }, [cart, stage, entryPhase, sendText, pushAssistantMessage, aiPermState]);

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
        setStage("CEP_INPUT");
        pushUserMessage("🛵 Entrega");
        pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["CEP_INPUT"]!);
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

  const handleAddressComplete = useCallback(
    (num: string, complement: string, referencePoint: string) => {
      if (!num.trim()) return;
      setAddress((prev) => ({
        ...prev,
        number:         num.trim(),
        complement:     complement.trim(),
        referencePoint: referencePoint.trim(),
      }));
      setStage("ADDRESS_CONFIRM");
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["ADDRESS_CONFIRM"]!);
    },
    [pushAssistantMessage],
  );

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
      // Name already known — skip ASK_NAME
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

  const handlePaymentMode = useCallback(
    (mode: PaymentMode) => {
      setPaymentMode(mode);
      if (mode === "pay_now") {
        setStage("ONLINE_METHOD_SELECT");
        pushUserMessage("💳 Pagar agora — link de pagamento");
        pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["ONLINE_METHOD_SELECT"]!);
      } else {
        setStage("PAYMENT_METHOD");
        const label = mode === "pay_on_delivery" ? "🚪 Pagar na entrega" : "🏪 Pagar na retirada";
        pushUserMessage(label);
        const methodPrompt = mode === "pay_on_delivery"
          ? "Como prefere pagar na entrega? 👇"
          : "Como prefere pagar na retirada? 👇";
        pushAssistantMessage(methodPrompt);
      }
    },
    [pushUserMessage, pushAssistantMessage],
  );

  const handlePaymentMethodSub = useCallback(
    (method: PaymentMethodSub) => {
      setPaymentMethodSub(method);
      setStage("REVIEW_ORDER");
      const labels: Record<PaymentMethodSub, string> = {
        card_machine:  "💳 Cartão na maquininha",
        pix_in_person: "📱 Pix",
        cash:          "💵 Dinheiro",
      };
      pushUserMessage(labels[method]);
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
          clientDeliveryFee: deliveryMethod === "delivery" && deliveryMode !== "manual"
            ? (deliveryFee ?? 0)
            : undefined,
          couponCode:      appliedCoupon?.couponCode || undefined,
          trackingLinkId:  utm.tlid    || undefined,
          trafficSource:   utm.source  || undefined,
          trafficMedium:   utm.medium  || undefined,
          trafficCampaign: utm.campaign || undefined,
          trafficContent:  utm.content  || undefined,
        }),
      });
      const data = await res.json();
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
  }, [slug, cart, customerName, effectiveCustomerPhone, resolvedCustomerId, deliveryMethod, address, paymentMode, paymentMethodSub, ga4Id, appliedCoupon]);

  const handleOnlinePaymentSelect = useCallback(() => {
    setStage("REVIEW_ORDER");
    pushUserMessage("⚡ Pix — QR Code");
    pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["REVIEW_ORDER"]!);
  }, [pushUserMessage, pushAssistantMessage]);

  const handleCancelPix = useCallback(() => {
    setPixCopyPaste(null);
    setPixQrCodeBase64(null);
    setPixCopied(false);
    setPaymentUrl(null);
    setOrderId(null);
    try { localStorage.removeItem(ACTIVE_ORDER_KEY); } catch { /* ignore */ }
    setStage("REVIEW_ORDER");
  }, []);

  const handleApplyCoupon = useCallback(async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const sub      = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const isManFee = deliveryMethod === "delivery" && deliveryMode === "manual";
      const fee      = deliveryMethod === "delivery" && !isManFee ? (deliveryFee ?? 0) : 0;
      const res = await fetch(`/api/pedido/${slug}/validate-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          couponCode:     couponInput.trim(),
          subtotal:       sub,
          deliveryFee:    fee,
          deliveryMethod: deliveryMethod ?? "delivery",
          customerId:     resolvedCustomerId,
        }),
      });
      const data = await res.json() as {
        valid: boolean; error?: string;
        promotionId?: string; couponCode?: string; discountAmount?: number;
        discountType?: string; name?: string;
      };
      if (data.valid) {
        setAppliedCoupon({
          promotionId:    data.promotionId!,
          couponCode:     data.couponCode!,
          discountAmount: data.discountAmount!,
          discountType:   data.discountType!,
          name:           data.name!,
        });
        setCouponInput("");
      } else {
        setCouponError(data.error ?? "Cupom inválido ou expirado.");
      }
    } catch {
      setCouponError("Erro ao validar cupom. Tente novamente.");
    } finally {
      setCouponLoading(false);
    }
  }, [couponInput, cart, deliveryMethod, deliveryMode, deliveryFee, slug, resolvedCustomerId]);

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
              style={{ "--tw-ring-color": "var(--brand-primary)" } as React.CSSProperties}
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

          {/* Delivery fee — shown as soon as address is confirmed */}
          {deliveryMethod === "delivery" && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-green-50 px-3 py-1.5 text-xs">
              <span className="text-gray-600">🛵 Taxa de entrega</span>
              <span className="font-semibold text-gray-800">
                {deliveryMode === "manual"
                  ? "A combinar"
                  : deliveryFee == null
                  ? "Calculando…"
                  : deliveryFee === 0
                  ? "Grátis"
                  : `R$ ${deliveryFee.toFixed(2).replace(".", ",")}`}
              </span>
            </div>
          )}

          <p className="mb-2 text-xs text-gray-500">
            ⏱ Previsão de {deliveryMethod === "pickup" ? "retirada" : "entrega"}: <span className="font-semibold text-gray-700">{Math.max(5, etaLow)}–{etaHigh} min</span>
          </p>
          <div className="flex gap-2">
            <button
              data-testid="address-confirm-button"
              onClick={handleAddressConfirm}
              className="flex-1 rounded-xl py-2 text-sm font-bold text-white hover:opacity-90"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Confirmar endereço
            </button>
            <button
              onClick={() => {
                // Explicit address edit — clear collected address so the user
                // re-enters it from scratch (not auto-skipped by computeResumeStage).
                setAddress({ cep: "", street: "", number: "", neighborhood: "", city: "", state: "", complement: "", referencePoint: "" });
                setCepInputValue("");
                setStage("CEP_INPUT");
              }}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Editar
            </button>
          </div>
        </div>
      );
    }

    if (stage === "PAYMENT") {
      const isDelivery = deliveryMethod === "delivery";
      const isPickup = deliveryMethod === "pickup";
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3" data-testid="checkout-area">
          <p className="mb-2 text-xs font-semibold text-gray-500">Quer pagar agora ou na entrega?</p>
          <div className="flex flex-col gap-2">
            <button onClick={() => handlePaymentMode("pay_now")} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-left text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
              💳 Pagar agora — link de pagamento
            </button>
            {isDelivery && (
              <button onClick={() => handlePaymentMode("pay_on_delivery")} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100">
                🚪 Pagar na entrega
              </button>
            )}
            {isPickup && (
              <button onClick={() => handlePaymentMode("pay_on_pickup")} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100">
                🏪 Pagar na retirada
              </button>
            )}
          </div>
        </div>
      );
    }

    if (stage === "PAYMENT_METHOD") {
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3" data-testid="checkout-area">
          <p className="mb-2 text-xs font-semibold text-gray-500">{paymentMode === "pay_on_delivery" ? "Como prefere pagar na entrega?" : "Como prefere pagar na retirada?"}</p>
          <div className="flex flex-col gap-2">
            {(["card_machine", "pix_in_person", "cash"] as PaymentMethodSub[]).map((m) => {
              const labels = { card_machine: "💳 Cartão na maquininha", pix_in_person: "📱 Pix na entrega", cash: "💵 Dinheiro" };
              return (
                <button key={m} onClick={() => handlePaymentMethodSub(m)} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100">
                  {labels[m]}
                </button>
              );
            })}
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
        </div>
      );
    }

    if (stage === "REVIEW_ORDER") {
      const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const isManualFee = deliveryMethod === "delivery" && deliveryMode === "manual";
      const appliedFee  = deliveryMethod === "delivery" && !isManualFee ? (deliveryFee ?? 0) : 0;
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
                <span className="font-medium text-green-700">🏷 {appliedCoupon.couponCode}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-green-700">
                    -{discount.toFixed(2).replace(".", ",")} R$
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
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleApplyCoupon(); } }}
                  placeholder="Cupom de desconto"
                  maxLength={30}
                  className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs uppercase focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
                <button
                  type="button"
                  onClick={() => void handleApplyCoupon()}
                  disabled={couponLoading || !couponInput.trim()}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  {couponLoading ? "…" : "Aplicar"}
                </button>
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
            <p><span className="font-semibold text-gray-800">Pagamento:</span> {pmLabel}</p>
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
          <div className="mt-2 flex gap-2 justify-center">
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
              Seu pedido será enviado ao restaurante assim que o pagamento for confirmado.
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

            <button
              data-testid="cancel-pix-btn"
              type="button"
              onClick={handleCancelPix}
              className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
            >
              Cancelar pagamento e voltar
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
            </>
          ) : (
            <p className="mt-2 text-xs text-red-500">Link expirado ou erro. Recarregue a página para tentar novamente.</p>
          )}
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
  const showInput = (stage === "BROWSE" && entryPhase === "browsing")
    || stage === "ASK_NAME";
  const inputPlaceholder =
    stage === "ASK_NAME"        ? "Seu nome…" :
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

        {/* Emergency pause banner — overrides business hours, shown in red */}
        {isOrderingPaused && (
          <div className="mx-3 mt-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex gap-2">
            <span className="text-base shrink-0 mt-0.5">🚫</span>
            <span>
              {"Pedidos pausados temporariamente."}
              {pauseReason ? ` ${pauseReason}.` : ""}
              {" Você pode explorar o cardápio, mas pedidos estão pausados no momento."}
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

        {/* Identity strip — thin bar shown when customer is recognised */}
        {entryPhase === "browsing" && (identifiedName || identifiedPhone) && (
          <CustomerIdentityStrip
            name={identifiedName}
            displayPhone={identifiedPhone}
            onReset={handleResetIdentity}
          />
        )}

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#ece5dd]">

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

          {messages.map((msg) => (
            <Bubble
              key={msg.id}
              msg={msg}
              onOptionSelect={handleOptionSelect}
              onItemAdd={(item) => {
                if (item.hasVariants || item.optionGroups.length > 0 || item.extras.some((e) => e.price > 0))
                  setSelectedProduct(item);
                else handleItemAdd(item);
              }}
            />
          ))}

          {/* Passive permission prompt — soft ask before AI engages */}
          {aiPermState === "pending" && stage === "BROWSE" && entryPhase === "browsing" && (
            <div className="flex justify-start" data-testid="waiter-permission-prompt">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white shadow-sm px-4 py-3">
                <p className="text-sm text-gray-900 mb-3 leading-relaxed">
                  Posso te sugerir algo que combine com o que você está vendo? 👇
                </p>
                <div className="flex gap-2">
                  <button
                    data-testid="waiter-permission-accept"
                    onClick={handlePermissionAccept}
                    className="flex-1 rounded-xl py-2 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Quero sugestão ✨
                  </button>
                  <button
                    data-testid="waiter-permission-decline"
                    onClick={handlePermissionDecline}
                    className="flex-1 rounded-xl py-2 text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-all active:scale-95"
                  >
                    Prefiro continuar
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
                        onAdd={() => (item.hasVariants || item.optionGroups.length > 0 || item.extras.some((e) => e.price > 0)) ? setSelectedProduct(item) : handleItemAdd(item)}
                        onOpen={() => setSelectedProduct(item)}
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
                  className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none" }}
                >
                  {currentCategoryItems.map((item) => (
                    <ProductCard
                      key={item.id}
                      item={item}
                      qty={itemCartQty(item, cart)}
                      onAdd={() => (item.hasVariants || item.optionGroups.length > 0 || item.extras.some((e) => e.price > 0)) ? setSelectedProduct(item) : handleItemAdd(item)}
                      onOpen={() => setSelectedProduct(item)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Mobile: category carousel — compact, sticky above CartBar/input */}
        {stage === "BROWSE" && entryPhase === "browsing" && categories.length > 0 && (
          <div className="lg:hidden relative shrink-0">
            <div
              ref={categoryBarRef}
              className="flex overflow-x-auto gap-2 border-t border-gray-200 bg-white px-3 py-1.5 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }}
            >
              {categories.map((cat) => (
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

        {/* Text input */}
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
            <div className="flex-1 overflow-y-auto p-5">
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
                          onAdd={() => (item.hasVariants || item.optionGroups.length > 0 || item.extras.some((e) => e.price > 0)) ? setSelectedProduct(item) : handleItemAdd(item)}
                          onOpen={() => setSelectedProduct(item)}
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
                        onAdd={() => (item.hasVariants || item.optionGroups.length > 0 || item.extras.some((e) => e.price > 0)) ? setSelectedProduct(item) : handleItemAdd(item)}
                        onOpen={() => setSelectedProduct(item)}
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
              {categories.map((cat) => (
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
            handleItemAdd(selectedProduct);
            setSelectedProduct(null);
          }}
          onAddCustomized={(notes, selectedOptions, selectedExtras) =>
            handleCustomizedAdd(selectedProduct, notes, selectedOptions, selectedExtras)
          }
          onAddVariant={(variant) => handleVariantAdd(selectedProduct, variant)}
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
