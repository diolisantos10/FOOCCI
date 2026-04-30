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

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: Date;
  suggestedItemName?: string;
  /** V2: product IDs to render as suggestion cards below this message. */
  cards?: string[];
  /** Quick-reply buttons rendered below the message — tapping sends the text as user input. */
  options?: string[];
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

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

type HistoryEntry = { role: "user" | "assistant"; content: string };
type UIState = "idle" | "thinking";

type Stage =
  | "BROWSE"
  | "DELIVERY_TYPE"
  | "ADDRESS_INPUT"
  | "ADDRESS_DETAILS"
  | "ADDRESS_CONFIRM"
  | "ASK_NAME"
  | "PAYMENT"
  | "PAYMENT_METHOD"
  | "REVIEW_ORDER"
  | "PAYMENT_LINK"
  | "DONE";

type PaymentMode = "pay_now" | "pay_on_delivery" | "pay_on_pickup";
type PaymentMethodSub = "card_machine" | "pix_in_person" | "cash";

interface Address {
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
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
  knownDefaultAddress?: { street: string; number: string; neighborhood: string; complement: string } | null;
  /** Instagram profile URL — shown as icon in ordering header if provided. */
  instagramUrl?: string | null;
  /** TikTok profile URL — shown as icon in ordering header if provided. */
  tiktokUrl?: string | null;
  /** Active promotion banners to show at the top of the menu. */
  banners?: PromoBanner[];
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
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

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findBeverageCat(cats: MenuCategory[]) {
  return cats.find((c) => {
    const n = norm(c.name);
    return n.includes("bebida") || n.includes("drink") || n.includes("suco") || n.includes("refri");
  }) ?? null;
}

function findDessertCat(cats: MenuCategory[]) {
  return cats.find((c) => {
    const n = norm(c.name);
    return n.includes("sobremesa") || n.includes("doce");
  }) ?? null;
}

function itemCartQty(item: MenuItem, cart: CartItem[]): number {
  if (!item.hasVariants) return cart.find((c) => c.id === item.id)?.qty ?? 0;
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
  DELIVERY_TYPE:   "Vai receber em casa ou prefere retirar? 👇",
  ADDRESS_INPUT:   "Rua e número, por favor 👇",
  ADDRESS_DETAILS: "Bairro (e complemento, se tiver) 👇",
  ADDRESS_CONFIRM: "Endereço certo? Confirma para seguir 👇",
  ASK_NAME:        "Como posso te chamar? 😊",
  PAYMENT:         "Quase lá! Como quer pagar? 👇",
  PAYMENT_METHOD:  "Escolhe a forma de pagamento 👇",
  REVIEW_ORDER:    "Quase pronto! Confere e confirma 👇",
};

function formatAddress(a: Address): string {
  const line1 = [a.street, a.number].filter(Boolean).join(", ");
  const line2 = [a.neighborhood, a.complement].filter(Boolean).join(" — ");
  return [line1, line2].filter(Boolean).join(", ");
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
    if (!address.street.trim())        return "ADDRESS_INPUT";
    if (!address.neighborhood.trim())  return "ADDRESS_DETAILS";
  }
  if (!customerName.trim()) return "ASK_NAME";
  if (!paymentMode)         return "PAYMENT";
  if (paymentMode !== "pay_now" && !paymentMethodSub) return "PAYMENT_METHOD";
  return "REVIEW_ORDER";
}

// ── Bubble ────────────────────────────────────────────────────────────────────

function Bubble({
  msg,
  onOptionSelect,
}: {
  msg: ChatMessage;
  onOptionSelect?: (text: string) => void;
}) {
  const isUser = msg.role === "user";
  if (msg.content.trim() === "") return null;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
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
          <div className="mt-2.5 flex flex-wrap gap-2">
            {msg.options.map((opt) => (
              <button
                key={opt}
                onClick={() => onOptionSelect(opt)}
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-green-50 hover:border-green-300 hover:text-green-800 active:scale-95 transition-all"
              >
                {opt}
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

const CARD_IMG_H = "h-[72px]"; // fixed image zone — same with or without photo

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
    <div className="flex h-44 w-36 shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

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
  onAddVariant,
  cart,
  onClose,
}: {
  item: MenuItem;
  qty: number;
  onAdd: () => void;
  onAddVariant?: (variant: MenuItemVariant) => void;
  cart?: CartItem[];
  onClose: () => void;
}) {
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  return (
    <div
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
      {/* Card — full-screen on mobile, centered on desktop */}
      <div className="w-full h-full flex flex-col sm:max-w-md sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:overflow-hidden sm:shadow-2xl bg-white">

        {/* ── Image — square, flush to top of screen ── */}
        <div className="relative w-full aspect-square shrink-0">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 text-7xl">
              {categoryEmoji(item.name)}
            </div>
          )}

          {/* Back arrow — top left, same as iFood */}
          <button
            onClick={onClose}
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 active:scale-90 transition-transform text-lg"
          >
            ←
          </button>
        </div>

        {/* ── Content — name + description scroll, variants if any ── */}
        <div className="flex-1 overflow-y-auto px-6 pt-5 pb-2">
          <h2 className="text-xl font-bold leading-snug text-gray-900">{item.name}</h2>

          {item.description && (
            <p className="mt-2 text-sm leading-relaxed text-gray-500">{item.description}</p>
          )}

          {item.hasVariants && item.variants.length > 0 && (
            <div className="mt-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Escolha uma opção
              </p>
              <div className="space-y-2">
                {item.variants.filter((v) => v.price > 0 && v.name.trim()).map((v) => {
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
        </div>

        {/* ── Footer — price + CTA pinned to bottom ── */}
        <div className="shrink-0 px-6 pb-8 pt-4 border-t border-gray-100 bg-white">
          {!item.hasVariants ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Preço</p>
                <p className="text-2xl font-bold text-gray-900">
                  R$ {item.price.toFixed(2).replace(".", ",")}
                </p>
              </div>
              <button
                onClick={onAdd}
                className="flex-1 rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {qty > 0 ? `+ Adicionar (${qty} no carrinho)` : "Adicionar ao pedido"}
              </button>
            </div>
          ) : qty > 0 ? (
            <p className="text-center text-xs text-gray-400">
              {qty} {qty === 1 ? "item" : "itens"} no carrinho
            </p>
          ) : null}
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
          <span>R$ {total.toFixed(2).replace(".", ",")}</span>
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
// Shown to web (non-WhatsApp) users: lightweight phone input to identify them.

function PhoneEntryCard({
  slug,
  onIdentified,
  onSkip,
}: {
  slug: string;
  onIdentified: (name: string | null, customerId?: string) => void;
  onSkip: () => void;
}) {
  const [nameInput,  setNameInput]  = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ph = phoneInput.trim();
    if (!ph) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/qr/${slug}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: ph, name: nameInput.trim() }),
      });
      const data: { found: boolean; name?: string; customerId?: string } = await res.json();
      const resolved = data.name ?? (nameInput.trim() ? nameInput.trim().split(/\s+/)[0]! : null);
      // Persist phone + name + customerId so other pages can reuse identity
      if (resolved) {
        try {
          sessionStorage.setItem(
            `foocci-customer-${slug}`,
            JSON.stringify({ phone: ph, name: resolved, customerId: data.customerId })
          );
        } catch { /* ignore */ }
      }
      onIdentified(resolved, data.customerId);
    } catch {
      setError("Erro ao verificar. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl rounded-bl-sm bg-white shadow-sm px-4 py-4 max-w-sm w-full">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Identificação rápida
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        {/* Name */}
        <input
          type="text"
          inputMode="text"
          autoCapitalize="words"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Seu nome — Ex: João Silva"
          style={{ fontSize: "16px" }}
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#25d366] focus:outline-none"
        />
        {/* Phone */}
        <input
          type="tel"
          inputMode="numeric"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          placeholder="Seu WhatsApp — Ex: (11) 99999-9999"
          style={{ fontSize: "16px" }}
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#25d366] focus:outline-none"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={!phoneInput.trim() || loading}
          className="rounded-xl py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40 transition-all"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {loading ? "Verificando…" : "Continuar →"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Pular →
        </button>
      </form>
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

// Events whose card results may be promoted to the product grid.
// ON_USER_MESSAGE: user explicitly asked for something.
// Checkout-intent upsell uses upsellOfferedSnap, handled separately.
const CARD_ALLOWED_EVENTS = new Set<string>(["ON_USER_MESSAGE"]);

// Passive trigger: seconds of inactivity before permission prompt fires.
const PASSIVE_TRIGGER_MS   = 5_000;  // 5 s
// After declining, how long before the prompt may appear again.
const SILENT_COOLDOWN_MS   = 5 * 60 * 1000; // 5 min

// ── Main component ────────────────────────────────────────────────────────────

export function PedidoClient({
  slug, restaurantName, logoUrl, phone, categories,
  knownCustomerPhone = null, knownCustomerName = null,
  knownCustomerId = null, knownDefaultAddress = null,
  instagramUrl = null, tiktokUrl = null,
  banners = [],
  brandPrimaryColor = null, brandSecondaryColor = null,
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

  // ── Cart ──────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  // Products suggested by the AI — rendered in the product grid, not in chat.
  const [suggestedProducts, setSuggestedProducts] = useState<MenuItem[]>([]);

  // ── Cross-flow identity: read what /qr/[slug] already stored ──────
  const [storedCustomer] = useState<{ phone: string; name: string; customerId?: string } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(`foocci-customer-${slug}`);
      return raw ? (JSON.parse(raw) as { phone: string; name: string; customerId?: string }) : null;
    } catch { return null; }
  });

  // Effective phone: from server (WhatsApp link) or from QR identification
  const effectiveCustomerPhone = knownCustomerPhone ?? storedCustomer?.phone ?? null;
  // Effective customerId: from server prop or from session-stored identify response
  const effectiveCustomerId = knownCustomerId ?? storedCustomer?.customerId ?? undefined;

  // customerName declared early so enterBrowsing / handlePhoneIdentified can reference its setter
  const [customerName, setCustomerName] = useState(
    knownCustomerName?.trim().split(/\s+/)[0] ?? storedCustomer?.name ?? "",
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

  function handlePhoneIdentified(name: string | null, customerId?: string) {
    if (customerId) setSessionCustomerId(customerId);
    enterBrowsing(name);
  }

  // ── Stage / flow ──────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("BROWSE");

  // ── AI permission state ───────────────────────────────────────────
  // idle            → timer running, prompt not yet shown
  // pending         → passive permission prompt visible (during browsing)
  // consultive      → user accepted — AI may suggest
  // silent          → user declined — AI stays quiet until cooldown
  // checkout-prompt → checkout upsell permission prompt visible
  type AIPermState = "idle" | "pending" | "consultive" | "silent" | "checkout-prompt";
  const [aiPermState, setAiPermState] = useState<AIPermState>("idle");
  const silentUntilRef    = useRef<number>(0);  // epoch ms when silence expires
  const permPromptCountRef = useRef<number>(0); // passive prompts shown this session (max 2)
  // Type of upsell pending at checkout ("drink" | "dessert")
  const [checkoutPromptType, setCheckoutPromptType] = useState<"drink" | "dessert" | null>(null);

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
  const [address, setAddress] = useState<Address>(
    knownDefaultAddress ?? { street: "", number: "", neighborhood: "", complement: "" }
  );
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [paymentMethodSub, setPaymentMethodSub] = useState<PaymentMethodSub | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

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
        }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(interval);
  }, [stage, orderId]);

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
      upsellOfferedSnap: "drink" | "dessert" | null,
      options?: {
        event?:         "ON_ENTRY" | "ON_MENU_MODE" | "ON_USER_MESSAGE" | "ON_ITEM_ADDED" | "ON_CART_UPDATED" | "ON_IDLE" | "ON_CHECKOUT_STARTED" | "AFTER_CHECKOUT";
        lastAddedId?:   string;
        silent?:        boolean;
        categoryIntro?: { name: string; description: string };
      },
    ) => {
      const event         = options?.event ?? "ON_USER_MESSAGE";
      const lastAddedId   = options?.lastAddedId;
      const silent        = options?.silent ?? false;
      const categoryIntro = options?.categoryIntro;

      setUi("thinking");
      const trimmed = text.trim();

      if (!silent && trimmed) {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "user" as const, content: trimmed, ts: new Date() },
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
          }),
        });

        const data    = await res.json();
        const reply: string    = data?.data?.reply   ?? "";
        const cards: string[]  = Array.isArray(data?.data?.cards)   ? data.data.cards   : [];
        const apiOptions: string[] = Array.isArray(data?.data?.options) ? data.data.options : [];
        // suggestedItemName (legacy name-match field) is intentionally ignored — the
        // grid renders only the exact IDs the AI returned, with no fallback substitution.

        // Promote cards to the product grid — strictly what the AI specified.
        // No fallback, no automatic fill-in, no substitution for unresolved IDs.
        const isCheckoutIntent = upsellOfferedSnap !== null;
        const allowCards =
          CARD_ALLOWED_EVENTS.has(event) ||
          (SALES_BEHAVIOR.suggestOnCheckoutIntent && isCheckoutIntent);
        if (allowCards && cards.length > 0 && stageSnap === "BROWSE") {
          const flat = categories.flatMap((c) => c.items);
          const seen = new Set<string>();
          const resolved = cards
            .filter((id) => { const first = !seen.has(id); seen.add(id); return first; })
            .map((id) => flat.find((i) => i.id === id))
            .filter((i): i is MenuItem => !!i);
          // Only update grid when at least one AI-specified product was found.
          // Never append, blend, or replace with products the AI did not name.
          if (resolved.length > 0) setSuggestedProducts(resolved);
        }

        if (reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: "assistant" as const,
              content: reply,
              ts: new Date(),
              options: apiOptions.length > 0 ? apiOptions : undefined,
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
    [slug, history, deliveryMethod, address, customerName, paymentMode, paymentMethodSub, effectiveCustomerPhone, resolvedCustomerId],
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
    const name = identifiedName;
    const greeting = name
      ? `Bem-vindo, ${name}! 😊\nJá deixei nosso cardápio aberto aqui pra você 👇\nSe quiser algo específico, é só me falar que eu te ajudo rapidinho.`
      : `Bem-vindo! 😊\nJá deixei nosso cardápio aberto aqui pra você 👇\nSe quiser algo específico, é só me falar que eu te ajudo rapidinho.`;
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
  useEffect(() => {
    if (!SALES_BEHAVIOR.passivePermissionPrompt) return;
    if (entryPhase !== "browsing" || stage !== "BROWSE") return;
    if (aiPermState !== "idle") return;

    const id = setInterval(() => {
      if (aiPermState !== "idle") return;
      if (permPromptCountRef.current >= 2) return; // max 2 prompts per session
      if (Date.now() < silentUntilRef.current) return;
      if (cart.reduce((s, i) => s + i.qty, 0) > 1) return;
      if (Date.now() - lastActivityRef.current < PASSIVE_TRIGGER_MS) return;
      permPromptCountRef.current += 1;
      setAiPermState("pending");
    }, 2_000);
    return () => clearInterval(id);
  // aiPermState and cart intentionally included — prompt must re-evaluate when they change
  }, [entryPhase, stage, aiPermState, cart]);

  // ── First-item trigger ────────────────────────────────────────────
  // When the cart reaches exactly 1 item and the user is passive (idle),
  // start a 3 s countdown then show the permission prompt.
  useEffect(() => {
    if (
      cart.length !== 1 ||
      aiPermState !== "idle" ||
      stage !== "BROWSE" ||
      entryPhase !== "browsing" ||
      permPromptCountRef.current >= 2
    ) return;
    const t = setTimeout(() => {
      permPromptCountRef.current += 1;
      setAiPermState("pending");
    }, 3_000);
    return () => clearTimeout(t);
  }, [cart.length, aiPermState, stage, entryPhase]);

  // ── Reset consultive after a suggestion is shown ("already suggested") ──
  // Once the product grid shows AI-picked cards in consultive mode, the job
  // is done — return to idle so the system goes back to observing.
  useEffect(() => {
    if (suggestedProducts.length > 0 && aiPermState === "consultive") {
      setAiPermState("idle");
    }
  }, [suggestedProducts.length, aiPermState]);

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
        : [...cart, { id: item.id, name: item.name, price: item.price, qty: 1 }];
      setCart(newCart);
      lastActivityRef.current = Date.now();
      idleFiredRef.current    = false;
      // suggestOnAdd: false — AI is not called on item add; cart updates silently.
    },
    [cart],
  );

  const handleVariantAdd = useCallback(
    (item: MenuItem, variant: MenuItemVariant) => {
      const cartId   = `${item.id}_${variant.id}`;
      const cartName = `${item.name} — ${variant.name}`;
      const existing = cart.find((c) => c.id === cartId);
      const newCart  = existing
        ? cart.map((c) => c.id === cartId ? { ...c, qty: c.qty + 1 } : c)
        : [...cart, { id: cartId, name: cartName, price: variant.price, qty: 1 }];
      setCart(newCart);
      setSelectedProduct(null);
      lastActivityRef.current = Date.now();
      idleFiredRef.current    = false;
      // suggestOnAdd: false — AI is not called on variant add; cart updates silently.
    },
    [cart],
  );

  // ── Permission prompt handlers ────────────────────────────────────

  const handlePermissionAccept = useCallback(() => {
    setAiPermState("consultive");
    // Trigger AI with ON_USER_MESSAGE so CARD_ALLOWED_EVENTS allows grid cards.
    // silent: true keeps the user bubble hidden — the prompt IS the interaction.
    sendText("me sugere algo que combina com o cardápio", cart, "BROWSE", activeUpsell, {
      event: "ON_USER_MESSAGE",
      silent: true,
    });
  }, [cart, activeUpsell, sendText]);

  const handlePermissionDecline = useCallback(() => {
    setAiPermState("silent");
    silentUntilRef.current = Date.now() + SILENT_COOLDOWN_MS;
    pushAssistantMessage("Perfeito 😊 fica à vontade — qualquer coisa é só me chamar.");
  }, [pushAssistantMessage]);

  // ── Option button handler — tapping a quick-reply acts as a user message ──
  const handleOptionSelect = useCallback(
    (text: string) => {
      if (ui === "thinking") return;
      sendText(text, cart, stage, activeUpsell);
    },
    [cart, stage, activeUpsell, sendText, ui],
  );

  // ── Checkout permission handlers ──────────────────────────────────

  const handleCheckoutPermAccept = useCallback(() => {
    const type = checkoutPromptType;
    setAiPermState("consultive");
    setCheckoutPromptType(null);
    if (type) {
      sendText("Quero finalizar o pedido", cart, "BROWSE", type);
    }
  }, [checkoutPromptType, cart, sendText]);

  const handleCheckoutPermDecline = useCallback(() => {
    setAiPermState("idle");
    setCheckoutPromptType(null);
    // Mark both upsell phases as done so the next Finalizar goes straight to checkout.
    setUpsellState((prev) => ({ ...prev, offeredDrink: true, offeredDessert: true, lastUpsellCategory: null }));
    // Proceed to checkout immediately — no need for another Finalizar tap.
    const resumeStage = computeResumeStage(deliveryMethod, address, customerName, paymentMode, paymentMethodSub);
    setStage(resumeStage);
    if (resumeStage === "DELIVERY_TYPE") {
      sendText("", cart, "BROWSE", null, { event: "ON_CHECKOUT_STARTED", silent: true });
    } else {
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT[resumeStage] ?? "Se já estiver tudo certo, pode finalizar 👇");
    }
  }, [deliveryMethod, address, customerName, paymentMode, paymentMethodSub, cart, sendText, pushAssistantMessage]);

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
    // If checkout permission prompt already showing, ignore repeated taps.
    if (aiPermState === "checkout-prompt") return;

    if (cart.length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id:      uid(),
          role:    "assistant" as const,
          content: "Adicione pelo menos um item antes de finalizar 👆",
          ts:      new Date(),
        },
      ]);
      return;
    }
    if (stage !== "BROWSE") return;

    const cartIds    = new Set(cart.map((c) => c.id));
    const drinkCat   = findBeverageCat(categories);
    const dessertCat = findDessertCat(categories);
    const hasDrink   = drinkCat   ? drinkCat.items.some((i)   => cartIds.has(i.id)) : false;
    const hasDessert = dessertCat ? dessertCat.items.some((i) => cartIds.has(i.id)) : false;

    // ── DRINK phase — permission-gated (MEDIUM behavior) ─────────────────────
    if (!hasDrink && !upsellState.offeredDrink && drinkCat) {
      setUpsellState((prev) => ({ ...prev, offeredDrink: true, lastUpsellCategory: "drink" }));
      setCheckoutPromptType("drink");
      setAiPermState("checkout-prompt");
      return;
    }

    // ── DESSERT phase — permission-gated (MEDIUM behavior) ───────────────────
    const drinkResolved = hasDrink || upsellState.offeredDrink;
    if (drinkResolved && !hasDessert && !upsellState.offeredDessert && dessertCat) {
      setUpsellState((prev) => ({ ...prev, offeredDessert: true, lastUpsellCategory: "dessert" }));
      setCheckoutPromptType("dessert");
      setAiPermState("checkout-prompt");
      return;
    }

    // ── All upsells resolved → resume from the correct checkout stage ─────────
    // If the customer previously collected some checkout data and came back to
    // browse, computeResumeStage detects the furthest completed step and jumps
    // straight there — no need to re-enter address/name/payment already given.
    setUpsellState((prev) => ({ ...prev, lastUpsellCategory: null }));
    const resumeStage = computeResumeStage(deliveryMethod, address, customerName, paymentMode, paymentMethodSub);
    setStage(resumeStage);
    if (resumeStage === "DELIVERY_TYPE") {
      // First checkout entry — emit ON_CHECKOUT_STARTED (silent, no user bubble).
      // WaiterBrainV2 returns a short deterministic bridge message; the DELIVERY_TYPE
      // panel renders the delivery/pickup buttons independently of this.
      sendText("", cart, "BROWSE", null, { event: "ON_CHECKOUT_STARTED", silent: true });
    } else {
      // Resuming a prior checkout — jump straight with the step-specific prompt.
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT[resumeStage] ?? "Se já estiver tudo certo, pode finalizar 👇");
    }
  }, [cart, categories, stage, upsellState, deliveryMethod, address, customerName, paymentMode, paymentMethodSub, sendText, pushAssistantMessage]);

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
        setStage("ADDRESS_INPUT");
        pushUserMessage("🛵 Entrega");
        pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["ADDRESS_INPUT"]!);
      }
    },
    [pushUserMessage, pushAssistantMessage, customerName],
  );

  const handleAddressInput = useCallback(
    (text: string) => {
      pushUserMessage(text);
      const { street, number } = parseStreetLine(text);
      if (!street.trim()) {
        pushAssistantMessage("Não entendi o endereço 😅 Me passa a rua e o número, ex: Rua das Flores, 123");
        return;
      }
      setAddress((prev) => ({ ...prev, street, number }));
      setStage("ADDRESS_DETAILS");
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["ADDRESS_DETAILS"]!);
    },
    [pushUserMessage, pushAssistantMessage],
  );

  const handleAddressDetails = useCallback(
    (text: string) => {
      pushUserMessage(text);
      const { neighborhood, complement } = parseNeighborhoodLine(text);
      if (!neighborhood.trim()) {
        pushAssistantMessage("Me falta o bairro 👇");
        return;
      }
      setAddress((prev) => ({ ...prev, neighborhood, complement }));
      setStage("ADDRESS_CONFIRM");
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["ADDRESS_CONFIRM"]!);
    },
    [pushUserMessage, pushAssistantMessage],
  );

  const handleAddressConfirm = useCallback(() => {
    pushUserMessage("Endereço confirmado ✓");
    if (customerName.trim()) {
      // Name already known — skip ASK_NAME
      setStage("PAYMENT");
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["PAYMENT"]!);
    } else {
      setStage("ASK_NAME");
      pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["ASK_NAME"]!);
    }
  }, [pushUserMessage, pushAssistantMessage, customerName]);

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
      pushAssistantMessage(`Perfeito, ${firstName}! 🙌 Última etapa — como quer pagar? 👇`);
    },
    [pushUserMessage, pushAssistantMessage],
  );

  const handlePaymentMode = useCallback(
    (mode: PaymentMode) => {
      setPaymentMode(mode);
      if (mode === "pay_now") {
        setStage("REVIEW_ORDER");
        pushUserMessage("💳 Pagar agora — link de pagamento");
        pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["REVIEW_ORDER"]!);
      } else {
        setStage("PAYMENT_METHOD");
        const label = mode === "pay_on_delivery" ? "🚪 Pagar na entrega" : "🏪 Pagar na retirada";
        pushUserMessage(label);
        pushAssistantMessage(CHECKOUT_ENTRY_PROMPT["PAYMENT_METHOD"]!);
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

    setUi("thinking");
    try {
      const res = await fetch(`/api/pedido/${slug}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart,
          customerName,
          deliveryMethod,
          address,
          paymentMode,
          paymentMethodSub,
        }),
      });
      const data = await res.json();
      const resolvedOrderId = data.orderId ?? data.data?.orderId ?? null;
      setOrderId(resolvedOrderId);

      if (paymentMode === "pay_now" && data.paymentUrl) {
        setPaymentUrl(data.paymentUrl);
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
  }, [slug, cart, customerName, deliveryMethod, address, paymentMode, paymentMethodSub]);

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
    if (aiPermState === "silent" || aiPermState === "pending" || aiPermState === "checkout-prompt") {
      silentUntilRef.current = 0;
      setCheckoutPromptType(null);
      setAiPermState("consultive");
    }

    switch (stage) {
      case "ADDRESS_INPUT":   handleAddressInput(text);   break;
      case "ADDRESS_DETAILS": handleAddressDetails(text); break;
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

    if (stage === "ADDRESS_CONFIRM") {
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
          <div className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <p className="font-semibold">{address.street}, {address.number}</p>
            <p>{address.neighborhood}{address.complement ? ` — ${address.complement}` : ""}</p>
          </div>
          <div className="flex gap-2">
            <button
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
                setAddress({ street: "", number: "", neighborhood: "", complement: "" });
                setStage("ADDRESS_INPUT");
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
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-gray-500">Como vai pagar?</p>
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
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-gray-500">Qual forma de pagamento?</p>
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

    if (stage === "REVIEW_ORDER") {
      const total  = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const pmLabel = resolvePaymentMethod(paymentMode, paymentMethodSub) ?? "—";
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-gray-500">Revise seu pedido</p>

          {/* Cart items */}
          <div className="mb-2 max-h-24 overflow-y-auto">
            {cart.map((c) => (
              <div key={c.id} className="flex justify-between py-0.5 text-xs text-gray-700">
                <span>{c.name} × {c.qty}</span>
                <span>R$ {(c.price * c.qty).toFixed(2).replace(".", ",")}</span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="flex justify-between border-t border-gray-100 pt-1.5 pb-2 text-sm font-bold text-gray-900">
            <span>Total</span>
            <span>R$ {total.toFixed(2).replace(".", ",")}</span>
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
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleFinalConfirm}
              disabled={ui === "thinking"}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {ui === "thinking" ? "Confirmando…" : "Confirmar pedido 🎉"}
            </button>
            <button
              onClick={handleBackToBrowse}
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
            >
              Editar
            </button>
          </div>
        </div>
      );
    }

    if (stage === "PAYMENT_LINK") {
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
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-4 text-center">
          <p className="text-2xl">🎉</p>
          <p className="mt-1 text-sm font-bold text-gray-900">Pedido confirmado!</p>
          {orderId && (
            <p className="mt-0.5 text-xs text-gray-400">Pedido #{orderId.slice(-6).toUpperCase()}</p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-3 rounded-xl border border-gray-200 px-5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Novo pedido
          </button>
        </div>
      );
    }

    return null;
  }

  // ── Input area ────────────────────────────────────────────────────
  // Text input is hidden during the two entry phases (identifying / choosing) —
  // those phases own the bottom control surface with their own dedicated panels.
  const showInput = (stage === "BROWSE" && entryPhase === "browsing")
    || stage === "ADDRESS_INPUT"
    || stage === "ADDRESS_DETAILS"
    || stage === "ASK_NAME";
  const inputPlaceholder =
    stage === "ADDRESS_INPUT"   ? "Ex: Rua das Flores, 123" :
    stage === "ADDRESS_DETAILS" ? "Ex: Vila Madalena, apto 42" :
    stage === "ASK_NAME"        ? "Seu nome…" :
    "Digite uma mensagem…";

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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none" style={{ backgroundColor: pc }}>
          🍕
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{restaurantName}</p>
        <p className="text-[10px] text-green-200">
          {ui === "thinking" ? "digitando…" : "online"}
        </p>
      </div>

      {/* Social icons — only rendered when the restaurant filled the links */}
      {instagramUrl && (
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:text-white active:scale-90"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
          </svg>
        </a>
      )}
      {tiktokUrl && (
        <a
          href={tiktokUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="TikTok"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition hover:text-white active:scale-90"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34v-7a8.16 8.16 0 0 0 4.77 1.52V6.37a4.85 4.85 0 0 1-1-.32z"/>
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
    <div className="fixed inset-0 flex flex-col lg:flex-row bg-[#ece5dd]" style={{ '--brand-primary': pc, '--brand-secondary': sc } as React.CSSProperties}>

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

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#ece5dd]">

          {/* Phone entry inside chat — doesn't block menu on desktop */}
          {entryPhase === "identifying" && (
            <>
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-sm leading-relaxed shadow-sm text-gray-900">
                  Olá! 👋 Para personalizarmos seu atendimento, informe seu nome e WhatsApp.
                </div>
              </div>
              <div className="flex justify-start">
                <PhoneEntryCard slug={slug} onIdentified={handlePhoneIdentified} onSkip={() => enterBrowsing(null)} />
              </div>
            </>
          )}

          {messages.map((msg) => (
            <Bubble key={msg.id} msg={msg} onOptionSelect={handleOptionSelect} />
          ))}

          {/* Passive permission prompt — soft ask before AI engages */}
          {aiPermState === "pending" && stage === "BROWSE" && entryPhase === "browsing" && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white shadow-sm px-4 py-3">
                <p className="text-sm text-gray-900 mb-3 leading-relaxed">
                  Posso te sugerir algo que combina com o que você está vendo? 👇
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handlePermissionAccept}
                    className="flex-1 rounded-xl py-2 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Quero sugestão ✨
                  </button>
                  <button
                    onClick={handlePermissionDecline}
                    className="flex-1 rounded-xl py-2 text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-all active:scale-95"
                  >
                    Prefiro continuar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Checkout permission prompt — ask before upsell at Finalizar */}
          {aiPermState === "checkout-prompt" && stage === "BROWSE" && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white shadow-sm px-4 py-3">
                <p className="text-sm text-gray-900 mb-3 leading-relaxed">
                  {checkoutPromptType === "drink"
                    ? "Antes de finalizar, posso sugerir uma bebida para acompanhar? 👇"
                    : "Que tal uma sobremesa para fechar com chave de ouro? 👇"}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCheckoutPermAccept}
                    className="flex-1 rounded-xl py-2 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    Ver sugestão ✨
                  </button>
                  <button
                    onClick={handleCheckoutPermDecline}
                    className="flex-1 rounded-xl py-2 text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-all active:scale-95"
                  >
                    Finalizar agora
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
            <div className="mb-3 max-h-[100px] space-y-1 overflow-y-auto">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between text-xs">
                  <span className="min-w-0 truncate text-gray-700">
                    {item.qty}&times; {item.name}
                  </span>
                  <span className="ml-2 shrink-0 font-medium text-gray-600">
                    R$ {(item.price * item.qty).toFixed(2).replace(".", ",")}
                  </span>
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
          <div className="lg:hidden shrink-0 border-t border-gray-100 bg-gray-50">
            {suggestedProducts.length > 0 ? (
              <div className="px-3 pt-2 pb-1">
                <div
                  className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none" }}
                >
                  {suggestedProducts.map((item) => (
                    <ProductCard
                      key={item.id}
                      item={item}
                      qty={itemCartQty(item, cart)}
                      onAdd={() => item.hasVariants ? setSelectedProduct(item) : handleItemAdd(item)}
                      onOpen={() => setSelectedProduct(item)}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setSuggestedProducts([])}
                  className="py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← Voltar ao cardápio
                </button>
              </div>
            ) : currentCategoryItems.length > 0 ? (
              <div
                className="flex gap-3 overflow-x-auto px-3 py-1 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none" }}
              >
                {currentCategoryItems.map((item) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    qty={itemCartQty(item, cart)}
                    onAdd={() => item.hasVariants ? setSelectedProduct(item) : handleItemAdd(item)}
                    onOpen={() => setSelectedProduct(item)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Mobile: category carousel — compact, sticky above CartBar/input */}
        {stage === "BROWSE" && entryPhase === "browsing" && categories.length > 0 && (
          <div
            className="lg:hidden shrink-0 flex overflow-x-auto gap-2 border-t border-gray-200 bg-white px-3 py-1.5 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none" }}
          >
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setSuggestedProducts([]); handleCategorySelect(cat); }}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium min-h-[36px] transition-all ${
                  selectedCategoryId === cat.id
                    ? "text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95"
                }`}
                style={selectedCategoryId === cat.id ? { backgroundColor: 'var(--brand-primary)' } : undefined}
              >
                {categoryEmoji(cat.name)} {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Mobile: CartBar — always visible during BROWSE */}
        {stage === "BROWSE" && (
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
        {stage === "BROWSE" ? (
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
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      onClick={() => setSuggestedProducts([])}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      ← Voltar ao cardápio
                    </button>
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                    {suggestedProducts.map((item) => (
                      <DesktopProductCard
                        key={item.id}
                        item={item}
                        qty={itemCartQty(item, cart)}
                        onAdd={() => item.hasVariants ? setSelectedProduct(item) : handleItemAdd(item)}
                        onOpen={() => setSelectedProduct(item)}
                      />
                    ))}
                  </div>
                </>
              ) : currentCategoryItems.length > 0 ? (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                  {currentCategoryItems.map((item) => (
                    <DesktopProductCard
                      key={item.id}
                      item={item}
                      qty={itemCartQty(item, cart)}
                      onAdd={() => item.hasVariants ? setSelectedProduct(item) : handleItemAdd(item)}
                      onOpen={() => setSelectedProduct(item)}
                    />
                  ))}
                </div>
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
                      ? "text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95"
                  }`}
                  style={selectedCategoryId === cat.id ? { backgroundColor: 'var(--brand-primary)' } : undefined}
                >
                  {categoryEmoji(cat.name)} {cat.name}
                </button>
              ))}
            </div>
          </>
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
