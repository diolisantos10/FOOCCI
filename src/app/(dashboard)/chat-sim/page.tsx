"use client";

/**
 * /chat-sim — High-conversion guided ordering simulation
 *
 * Features:
 *  • Image support — item cards show imageUrl, falls back to category image, then emoji
 *  • Dynamic chips — always reflect current context (category → items → upsell → fulfillment)
 *  • Zero typing required — every action has a chip/button
 *  • Upsell attempt tracking — after 2 declines triggers a bundle promotion
 *  • Promotion logic — calculates real bundle from cart + cheapest missing complementary item
 *  • Fulfillment chips — delivery / pickup selection at the end
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  FormEvent,
  KeyboardEvent,
} from "react";

// ─── types ────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: Date;
}

interface MenuItem {
  name: string;
  price: number;
  description: string | null;
  imageUrl: string | null;
}

interface MenuCategory {
  name: string;
  imageUrl: string | null;
  items: MenuItem[];
}

interface CartItem {
  name: string;
  price: number;
  qty: number;
}

interface Promo {
  title: string;
  bundlePrice: number;
  savings: number;
  item: MenuItem;
}

type HistoryEntry = { role: "user" | "assistant"; content: string };
type UIState = "idle" | "thinking" | "error";

/**
 * Mandatory order flow — fully state-driven, AI generates guidance text only.
 *   SELECT_MAIN      → browsing main-dish categories
 *   SELECT_DRINK     → drink upsell (if no drink in cart and not refused)
 *   SELECT_DESSERT   → dessert upsell (if no dessert in cart and not refused)
 *   PROMO            → bundle promo card (after 2 refusals)
 *   CONFIRM_ORDER    → cart summary + confirm button
 *   DELIVERY_TYPE    → delivery or pickup
 *   ADDRESS_INPUT    → collect street + number
 *   ADDRESS_DETAILS  → collect neighborhood + complement
 *   ADDRESS_CONFIRM  → show full address for confirmation
 *   ASK_NAME         → collect customer name
 *   PAYMENT          → choose payment method
 *   DONE             → order complete
 */
type Stage =
  | "SELECT_MAIN"
  | "SELECT_DRINK"
  | "SELECT_DESSERT"
  | "PROMO"
  | "CONFIRM_ORDER"
  | "DELIVERY_TYPE"
  | "ADDRESS_INPUT"
  | "ADDRESS_DETAILS"
  | "ADDRESS_CONFIRM"
  | "ASK_NAME"
  | "PAYMENT"
  | "DONE";

interface Address {
  street:       string;
  number:       string;
  neighborhood: string;
  complement:   string;
}

interface Refusals { drink: boolean; dessert: boolean; }

type ChipBarMode =
  | { type: "categories"; categories: MenuCategory[] }
  | { type: "items";   category: string; categoryImage: string | null; items: MenuItem[] }
  | { type: "upsell";  category: string; categoryImage: string | null; items: MenuItem[] }
  | { type: "CONFIRM_ORDER" }
  | { type: "DELIVERY_TYPE" }
  | { type: "ADDRESS_INPUT" }
  | { type: "ADDRESS_DETAILS" }
  | { type: "ADDRESS_CONFIRM"; summary: string }
  | { type: "ASK_NAME" }
  | { type: "PAYMENT" }
  | { type: "DONE" };

// ─── helpers ──────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }

function formatTime(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function categoryEmoji(name: string): string {
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("pizza"))                             return "🍕";
  if (n.includes("bebida") || n.includes("drink"))     return "🥤";
  if (n.includes("sobremesa") || n.includes("doce"))   return "🍰";
  if (n.includes("lanche") || n.includes("burger"))    return "🍔";
  if (n.includes("entrada") || n.includes("porcao"))   return "🥗";
  return "🍽️";
}

/** Finds a category by keyword(s) in its normalised name. */
function findMenuCat(menu: MenuCategory[], ...kw: string[]): MenuCategory | null {
  return menu.find((c) => {
    const n = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return kw.some((k) => n.includes(k));
  }) ?? null;
}

const findBeverageCat = (menu: MenuCategory[]) =>
  findMenuCat(menu, "bebida", "drink", "suco", "refri");
const findDessertCat  = (menu: MenuCategory[]) =>
  findMenuCat(menu, "sobremesa", "doce");

/**
 * Returns the first uncovered upsell stage the user has not yet refused,
 * or "CONFIRM_ORDER" if everything is covered / refused.
 */
function nextUpsellStage(
  menu: MenuCategory[],
  cart: CartItem[],
  refusals: Refusals
): Stage {
  const names = new Set(cart.map((c) => c.name));
  const bev = findBeverageCat(menu);
  if (bev && !bev.items.some((i) => names.has(i.name)) && !refusals.drink) return "SELECT_DRINK";
  const des = findDessertCat(menu);
  if (des && !des.items.some((i) => names.has(i.name)) && !refusals.dessert) return "SELECT_DESSERT";
  return "CONFIRM_ORDER";
}

/** Parses "Rua X, 123" into { street, number }. */
function parseStreetLine(raw: string): { street: string; number: string } {
  const m = raw.trim().match(/^(.*?),?\s*(\d+\S*)\s*$/);
  return m ? { street: (m[1] ?? "").trim(), number: (m[2] ?? "").trim() } : { street: raw.trim(), number: "" };
}

/** Parses "Bairro, Complemento" into { neighborhood, complement }. */
function parseNeighborhoodLine(raw: string): { neighborhood: string; complement: string } {
  const parts = raw.split(",").map((p) => p.trim());
  return { neighborhood: parts[0] ?? "", complement: parts.slice(1).join(", ") };
}

function formatAddress(addr: Address): string {
  const parts = [
    addr.street && addr.number ? `${addr.street}, ${addr.number}` : addr.street,
    addr.neighborhood,
    addr.complement,
  ].filter(Boolean);
  return parts.join(" — ");
}

/** Calculates a bundle promo when user declines upsell ≥ 2 times. */
function calculatePromo(cart: CartItem[], menu: MenuCategory[]): Promo | null {
  if (cart.length === 0) return null;

  // Find complementary category not yet in cart (prefer drinks)
  const cartNames = new Set(cart.map((c) => c.name));

  const drinkCat = menu.find((c) => {
    const n = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return n.includes("bebida") || n.includes("drink");
  });

  // Pick the complementary category: drinks first, otherwise any missing category
  const missingCat = drinkCat && !drinkCat.items.some((i) => cartNames.has(i.name))
    ? drinkCat
    : menu.find((c) => !c.items.some((i) => cartNames.has(i.name)));

  if (!missingCat) return null;

  // Cheapest available item from that category
  const available = missingCat.items.filter((i) => !cartNames.has(i.name));
  if (available.length === 0) return null;

  const cheapest = available.reduce((a, b) => a.price < b.price ? a : b);

  // Anchor: highest-value item in cart
  const anchor = cart.reduce((a, b) => a.price > b.price ? a : b);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const discountedPrice = cheapest.price * 0.8; // 20% off complementary item
  const savings = +(cheapest.price - discountedPrice).toFixed(2);
  const bundlePrice = +(cartTotal + discountedPrice).toFixed(2);

  return {
    title: `${anchor.name} + ${cheapest.name}`,
    bundlePrice,
    savings,
    item: cheapest,
  };
}

// ─── Bubble ───────────────────────────────────────────────────

function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mr-2 mt-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-xs font-bold text-white">
          IA
        </div>
      )}
      <div
        className={`max-w-[72%] rounded-2xl px-4 py-2.5 shadow-sm ${
          isUser
            ? "rounded-br-none bg-[#dcf8c6] text-gray-900"
            : "rounded-bl-none bg-white text-gray-900"
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {msg.content}
        </p>
        <p className={`mt-0.5 text-right text-[10px] ${isUser ? "text-gray-500" : "text-gray-400"}`}>
          {formatTime(msg.ts)}
        </p>
      </div>
    </div>
  );
}

// ─── TypingIndicator ──────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-xs font-bold text-white">
        IA
      </div>
      <div className="rounded-2xl rounded-bl-none bg-white px-4 py-3 shadow-sm">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-2 w-2 rounded-full bg-gray-400"
              style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

// ─── CartBar ──────────────────────────────────────────────────

function CartBar({ cart }: { cart: CartItem[] }) {
  if (cart.length === 0) return null;
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  return (
    <div className="shrink-0 border-t border-green-200 bg-green-50 px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-green-800">🛒</span>
        <div className="flex flex-1 flex-wrap gap-1">
          {cart.map((item) => (
            <span
              key={item.name}
              className="rounded-full bg-green-200 px-2 py-0.5 text-xs font-medium text-green-900"
            >
              {item.qty > 1 ? `${item.qty}× ` : ""}{item.name}
            </span>
          ))}
        </div>
        <span className="shrink-0 text-xs font-bold text-green-900">
          R$&nbsp;{total.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ─── PromoCard ────────────────────────────────────────────────

function PromoCard({
  promo,
  disabled,
  onAccept,
  onDecline,
}: {
  promo: Promo;
  disabled: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="mx-4 mb-2 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-3 shadow-md">
      <div className="flex items-start gap-2.5">
        <span className="text-2xl leading-none">🔥</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-orange-600">
            Promo do dia
          </p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900 leading-tight">
            {promo.title}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-base font-bold text-orange-600">
              R$&nbsp;{promo.bundlePrice.toFixed(2)}
            </p>
            <p className="text-[11px] text-gray-500">
              economia de R$&nbsp;{promo.savings.toFixed(2)} 🎉
            </p>
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onAccept}
          disabled={disabled}
          className="flex-1 rounded-xl bg-orange-500 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          Aproveitar! 🎉
        </button>
        <button
          onClick={onDecline}
          disabled={disabled}
          className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Finalizar sem promo
        </button>
      </div>
    </div>
  );
}

// ─── ItemImage ────────────────────────────────────────────────

function ItemImage({
  src,
  fallback,
  emoji,
  alt,
}: {
  src: string | null;
  fallback: string | null;
  emoji: string;
  alt: string;
}) {
  const url = src ?? fallback;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        className="h-full w-full object-cover"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return <span className="text-3xl select-none">{emoji}</span>;
}

// ─── ChipBar ──────────────────────────────────────────────────

function ChipBar({
  mode,
  disabled,
  onCategorySelect,
  onItemSelect,
  onBack,
  onFinalize,
  onUpsellDecline,
  onConfirmOrder,
  onBackToExploration,
  onDeliveryMethod,
  onAddressConfirm,
  onAddressEdit,
  onPayment,
}: {
  mode: ChipBarMode;
  disabled: boolean;
  onCategorySelect: (cat: MenuCategory) => void;
  onItemSelect: (item: MenuItem) => void;
  onBack: () => void;
  onFinalize: () => void;
  onUpsellDecline: () => void;
  onConfirmOrder: () => void;
  onBackToExploration: () => void;
  onDeliveryMethod: (type: "delivery" | "pickup") => void;
  onAddressConfirm: () => void;
  onAddressEdit: () => void;
  onPayment: (method: "dinheiro" | "cartao" | "pix") => void;
}) {
  const chip = "shrink-0 rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-40 transition-colors";

  // ── Done ──────────────────────────────────────────────────
  if (mode.type === "DONE") {
    return (
      <p className="py-1 text-center text-xs text-gray-400">
        Pedido encerrado · clique em <strong>Reiniciar</strong> para nova conversa
      </p>
    );
  }

  // ── Payment ───────────────────────────────────────────────
  if (mode.type === "PAYMENT") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-center text-xs font-semibold text-gray-600">Como vai pagar?</p>
        <div className="flex gap-2">
          <button type="button" disabled={disabled} onClick={() => onPayment("dinheiro")}
            className="flex-1 rounded-xl border border-green-300 bg-green-50 py-2.5 text-sm font-bold text-green-900 hover:bg-green-100 disabled:opacity-40 transition-colors">
            💵 Dinheiro
          </button>
          <button type="button" disabled={disabled} onClick={() => onPayment("cartao")}
            className="flex-1 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-bold text-blue-900 hover:bg-blue-100 disabled:opacity-40 transition-colors">
            💳 Cartão
          </button>
          <button type="button" disabled={disabled} onClick={() => onPayment("pix")}
            className="flex-1 rounded-xl border border-purple-200 bg-purple-50 py-2.5 text-sm font-bold text-purple-900 hover:bg-purple-100 disabled:opacity-40 transition-colors">
            📱 Pix
          </button>
        </div>
      </div>
    );
  }

  // ── Ask name ──────────────────────────────────────────────
  if (mode.type === "ASK_NAME") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-center">
        <p className="text-xs font-semibold text-green-800">👤 Qual é o seu nome para o pedido?</p>
        <p className="mt-0.5 text-[11px] text-green-600">Digite acima e toque em Enviar ↑</p>
      </div>
    );
  }

  // ── Address confirm ───────────────────────────────────────
  if (mode.type === "ADDRESS_CONFIRM") {
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-[11px] font-bold text-blue-800">📍 Confirmar endereço:</p>
          <p className="mt-0.5 text-[11px] text-blue-700">{mode.summary}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={disabled} onClick={onAddressConfirm}
            className="flex-1 rounded-xl bg-[#25d366] py-2.5 text-sm font-bold text-white hover:bg-[#20b857] disabled:opacity-40 transition-colors">
            ✅ Confirmar
          </button>
          <button type="button" disabled={disabled} onClick={onAddressEdit}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            ✏️ Corrigir
          </button>
        </div>
      </div>
    );
  }

  // ── Address details (neighborhood) ────────────────────────
  if (mode.type === "ADDRESS_DETAILS") {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-center">
        <p className="text-xs font-semibold text-blue-800">🏘️ Bairro e complemento</p>
        <p className="mt-0.5 text-[11px] text-blue-600">ex: Bela Vista, Apto 42 — Digite acima ↑</p>
      </div>
    );
  }

  // ── Address input (street) ────────────────────────────────
  if (mode.type === "ADDRESS_INPUT") {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-center">
        <p className="text-xs font-semibold text-blue-800">📍 Rua e número</p>
        <p className="mt-0.5 text-[11px] text-blue-600">ex: Av. Paulista, 1000 — Digite acima ↑</p>
      </div>
    );
  }

  // ── Delivery type ─────────────────────────────────────────
  if (mode.type === "DELIVERY_TYPE") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-center text-xs font-semibold text-gray-600">Como vai receber seu pedido?</p>
        <div className="flex gap-2">
          <button type="button" disabled={disabled} onClick={() => onDeliveryMethod("delivery")}
            className="flex-1 rounded-xl border border-[#25d366] bg-[#e7fbe8] py-2.5 text-sm font-bold text-green-900 hover:bg-[#d0f5d2] disabled:opacity-40 transition-colors">
            🚚 Entrega
          </button>
          <button type="button" disabled={disabled} onClick={() => onDeliveryMethod("pickup")}
            className="flex-1 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-bold text-blue-900 hover:bg-blue-100 disabled:opacity-40 transition-colors">
            🏪 Retirada
          </button>
        </div>
      </div>
    );
  }

  // ── Confirm order ─────────────────────────────────────────
  if (mode.type === "CONFIRM_ORDER") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-center text-xs font-semibold text-green-700">Pedido montado! Deseja confirmar?</p>
        <div className="flex gap-2">
          <button type="button" disabled={disabled} onClick={onConfirmOrder}
            className="flex-1 rounded-xl bg-[#25d366] py-2.5 text-sm font-bold text-white hover:bg-[#20b857] disabled:opacity-40 transition-colors">
            ✅ Confirmar pedido
          </button>
          <button type="button" disabled={disabled} onClick={onBackToExploration}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            ← Adicionar item
          </button>
        </div>
      </div>
    );
  }

  // ── Category chips ────────────────────────────────────────
  if (mode.type === "categories") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {mode.categories.map((cat) => (
          <button key={cat.name} type="button" disabled={disabled}
            onClick={() => onCategorySelect(cat)}
            className={`${chip} border-[#25d366] bg-[#e7fbe8] text-green-900 hover:bg-[#d0f5d2]`}>
            {categoryEmoji(cat.name)} {cat.name}
          </button>
        ))}
        <button type="button" disabled={disabled} onClick={onFinalize}
          className={`${chip} border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100`}>
          ✅ Finalizar pedido
        </button>
      </div>
    );
  }

  // ── Items or Upsell — full visual card grid ───────────────
  // Both "items" (exploration) and "upsell" (drink/dessert) use the same card grid.
  // Upsell additionally shows a "Não quero, obrigado" skip button.
  const isUpsell = mode.type === "upsell";
  const emoji = categoryEmoji(mode.category);
  return (
    <div className="flex flex-col gap-2">
      {/* Nav row */}
      <div className="flex gap-1.5">
        {!isUpsell && (
          <button type="button" disabled={disabled} onClick={onBack}
            className={`${chip} border-gray-300 bg-white text-gray-600 hover:bg-gray-50`}>
            Continuar pedido
          </button>
        )}
        <button type="button" disabled={disabled} onClick={isUpsell ? onUpsellDecline : onFinalize}
          className={isUpsell
            ? `${chip} border-gray-300 bg-white text-gray-500 hover:bg-gray-50`
            : `${chip} border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100`}>
          {isUpsell ? "Não quero, obrigado" : "✅ Finalizar pedido"}
        </button>
      </div>
      {/* Card grid */}
      <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto sm:grid-cols-3">
        {mode.items.map((item) => (
          <button key={item.name} type="button" disabled={disabled}
            onClick={() => onItemSelect(item)}
            className={`flex flex-col overflow-hidden rounded-xl border text-left shadow-sm hover:shadow-md disabled:opacity-40 transition-all ${
              isUpsell
                ? "border-purple-200 bg-white hover:border-purple-400"
                : "border-green-200 bg-white hover:border-green-400"
            }`}>
            <div className="flex h-16 w-full items-center justify-center overflow-hidden bg-gray-50">
              <ItemImage src={item.imageUrl} fallback={mode.categoryImage} emoji={emoji} alt={item.name} />
            </div>
            <div className="p-2">
              <p className="text-[11px] font-semibold text-gray-900 leading-tight line-clamp-2">{item.name}</p>
              <p className={`mt-0.5 text-[11px] font-bold ${isUpsell ? "text-purple-700" : "text-green-700"}`}>
                R$&nbsp;{item.price.toFixed(2)}
              </p>
              {item.description && (
                <p className="mt-0.5 text-[10px] text-gray-400 line-clamp-1">{item.description}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────

export default function ChatSimPage() {
  const [messages,         setMessages]         = useState<ChatMessage[]>([]);
  const [menu,             setMenu]             = useState<MenuCategory[]>([]);
  const [cart,             setCart]             = useState<CartItem[]>([]);
  const [visitedCategories,setVisitedCategories]= useState<string[]>([]);
  const [stage,            setStage]            = useState<Stage>("SELECT_MAIN");
  const [currentCategory,  setCurrentCategory]  = useState<string | null>(null);
  const [refusals,         setRefusals]         = useState<Refusals>({ drink: false, dessert: false });
  const [refusalCount,     setRefusalCount]     = useState(0);
  const [promo,            setPromo]            = useState<Promo | null>(null);
  const [deliveryMethod,   setDeliveryMethod]   = useState<"delivery" | "pickup" | null>(null);
  const [address,          setAddress]          = useState<Address>({ street: "", number: "", neighborhood: "", complement: "" });
  const [customerName,     setCustomerName]     = useState("");
  const [input,            setInput]            = useState("");
  const [uiState,          setUiState]          = useState<UIState>("idle");
  const [errorMsg,         setErrorMsg]         = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const greeted   = useRef(false);

  const busy = uiState === "thinking";

  // ── cart helpers ──────────────────────────────────────────

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      if (prev.some((c) => c.name === item.name)) return prev;
      return [...prev, { name: item.name, price: item.price, qty: 1 }];
    });
  }

  // ── chip bar mode — pure, deterministic ──────────────────

  function computeChipMode(stg: Stage, curCat: string | null, cartSnap: CartItem[]): ChipBarMode {
    if (stg === "DONE")            return { type: "DONE" };
    if (stg === "PAYMENT")         return { type: "PAYMENT" };
    if (stg === "ASK_NAME")        return { type: "ASK_NAME" };
    if (stg === "ADDRESS_CONFIRM") return { type: "ADDRESS_CONFIRM", summary: formatAddress(address) };
    if (stg === "ADDRESS_DETAILS") return { type: "ADDRESS_DETAILS" };
    if (stg === "ADDRESS_INPUT")   return { type: "ADDRESS_INPUT" };
    if (stg === "DELIVERY_TYPE")   return { type: "DELIVERY_TYPE" };
    if (stg === "CONFIRM_ORDER")   return { type: "CONFIRM_ORDER" };
    // PROMO handled by PromoCard rendered separately — chip bar hidden when stage === "PROMO"

    if (stg === "SELECT_DRINK") {
      const cat = findBeverageCat(menu);
      if (cat) return { type: "upsell", category: cat.name, categoryImage: cat.imageUrl ?? null, items: cat.items };
      return { type: "CONFIRM_ORDER" };
    }

    if (stg === "SELECT_DESSERT") {
      const cat = findDessertCat(menu);
      if (cat) return { type: "upsell", category: cat.name, categoryImage: cat.imageUrl ?? null, items: cat.items };
      return { type: "CONFIRM_ORDER" };
    }

    // SELECT_MAIN — exploration
    if (curCat) {
      const cat = menu.find((c) => c.name === curCat);
      return { type: "items", category: curCat, categoryImage: cat?.imageUrl ?? null, items: cat?.items ?? [] };
    }
    const cartNames = new Set(cartSnap.map((c) => c.name));
    const remaining = menu.filter((c) => !c.items.some((i) => cartNames.has(i.name)));
    return { type: "categories", categories: remaining };
  }

  // ── auto-scroll ───────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, uiState, stage]);

  // ── core AI call ─────────────────────────────────────────

  const callAI = useCallback(async (
    history: HistoryEntry[],
    userText: string,
    currentCart: CartItem[],
    currentVisited: string[],
    currentPromo: Promo | null,
    isGreeting = false,
    currentStage: Stage = "SELECT_MAIN"
  ) => {
    setUiState("thinking");
    setErrorMsg("");

    try {
      const res = await fetch("/api/chat-sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          history,
          cart: currentCart,
          visitedCategories: currentVisited,
          stage: currentStage,
          promo: currentPromo
            ? { title: currentPromo.title, bundlePrice: currentPromo.bundlePrice, savings: currentPromo.savings }
            : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Erro ${res.status}`);

      const assistantMsg: ChatMessage = {
        id: uid(), role: "assistant", content: json.data.reply, ts: new Date(),
      };

      if (isGreeting) {
        setMessages([assistantMsg]);
      } else {
        setMessages((prev) => [...prev, assistantMsg]);
      }

      setTimeout(() => inputRef.current?.focus(), 80);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setUiState("error");
      return;
    }

    setUiState("idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── load menu ─────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/chat-sim")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.data?.categories)) {
          setMenu(data.data.categories);
        }
      })
      .catch(() => {/* non-critical */});
  }, []);

  // ── initial greeting ─────────────────────────────────────

  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    callAI([], "oi", [], [], null, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── send helper — always takes explicit snapshots ─────────

  async function sendText(
    text: string,
    cartSnap: CartItem[],
    visitedSnap: string[],
    promoSnap: Promo | null,
    stageSnap: Stage = stage
  ) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed, ts: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    await callAI(history, trimmed, cartSnap, visitedSnap, promoSnap, false, stageSnap);
  }

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const val = input.trim();
    if (!val) return;

    if (stage === "ADDRESS_INPUT") {
      if (!/\d/.test(val)) return; // must contain a number
      const { street, number } = parseStreetLine(val);
      setAddress((a) => ({ ...a, street, number }));
      setStage("ADDRESS_DETAILS");
      sendText(`Rua: ${val}`, cart, visitedCategories, null, "ADDRESS_DETAILS");
      return;
    }

    if (stage === "ADDRESS_DETAILS") {
      const { neighborhood, complement } = parseNeighborhoodLine(val);
      setAddress((a) => ({ ...a, neighborhood, complement }));
      setStage("ADDRESS_CONFIRM");
      // Don't call AI here — ADDRESS_CONFIRM chip bar shows the address for visual confirmation
      setInput("");
      return;
    }

    if (stage === "ASK_NAME") {
      setCustomerName(val);
      setStage("PAYMENT");
      sendText(`Meu nome é ${val}`, cart, visitedCategories, null, "PAYMENT");
      return;
    }

    sendText(val, cart, visitedCategories, promo);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  // ── chip handlers — STATE FIRST, then AI ─────────────────

  function handleCategorySelect(cat: MenuCategory) {
    const newVisited = visitedCategories.includes(cat.name)
      ? visitedCategories : [...visitedCategories, cat.name];
    setVisitedCategories(newVisited);
    setCurrentCategory(cat.name);
    sendText(`${categoryEmoji(cat.name)} ${cat.name}`, cart, newVisited, promo);
  }

  function handleItemSelect(item: MenuItem) {
    const newCart = cart.some((c) => c.name === item.name)
      ? cart : [...cart, { name: item.name, price: item.price, qty: 1 }];
    addToCart(item);

    let nextStage: Stage = stage;
    if (stage === "SELECT_DRINK") {
      nextStage = nextUpsellStage(menu, newCart, { ...refusals, drink: true });
      setStage(nextStage);
      setCurrentCategory(null);
    } else if (stage === "SELECT_DESSERT") {
      nextStage = "CONFIRM_ORDER";
      setStage(nextStage);
      setCurrentCategory(null);
    } else {
      setCurrentCategory(null); // stay in SELECT_MAIN, snap back to categories
    }

    sendText(`Quero ${item.name}`, newCart, visitedCategories, promo, nextStage);
  }

  function handleBack() { setCurrentCategory(null); }

  function handleFinalize() {
    const nextStage = nextUpsellStage(menu, cart, refusals);
    setStage(nextStage);
    setCurrentCategory(null);
    sendText("Continuar pedido", cart, visitedCategories, promo, nextStage);
  }

  function handleUpsellDecline() {
    const isDrink   = stage === "SELECT_DRINK";
    const isDesert  = stage === "SELECT_DESSERT";
    const catLabel  = isDrink ? (findBeverageCat(menu)?.name ?? "bebidas")
                    : isDesert ? (findDessertCat(menu)?.name ?? "sobremesas")
                    : "";

    const newRefusals: Refusals = {
      drink:   isDrink   ? true : refusals.drink,
      dessert: isDesert  ? true : refusals.dessert,
    };
    setRefusals(newRefusals);

    const newCount = refusalCount + 1;
    setRefusalCount(newCount);

    // After 2 refusals → PROMO stage (once per session)
    if (newCount >= 2 && stage !== "PROMO") {
      const calculated = calculatePromo(cart, menu);
      if (calculated) {
        setPromo(calculated);
        setStage("PROMO");
        return;
      }
    }

    // Advance: never re-offer refused category
    const nextStage = nextUpsellStage(menu, cart, newRefusals);
    setStage(nextStage);

    const text = catLabel ? `não quero ${catLabel.toLowerCase()}, obrigado` : "pode continuar";
    sendText(text, cart, visitedCategories, null, nextStage);
  }

  function handleAcceptPromo() {
    if (!promo) return;
    const newCart = cart.some((c) => c.name === promo.item.name)
      ? cart : [...cart, { name: promo.item.name, price: promo.item.price, qty: 1 }];
    addToCart(promo.item);
    setStage("CONFIRM_ORDER");
    sendText("Quero aproveitar a promoção!", newCart, visitedCategories, promo, "CONFIRM_ORDER");
  }

  function handleDeclinePromo() {
    setStage("CONFIRM_ORDER");
    sendText("pode finalizar sem a promoção", cart, visitedCategories, null, "CONFIRM_ORDER");
  }

  function handleConfirmOrder() {
    setStage("DELIVERY_TYPE");
    sendText("Confirmar pedido", cart, visitedCategories, null, "DELIVERY_TYPE");
  }

  function handleBackToExploration() {
    setStage("SELECT_MAIN");
    setCurrentCategory(null);
  }

  function handleDeliveryMethod(type: "delivery" | "pickup") {
    setDeliveryMethod(type);
    if (type === "delivery") {
      setStage("ADDRESS_INPUT");
      sendText("Quero entrega por favor", cart, visitedCategories, null, "ADDRESS_INPUT");
    } else {
      setStage("ASK_NAME");
      sendText("Vou retirar no local", cart, visitedCategories, null, "ASK_NAME");
    }
  }

  function handleAddressConfirm() {
    setStage("ASK_NAME");
    sendText(
      `Endereço confirmado: ${formatAddress(address)}`,
      cart, visitedCategories, null, "ASK_NAME"
    );
  }

  function handleAddressEdit() {
    setAddress({ street: "", number: "", neighborhood: "", complement: "" });
    setStage("ADDRESS_INPUT");
  }

  function handlePayment(method: "dinheiro" | "cartao" | "pix") {
    setStage("DONE");
    const labels = { dinheiro: "Dinheiro", cartao: "Cartão", pix: "Pix" };
    sendText(`Vou pagar com ${labels[method]}`, cart, visitedCategories, null, "DONE");
  }

  // ── reset ─────────────────────────────────────────────────

  function handleClear() {
    setMessages([]);
    setCart([]);
    setVisitedCategories([]);
    setStage("SELECT_MAIN");
    setCurrentCategory(null);
    setRefusals({ drink: false, dessert: false });
    setRefusalCount(0);
    setPromo(null);
    setDeliveryMethod(null);
    setAddress({ street: "", number: "", neighborhood: "", complement: "" });
    setCustomerName("");
    setInput("");
    setErrorMsg("");
    setUiState("idle");
    greeted.current = true;
    callAI([], "oi", [], [], null, true);
  }

  // ─── render ───────────────────────────────────────────────

  const chipMode = computeChipMode(stage, currentCategory, cart);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#ece5dd]">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between bg-[#075e54] px-4 py-3 text-white shadow">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#128c7e] text-sm font-bold">
            IA
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Pedido Guiado</p>
            <p className="text-xs text-green-200">{busy ? "digitando…" : "online"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(stage === "SELECT_DRINK" || stage === "SELECT_DESSERT" || stage === "PROMO") && (
            <span className="rounded-full bg-amber-400/30 px-2.5 py-0.5 text-[10px] font-semibold text-amber-100">
              Upsell
            </span>
          )}
          {(stage === "CONFIRM_ORDER" || stage === "DELIVERY_TYPE" || stage === "ADDRESS_INPUT" ||
            stage === "ADDRESS_DETAILS" || stage === "ADDRESS_CONFIRM" || stage === "ASK_NAME" ||
            stage === "PAYMENT") && (
            <span className="rounded-full bg-green-400/30 px-2.5 py-0.5 text-[10px] font-semibold text-green-100">
              Finalizando
            </span>
          )}
          {refusalCount > 0 && stage !== "PROMO" && (
            <span className="rounded-full bg-red-400/30 px-2 py-0.5 text-[10px] text-red-200">
              {refusalCount} recusa{refusalCount > 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={handleClear}
            disabled={busy}
            className="rounded-lg bg-[#128c7e] px-3 py-1.5 text-xs font-medium hover:bg-[#0f7a6f] disabled:opacity-50"
          >
            Reiniciar
          </button>
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────── */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !busy && (
          <p className="text-center text-xs text-gray-400">Iniciando conversa…</p>
        )}
        {messages.length > 0 && (
          <div className="flex justify-center">
            <span className="rounded-full bg-white/80 px-3 py-0.5 text-xs text-gray-500 shadow-sm">
              Hoje
            </span>
          </div>
        )}
        {messages.map((msg) => <Bubble key={msg.id} msg={msg} />)}
        {busy && <TypingIndicator />}
        {uiState === "error" && (
          <div className="mx-auto max-w-sm rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700 shadow-sm">
            <p className="font-semibold">Erro ao conectar com a IA</p>
            <p className="mt-0.5 text-xs opacity-80">{errorMsg}</p>
            {(errorMsg.includes("401") || errorMsg.toLowerCase().includes("api")) && (
              <p className="mt-1 text-xs">
                Verifique se <code className="font-mono">OPENAI_API_KEY</code> está configurada.
              </p>
            )}
            <button onClick={() => setUiState("idle")} className="mt-2 text-xs underline">
              Fechar
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Cart summary ────────────────────────────────── */}
      <CartBar cart={cart} />

      {/* ── Promo card ──────────────────────────────────── */}
      {stage === "PROMO" && promo && (
        <PromoCard
          promo={promo}
          disabled={busy}
          onAccept={handleAcceptPromo}
          onDecline={handleDeclinePromo}
        />
      )}

      {/* ── Composer ────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-gray-200 bg-white px-4 py-3"
      >
        {stage !== "PROMO" && (
          <div className="mb-2.5">
            <ChipBar
              mode={chipMode}
              disabled={busy}
              onCategorySelect={handleCategorySelect}
              onItemSelect={handleItemSelect}
              onBack={handleBack}
              onFinalize={handleFinalize}
              onUpsellDecline={handleUpsellDecline}
              onConfirmOrder={handleConfirmOrder}
              onBackToExploration={handleBackToExploration}
              onDeliveryMethod={handleDeliveryMethod}
              onAddressConfirm={handleAddressConfirm}
              onAddressEdit={handleAddressEdit}
              onPayment={handlePayment}
            />
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              stage === "ADDRESS_INPUT"   ? "ex: Av. Paulista, 1000" :
              stage === "ADDRESS_DETAILS" ? "ex: Bela Vista, Apto 42" :
              stage === "ASK_NAME"        ? "Seu nome completo…" :
              "Digite ou use os botões acima…"
            }
            rows={1}
            disabled={busy}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25d366] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-white shadow hover:bg-[#0f7a6f] disabled:opacity-40"
            title="Enviar"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 rotate-45">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </form>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
