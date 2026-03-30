"use client";

/**
 * /chat-sim — Simplified sidebar + product grid ordering simulation
 *
 * Architecture:
 *  • Left sidebar  — category list, always visible
 *  • Main area     — chat messages + product grid (BROWSE) or checkout UI
 *  • Cart bar      — live cart summary strip
 *  • Bottom bar    — "Ver cardápio" + "Finalizar pedido" always visible
 *
 * Stage flow:
 *   BROWSE → (upsell drink/dessert) → DELIVERY_TYPE → ADDRESS_INPUT →
 *   ADDRESS_DETAILS → ADDRESS_CONFIRM → ASK_NAME → PAYMENT → REVIEW_ORDER → DONE
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  FormEvent,
  KeyboardEvent,
} from "react";

import type { QAScenario, QAAction } from "@/lib/qa/types";
import { allScenarios } from "@/lib/qa/scenarios";
import { CRITICAL_SCENARIO_IDS } from "@/lib/qa/critical-scenarios";
import { QAPanel } from "./QAPanel";

// ─── types ────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: Date;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  imageUrl: string | null;
}

interface MenuCategory {
  id: string;
  name: string;
  imageUrl: string | null;
  items: MenuItem[];
}

// ─── Normalized menu types (sidebar + product grid) ───────────

interface Category {
  id: string;
  name: string;
  imageUrl: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  image: string | null;
  description: string | null;
  categoryId: string;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

type HistoryEntry = { role: "user" | "assistant"; content: string };
type UIState = "idle" | "thinking" | "error";

type Stage =
  | "BROWSE"
  | "DELIVERY_TYPE"
  | "ADDRESS_INPUT"
  | "ADDRESS_DETAILS"
  | "ADDRESS_CONFIRM"
  | "ASK_NAME"
  | "PAYMENT"
  | "REVIEW_ORDER"
  | "DONE";

interface Address {
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
}

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

function findMenuCat(menu: MenuCategory[], ...kw: string[]): MenuCategory | null {
  return menu.find((c) => {
    const n = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return kw.some((k) => n.includes(k));
  }) ?? null;
}

const findBeverageCat = (menu: MenuCategory[]) =>
  findMenuCat(menu, "bebida", "drink", "suco", "refri");
const findDessertCat = (menu: MenuCategory[]) =>
  findMenuCat(menu, "sobremesa", "doce");
const findMainCat = (menu: MenuCategory[]) => {
  const d = findBeverageCat(menu);
  const s = findDessertCat(menu);
  return menu.find((c) => c !== d && c !== s) ?? menu[0] ?? null;
};
const findCatByType = (
  menu: MenuCategory[],
  type: "main" | "drink" | "dessert",
): MenuCategory | null => {
  if (type === "drink")   return findBeverageCat(menu);
  if (type === "dessert") return findDessertCat(menu);
  return findMainCat(menu);
};

function findReplayProduct(
  products: Product[],
  name: string,
  fallbackCategoryId?: string,
): Product | null {
  const lc = name.toLowerCase();
  const exact   = products.find((p) => p.name.toLowerCase() === lc);
  if (exact) return exact;
  const partial = products.find(
    (p) => p.name.toLowerCase().includes(lc) || lc.includes(p.name.toLowerCase()),
  );
  if (partial) return partial;
  if (fallbackCategoryId) {
    return products.find((p) => p.categoryId === fallbackCategoryId) ?? null;
  }
  return products[0] ?? null;
}

// ─── Replay step type (internal to replay, never sent to server) ──

type ReplayStep = QAAction | { type: "_address_details"; text: string };

function expandForReplay(actions: QAAction[]): ReplayStep[] {
  const steps: ReplayStep[] = [];
  for (const action of actions) {
    // Inline assertions are state-machine concepts — skip in DOM replay
    if (action.type.startsWith("assert_")) continue;
    steps.push(action);
    // input_address bundles line1 + optional line2; expand to two steps
    if (action.type === "input_address" && action.line2) {
      steps.push({ type: "_address_details", text: action.line2 });
    }
  }
  return steps;
}

function parseStreetLine(raw: string): { street: string; number: string } {
  const m = raw.trim().match(/^(.*?),?\s*(\d+\S*)\s*$/);
  return m
    ? { street: (m[1] ?? "").trim(), number: (m[2] ?? "").trim() }
    : { street: raw.trim(), number: "" };
}

function parseNeighborhoodLine(raw: string): { neighborhood: string; complement: string } {
  const parts = raw.split(",").map((p) => p.trim());
  return { neighborhood: parts[0] ?? "", complement: parts.slice(1).join(", ") };
}

function formatAddress(addr: Address): string {
  const streetPart = [addr.street, addr.number].filter(Boolean).join(", ");
  const parts = [streetPart, addr.neighborhood, addr.complement].filter(Boolean);
  return parts.join(" — ");
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

function CartBar({
  cart,
  onDecrement,
  onRemove,
}: {
  cart: CartItem[];
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (cart.length === 0) return null;
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  return (
    <div className="shrink-0 border-t border-green-200 bg-green-50 px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-green-800">🛒</span>
        <div className="flex flex-1 flex-wrap gap-1">
          {cart.map((item) => (
            <span
              key={item.id}
              className="flex items-center gap-1 rounded-full bg-green-200 pl-2 pr-1 py-0.5 text-xs font-medium text-green-900"
            >
              {item.qty > 1 && (
                <span className="font-bold">{item.qty}×</span>
              )}
              <span>{item.name}</span>
              <button
                onClick={() => onDecrement(item.id)}
                className="flex h-4 w-4 items-center justify-center rounded-full bg-green-400 text-white hover:bg-green-600 text-[10px] font-bold leading-none transition-colors"
                aria-label={`Remover 1 ${item.name}`}
              >
                −
              </button>
              <button
                onClick={() => onRemove(item.id)}
                className="flex h-4 w-4 items-center justify-center rounded-full bg-red-400 text-white hover:bg-red-600 text-[10px] font-bold leading-none transition-colors"
                aria-label={`Remover ${item.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <span data-testid="cart-badge" className="shrink-0 text-xs font-bold text-green-900">
          R$&nbsp;{total.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ─── ProductModal ─────────────────────────────────────────────

function ProductModal({
  product,
  emoji,
  qtyInCart,
  disabled,
  onAdd,
  onClose,
}: {
  product: Product;
  emoji: string;
  qtyInCart: number;
  disabled: boolean;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <div data-testid="modal-overlay" className="absolute inset-0 z-50 flex flex-col bg-white">
      {/* header */}
      <div className="shrink-0 flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          ← Voltar
        </button>
        {qtyInCart > 0 && (
          <span className="rounded-full bg-[#25d366] px-2.5 py-0.5 text-xs font-bold text-white">
            {qtyInCart} no carrinho
          </span>
        )}
      </div>
      {/* image */}
      <div className="relative h-56 shrink-0 bg-gray-100 flex items-center justify-center">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="text-6xl select-none">{emoji}</span>
        )}
      </div>
      {/* info */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-lg font-bold text-gray-900 leading-snug">{product.name}</p>
        {product.description && (
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">{product.description}</p>
        )}
        <p className="mt-4 text-2xl font-bold text-gray-900">
          R$&nbsp;{product.price.toFixed(2)}
        </p>
      </div>
      {/* add button */}
      <div className="shrink-0 border-t border-gray-100 px-4 py-3">
        <button
          onClick={() => { onAdd(); onClose(); }}
          disabled={disabled}
          className="w-full rounded-xl bg-[#25d366] py-3 text-sm font-bold text-white hover:bg-[#1dbd5a] disabled:opacity-40 transition-colors"
        >
          + Adicionar ao pedido
        </button>
      </div>
    </div>
  );
}

// ─── ProductCard ──────────────────────────────────────────────

function ProductCard({
  item,
  emoji,
  qtyInCart,
  disabled,
  onAdd,
  onOpen,
}: {
  item: Product;
  emoji: string;
  qtyInCart: number;
  disabled: boolean;
  onAdd: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      data-testid={`product-card-${item.id}`}
      onClick={onOpen}
      className="w-36 shrink-0 flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden cursor-pointer transition-all duration-150 active:scale-[0.97]"
    >
      <div className="relative h-24 bg-gray-100 flex items-center justify-center">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt={item.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="text-3xl select-none">{emoji}</span>
        )}
        {qtyInCart > 0 && (
          <span className="absolute top-1.5 right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-[#25d366] text-[10px] font-bold text-white shadow">
            {qtyInCart}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-2 flex-1">
        <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">
          {item.name}
        </p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-xs font-bold text-gray-800">
            R$&nbsp;{item.price.toFixed(2)}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            disabled={disabled}
            className="rounded-full bg-[#25d366] w-6 h-6 flex items-center justify-center text-sm font-bold text-white hover:bg-[#1dbd5a] disabled:opacity-40 transition-colors"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────

function Sidebar({
  categories,
  selectedCategoryId,
  onSelect,
}: {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelect: (cat: Category) => void;
}) {
  return (
    <div className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-gray-200 bg-white p-2">
      <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
        Cardápio
      </p>
      {categories.map((cat) => {
        const isSelected = selectedCategoryId === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat)}
            className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors ${
              isSelected
                ? "bg-[#25d366] text-white shadow-sm"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className="text-base leading-none">{categoryEmoji(cat.name)}</span>
            <span className="leading-tight">{cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── CheckoutBar ──────────────────────────────────────────────

function CheckoutBar({
  stage,
  address,
  deliveryMethod,
  paymentMethod,
  cart,
  disabled,
  onDeliveryMethod,
  onAddressConfirm,
  onAddressEdit,
  onPayment,
  onFinalConfirm,
  onEditOrder,
}: {
  stage: Stage;
  address: Address;
  deliveryMethod: "delivery" | "pickup" | null;
  paymentMethod: "dinheiro" | "cartao" | "pix" | null;
  cart: CartItem[];
  disabled: boolean;
  onDeliveryMethod: (t: "delivery" | "pickup") => void;
  onAddressConfirm: () => void;
  onAddressEdit: () => void;
  onPayment: (m: "dinheiro" | "cartao" | "pix") => void;
  onFinalConfirm: () => void;
  onEditOrder: () => void;
}) {
  const chip =
    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-40 transition-colors";

  if (stage === "DELIVERY_TYPE") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          disabled={disabled}
          onClick={() => onDeliveryMethod("delivery")}
          className={`${chip} border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100`}
        >
          🛵 Entrega
        </button>
        <button
          disabled={disabled}
          onClick={() => onDeliveryMethod("pickup")}
          className={`${chip} border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100`}
        >
          🏪 Retirada
        </button>
      </div>
    );
  }

  if (stage === "ADDRESS_INPUT") {
    return null;
  }

  if (stage === "ADDRESS_DETAILS") {
    return null;
  }

  if (stage === "ADDRESS_CONFIRM") {
    const summary = formatAddress(address);
    const missing: string[] = [];
    if (!address.street.trim())       missing.push("rua");
    if (!address.number.trim())       missing.push("número");
    if (!address.neighborhood.trim()) missing.push("bairro");
    const isComplete = missing.length === 0;
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          📍 {summary || "—"}
        </div>
        {!isComplete && (
          <p data-testid="address-error" className="text-xs text-orange-500">
            Faltando: {missing.join(", ")}
          </p>
        )}
        <div className="flex gap-2">
          <button
            data-testid="address-confirm-button"
            disabled={disabled || !isComplete}
            onClick={onAddressConfirm}
            className={`${chip} border-[#25d366] bg-[#e7fbe8] text-green-900 hover:bg-[#d0f5d2]`}
          >
            ✅ Confirmar endereço
          </button>
          <button
            disabled={disabled}
            onClick={onAddressEdit}
            className={`${chip} border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
          >
            ✏️ Editar
          </button>
        </div>
      </div>
    );
  }

  if (stage === "ASK_NAME") {
    return null;
  }

  if (stage === "PAYMENT") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          disabled={disabled}
          onClick={() => onPayment("pix")}
          className={`${chip} border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100`}
        >
          📱 Pix
        </button>
        <button
          disabled={disabled}
          onClick={() => onPayment("cartao")}
          className={`${chip} border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100`}
        >
          💳 Cartão
        </button>
        <button
          disabled={disabled}
          onClick={() => onPayment("dinheiro")}
          className={`${chip} border-green-200 bg-green-50 text-green-800 hover:bg-green-100`}
        >
          💵 Dinheiro
        </button>
      </div>
    );
  }

  if (stage === "REVIEW_ORDER") {
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const pmtLabel: Record<string, string> = {
      dinheiro: "💵 Dinheiro",
      cartao: "💳 Cartão",
      pix: "📱 Pix",
    };
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
          <p className="mb-1 text-[11px] font-bold text-green-800">🧾 Seu pedido</p>
          <div className="flex flex-col gap-0.5">
            {cart.map((item) => (
              <div
                key={item.name}
                className="flex items-baseline gap-1.5 text-xs text-gray-800"
              >
                <span className="shrink-0 font-bold text-gray-400">x{item.qty}</span>
                <span className="flex-1">{item.name}</span>
                <span className="shrink-0 font-medium">
                  R$&nbsp;{(item.price * item.qty).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between border-t border-green-200 pt-1 text-xs font-bold text-green-900">
            <span>Total</span>
            <span>R$&nbsp;{total.toFixed(2)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2">
            <p className="text-[10px] font-bold text-blue-800">
              {deliveryMethod === "delivery" ? "📍 Entrega" : "🏪 Retirada"}
            </p>
            <p className="mt-0.5 text-[11px] text-blue-900 leading-tight">
              {deliveryMethod === "delivery"
                ? formatAddress(address)
                : "Retirada no local"}
            </p>
          </div>
          <div className="min-w-[90px] rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-2">
            <p className="text-[10px] font-bold text-purple-800">Pagamento</p>
            <p className="mt-0.5 text-[11px] font-semibold text-purple-900">
              {paymentMethod ? pmtLabel[paymentMethod] : "-"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            data-testid="checkout-confirm-btn"
            disabled={disabled}
            onClick={onFinalConfirm}
            className="flex-1 rounded-xl bg-[#25d366] py-2 text-xs font-bold text-white shadow-sm hover:bg-[#1dbd5a] disabled:opacity-50 transition-colors"
          >
            ✅ Confirmar pedido
          </button>
          <button
            disabled={disabled}
            onClick={onEditOrder}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            ✏️ Editar
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── useCartState — cart state only, no menu/AI logic ────────

function useCartState() {
  const [cart, setCart] = useState<CartItem[]>([]);

  const decrementItem = useCallback((id: string) => {
    setCart((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, qty: c.qty - 1 } : c))
        .filter((c) => c.qty > 0),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { cart, setCart, decrementItem, removeItem };
}

// ─── useMenuState — menu data only, no business logic ─────────

function useMenuState() {
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/chat-sim")
      .then((r) => r.json())
      .then((data) => {
        const raw: MenuCategory[] = data?.data?.categories ?? [];
        setMenu(raw);
        const first = raw[0];
        if (first) setSelectedCategoryId(first.id);
      })
      .catch(() => {});
  }, []);

  const categories = useMemo<Category[]>(
    () => menu.map((c) => ({ id: c.id, name: c.name, imageUrl: c.imageUrl })),
    [menu],
  );

  const products = useMemo<Product[]>(
    () =>
      menu.flatMap((c) =>
        c.items.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          image: i.imageUrl ?? c.imageUrl,
          description: i.description,
          categoryId: c.id,
        })),
      ),
    [menu],
  );

  return { menu, categories, products, selectedCategoryId, setSelectedCategoryId };
}

// ─── Main page ────────────────────────────────────────────────

export default function ChatSimPage() {
  // ── Menu ────────────────────────────────────────────────────
  const { menu, categories, products, selectedCategoryId, setSelectedCategoryId } = useMenuState();

  // ── Chat ────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [inputText, setInputText] = useState("");
  const [ui, setUi] = useState<UIState>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Cart ────────────────────────────────────────────────────
  const { cart, setCart, decrementItem, removeItem } = useCartState();

  // ── Product modal ────────────────────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // ── Stage / flow ────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("BROWSE");
  const [finalizeAttemptCount, setFinalizeAttemptCount] = useState(0);
  const [upsellOffered, setUpsellOffered] = useState<"drink" | "dessert" | null>(null);

  // ── Checkout data ────────────────────────────────────────────
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup" | null>(null);
  const [address, setAddress] = useState<Address>({
    street: "",
    number: "",
    neighborhood: "",
    complement: "",
  });
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"dinheiro" | "cartao" | "pix" | null>(null);

  // ── App mode + QA replay ─────────────────────────────────────
  const [appMode, setAppMode] = useState<"human" | "automatic">("human");
  const [replayScenario,  setReplayScenario]  = useState<QAScenario | null>(null);
  const [replayStep,      setReplayStep]      = useState(0);
  const [replayActions,   setReplayActions]   = useState<ReplayStep[]>([]);
  const isReplayingRef        = useRef(false);
  const executeReplayStepRef  = useRef<((step: ReplayStep) => void) | null>(null);

  // ── Auto-scroll ──────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ui]);


  // ─── sendText ────────────────────────────────────────────────

  const sendText = useCallback(
    async (
      text: string,
      cartSnap: CartItem[],
      stageSnap: Stage = stage,
      upsellOfferedSnap: "drink" | "dessert" | null = upsellOffered,
    ) => {
      // During replay: suppress all AI/network calls — state transitions only
      if (isReplayingRef.current) return;
      setUi("thinking");
      const trimmed = text.trim();

      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user" as const, content: trimmed, ts: new Date() },
      ]);

      const newHistory: HistoryEntry[] = [
        ...history,
        { role: "user" as const, content: trimmed },
      ];

      try {
        const res = await fetch("/api/chat-sim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history,
            cart: cartSnap,
            stage: stageSnap,
            upsellOffered: upsellOfferedSnap,
          }),
        });

        const data = await res.json();
        const reply: string =
          data?.data?.reply ?? "Desculpe, algo deu errado 😅";

        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant" as const, content: reply, ts: new Date() },
        ]);
        setHistory([...newHistory, { role: "assistant" as const, content: reply }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant" as const,
            content: "Ops! Tivemos um problema. Tente novamente.",
            ts: new Date(),
          },
        ]);
      } finally {
        setUi("idle");
      }
    },
    [history, stage, upsellOffered],
  );

  // ── Initial greeting ─────────────────────────────────────────
  const greetedRef = useRef(false);
  useEffect(() => {
    if (categories.length === 0 || greetedRef.current) return;
    greetedRef.current = true;
    sendText("Olá!", [], "BROWSE", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  // ─── Handlers ────────────────────────────────────────────────

  const handleCategoryClick = useCallback((cat: Category) => {
    setSelectedCategoryId(cat.id);
  }, [setSelectedCategoryId]);

  const handleItemAdd = useCallback(
    (item: { id: string; name: string; price: number }) => {
      const existing = cart.find((c) => c.id === item.id);
      const newCart = existing
        ? cart.map((c) => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
        : [...cart, { id: item.id, name: item.name, price: item.price, qty: 1 }];
      setCart(newCart);
      sendText(`Adicionar ${item.name}`, newCart, stage, upsellOffered);
    },
    [cart, stage, upsellOffered, sendText],
  );

  const handleFinalizeClick = useCallback(() => {
    // Adjustment 1: empty cart → guide without AI call
    if (cart.length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant" as const,
          content:
            "Seu carrinho está vazio! Selecione itens no cardápio ao lado antes de finalizar 👈",
          ts: new Date(),
        },
      ]);
      return;
    }

    // Already in checkout → ignore (button is disabled, but guard just in case)
    if (stage !== "BROWSE") return;

    // Fast-track if user has already gone through upsell sequence once
    if (finalizeAttemptCount >= 1) {
      setFinalizeAttemptCount((n) => n + 1);
      setStage("DELIVERY_TYPE");
      sendText("Confirmar pedido", cart, "DELIVERY_TYPE", upsellOffered);
      return;
    }

    const cartNames = new Set(cart.map((c) => c.name));

    // Determine which upsell to offer next based on upsellOffered progression:
    // null → try drink → try dessert → checkout

    if (upsellOffered === null) {
      const drinkCat = findBeverageCat(menu);
      const hasDrink = drinkCat?.items.some((i) => cartNames.has(i.name)) ?? false;
      if (drinkCat && !hasDrink) {
        setUpsellOffered("drink");
        setSelectedCategoryId(drinkCat.id);
        sendText("Quero finalizar o pedido", cart, "BROWSE", "drink");
        return;
      }
      const dessertCat = findDessertCat(menu);
      const hasDessert = dessertCat?.items.some((i) => cartNames.has(i.name)) ?? false;
      if (dessertCat && !hasDessert) {
        setUpsellOffered("dessert");
        setSelectedCategoryId(dessertCat.id);
        sendText("Quero finalizar o pedido", cart, "BROWSE", "dessert");
        return;
      }
      // All categories covered
      setFinalizeAttemptCount(1);
      setStage("DELIVERY_TYPE");
      sendText("Confirmar pedido", cart, "DELIVERY_TYPE", null);
      return;
    }

    if (upsellOffered === "drink") {
      const dessertCat = findDessertCat(menu);
      const hasDessert = dessertCat?.items.some((i) => cartNames.has(i.name)) ?? false;
      if (dessertCat && !hasDessert) {
        setUpsellOffered("dessert");
        setSelectedCategoryId(dessertCat.id);
        sendText("Quero finalizar o pedido", cart, "BROWSE", "dessert");
        return;
      }
      setFinalizeAttemptCount(1);
      setStage("DELIVERY_TYPE");
      sendText("Confirmar pedido", cart, "DELIVERY_TYPE", "drink");
      return;
    }

    // upsellOffered === "dessert" → proceed to checkout
    setFinalizeAttemptCount(1);
    setStage("DELIVERY_TYPE");
    sendText("Confirmar pedido", cart, "DELIVERY_TYPE", "dessert");
  }, [cart, finalizeAttemptCount, menu, stage, upsellOffered, sendText]);

  const handleBackToBrowse = useCallback(() => {
    setStage("BROWSE");
    setDeliveryMethod(null);
    setAddressConfirmed(false);
    setPaymentMethod(null);
    sendText("Ver cardápio", cart, "BROWSE", upsellOffered);
  }, [cart, upsellOffered, sendText]);

  const handleDeliveryMethod = useCallback(
    (type: "delivery" | "pickup") => {
      setDeliveryMethod(type);
      if (type === "pickup") {
        setStage("ASK_NAME");
        sendText("Quero retirar no local", cart, "ASK_NAME", upsellOffered);
      } else {
        setStage("ADDRESS_INPUT");
        sendText("Quero entrega no endereço", cart, "ADDRESS_INPUT", upsellOffered);
      }
    },
    [cart, upsellOffered, sendText],
  );

  const handleAddressInput = useCallback(
    (text: string) => {
      const { street, number } = parseStreetLine(text);
      setAddress((prev) => ({ ...prev, street, number }));
      if (!number) {
        sendText(text, cart, "ADDRESS_INPUT", upsellOffered);
        return;
      }
      setStage("ADDRESS_DETAILS");
      sendText(text, cart, "ADDRESS_DETAILS", upsellOffered);
    },
    [cart, upsellOffered, sendText],
  );

  const handleAddressDetails = useCallback(
    (text: string) => {
      const { neighborhood, complement } = parseNeighborhoodLine(text);
      if (!neighborhood.trim()) {
        sendText(text, cart, "ADDRESS_DETAILS", upsellOffered);
        return;
      }
      setAddress((prev) => ({ ...prev, neighborhood, complement }));
      setStage("ADDRESS_CONFIRM");
      sendText(text, cart, "ADDRESS_CONFIRM", upsellOffered);
    },
    [cart, upsellOffered, sendText],
  );

  const handleAddressConfirm = useCallback(() => {
    setAddressConfirmed(true);
    setStage("ASK_NAME");
    sendText("Confirmar endereço", cart, "ASK_NAME", upsellOffered);
  }, [cart, upsellOffered, sendText]);

  const handleAddressEdit = useCallback(() => {
    setStage("ADDRESS_INPUT");
    sendText("Editar endereço", cart, "ADDRESS_INPUT", upsellOffered);
  }, [cart, upsellOffered, sendText]);

  const handleNameInput = useCallback(
    (text: string) => {
      setCustomerName(text.trim());
      setStage("PAYMENT");
      sendText(text, cart, "PAYMENT", upsellOffered);
    },
    [cart, upsellOffered, sendText],
  );

  const handlePayment = useCallback(
    (method: "dinheiro" | "cartao" | "pix") => {
      setPaymentMethod(method);
      setStage("REVIEW_ORDER");
      const label = { dinheiro: "Dinheiro", cartao: "Cartão", pix: "Pix" }[method];
      sendText(`Pagar com ${label}`, cart, "REVIEW_ORDER", upsellOffered);
    },
    [cart, upsellOffered, sendText],
  );

  const handleFinalConfirm = useCallback(() => {
    setStage("DONE");
    sendText("Confirmar pedido final", cart, "DONE", upsellOffered);
  }, [cart, upsellOffered, sendText]);

  const handleEditOrder = useCallback(() => {
    setStage("BROWSE");
    setDeliveryMethod(null);
    setAddressConfirmed(false);
    setPaymentMethod(null);
    sendText("Editar pedido", cart, "BROWSE", upsellOffered);
  }, [cart, upsellOffered, sendText]);

  // ── QA Replay ────────────────────────────────────────────────
  //
  // executeReplayStepRef is re-assigned on every render so it always
  // closes over the latest handlers and state — the "live ref" pattern.

  executeReplayStepRef.current = (step: ReplayStep) => {
    switch (step.type) {
      case "add_product": {
        const prod = findReplayProduct(products, step.productName);
        if (prod) handleItemAdd(prod);
        break;
      }
      case "add_first_from_category": {
        const cat  = findCatByType(menu, step.categoryType);
        const prod = cat ? products.find((p) => p.categoryId === cat.id) : null;
        if (prod) handleItemAdd(prod);
        break;
      }
      case "remove_product": {
        const item = cart.find(
          (c) => c.name.toLowerCase() === step.productName.toLowerCase(),
        );
        if (item) removeItem(item.id);
        break;
      }
      case "switch_category": {
        const cat = findCatByType(menu, step.categoryType);
        if (cat) setSelectedCategoryId(cat.id);
        break;
      }
      case "open_product_modal": {
        const prod = findReplayProduct(products, step.productName);
        if (prod) setSelectedProduct(prod);
        break;
      }
      case "close_modal":
        setSelectedProduct(null);
        break;
      case "finalize":
        handleFinalizeClick();
        break;
      case "accept_upsell": {
        // Add first product from the currently-highlighted upsell category,
        // then advance the upsell sequence by calling finalize again.
        const prod = products.find((p) => p.categoryId === selectedCategoryId) ?? products[0];
        if (prod) handleItemAdd(prod);
        setTimeout(() => handleFinalizeClick(), 380);
        break;
      }
      case "refuse_upsell":
        handleFinalizeClick();
        break;
      case "select_delivery":
        handleDeliveryMethod(step.method);
        break;
      case "input_address":
        handleAddressInput(step.line1);
        break;
      case "_address_details":
        handleAddressDetails(step.text);
        break;
      case "confirm_address":
        handleAddressConfirm();
        break;
      case "input_name":
        handleNameInput(step.name);
        break;
      case "select_payment":
        handlePayment(step.method);
        break;
      case "confirm_order":
        handleFinalConfirm();
        break;
      case "go_back_to_browse":
        handleBackToBrowse();
        break;
      default:
        break;
    }
  };

  // Replay effect — fires one step every 700ms
  useEffect(() => {
    if (!replayScenario) return;

    if (replayStep >= replayActions.length) {
      // All steps done
      isReplayingRef.current = false;
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant" as const,
          content: `✅ Replay concluído: "${replayScenario.name}"`,
          ts: new Date(),
        },
      ]);
      setReplayScenario(null);
      return;
    }

    const step = replayActions[replayStep];
    if (!step) return;

    const timer = setTimeout(() => {
      executeReplayStepRef.current?.(step);
      setReplayStep((s) => s + 1);
    }, 700);

    return () => clearTimeout(timer);
  }, [replayScenario, replayStep, replayActions]);

  const startReplay = useCallback((scenario: QAScenario) => {
    // Full simulator reset
    setCart([]);
    setStage("BROWSE");
    setMessages([
      {
        id: uid(),
        role: "assistant" as const,
        content: `🔄 Reproduzindo: "${scenario.name}"`,
        ts: new Date(),
      },
    ]);
    setHistory([]);
    setDeliveryMethod(null);
    setAddress({ street: "", number: "", neighborhood: "", complement: "" });
    setAddressConfirmed(false);
    setCustomerName("");
    setPaymentMethod(null);
    setFinalizeAttemptCount(0);
    setUpsellOffered(null);
    setSelectedProduct(null);

    const expanded = expandForReplay(scenario.actions);
    isReplayingRef.current = true;
    setReplayActions(expanded);
    setReplayStep(0);
    setReplayScenario(scenario);
  }, []);

  // ── Text input submission ─────────────────────────────────────

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const text = inputText.trim();
      if (!text || ui === "thinking") return;
      setInputText("");

      if (stage === "ADDRESS_INPUT") {
        handleAddressInput(text);
      } else if (stage === "ADDRESS_DETAILS") {
        handleAddressDetails(text);
      } else if (stage === "ASK_NAME") {
        handleNameInput(text);
      } else {
        sendText(text, cart, stage, upsellOffered);
      }
    },
    [
      inputText,
      ui,
      stage,
      cart,
      upsellOffered,
      sendText,
      handleAddressInput,
      handleAddressDetails,
      handleNameInput,
    ],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // ─── Derived ─────────────────────────────────────────────────

  const isCheckoutStage = stage !== "BROWSE" && stage !== "DONE";
  const selectedCat = categories.find((c) => c.id === selectedCategoryId) ?? null;
  const catEmoji = selectedCat ? categoryEmoji(selectedCat.name) : "🍽️";
  const filteredProducts = useMemo(
    () => products.filter((p) => p.categoryId === selectedCategoryId),
    [products, selectedCategoryId],
  );

  // Suppress addressConfirmed warning — used implicitly via setAddressConfirmed
  void addressConfirmed;
  void customerName;

  // ─── Render ──────────────────────────────────────────────────

  return (
    /* Outer shell */
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-gray-200">

      {/* ── Mode toggle strip ──────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1.5 border-b border-gray-300 bg-white px-4 py-2">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Modo
        </span>
        {(["human", "automatic"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setAppMode(m)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              appMode === m
                ? "bg-[#128c7e] text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {m === "human" ? "👤 Humano" : "🤖 Automático"}
          </button>
        ))}
        {replayScenario && (
          <span className="ml-auto animate-pulse text-xs font-medium text-orange-600">
            ▶ Reproduzindo {replayStep}/{replayActions.length}
          </span>
        )}
      </div>

      {/* ── Content area ───────────────────────────────────── */}
      <div
        className={`flex flex-1 gap-4 overflow-hidden p-4 ${
          appMode === "human" ? "items-center justify-center" : ""
        }`}
      >

      {/* ── Phone frame wrapper ─────────────────────────────── */}
      <div
        className={`flex h-full items-center ${
          appMode === "automatic"
            ? "w-[390px] shrink-0"
            : "w-full max-w-[390px]"
        }`}
      >
      <div
        data-testid="phone-frame"
        data-stage={stage}
        className="relative flex h-full w-full flex-col overflow-hidden bg-white sm:rounded-[2rem] sm:border-[6px] sm:border-gray-800 sm:shadow-2xl"
      >

        {/* WhatsApp-style header */}
        <div className="shrink-0 flex items-center gap-3 bg-[#128c7e] px-4 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-lg leading-none">
            🍕
          </div>
          <div>
            <p className="text-sm font-bold text-white">FOOCCI</p>
            <p className="text-[10px] text-green-200">Simulador · Visão mobile</p>
          </div>
        </div>

        {/* ── Chat area — dominant (~80%) ──────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#ece5dd]">
          {messages.map((msg) => (
            <Bubble key={msg.id} msg={msg} />
          ))}
          {ui === "thinking" && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* ── Bottom action zone (~20%) ────────────────────── */}
        <div className="shrink-0 flex flex-col bg-white">

          {/* Category tabs — horizontal scroll, BROWSE only */}
          {stage === "BROWSE" && categories.length > 0 && (
            <div className="flex overflow-x-auto gap-2 border-t border-gray-100 px-3 py-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  data-testid={`category-tab-${cat.id}`}
                  onClick={() => handleCategoryClick(cat)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedCategoryId === cat.id
                      ? "bg-[#25d366] text-white shadow-sm"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {categoryEmoji(cat.name)} {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Product carousel — BROWSE + category selected */}
          {stage === "BROWSE" && selectedCat && (
            <div data-testid="browse-area" className="border-t border-gray-100 py-2">
              <div className="flex overflow-x-auto gap-3 px-3 pb-1">
                {filteredProducts.map((product) => {
                  const qty = cart.find((c) => c.id === product.id)?.qty ?? 0;
                  return (
                    <ProductCard
                      key={product.id}
                      item={product}
                      emoji={catEmoji}
                      qtyInCart={qty}
                      disabled={ui === "thinking"}
                      onAdd={() => handleItemAdd(product)}
                      onOpen={() => setSelectedProduct(product)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Checkout UI — checkout stages only */}
          {isCheckoutStage && (
            <div data-testid="checkout-area" className="border-t border-gray-100 px-4 py-3">
              <CheckoutBar
                stage={stage}
                address={address}
                deliveryMethod={deliveryMethod}
                paymentMethod={paymentMethod}
                cart={cart}
                disabled={ui === "thinking"}
                onDeliveryMethod={handleDeliveryMethod}
                onAddressConfirm={handleAddressConfirm}
                onAddressEdit={handleAddressEdit}
                onPayment={handlePayment}
                onFinalConfirm={handleFinalConfirm}
                onEditOrder={handleEditOrder}
              />
            </div>
          )}

          {/* Cart bar */}
          <CartBar cart={cart} onDecrement={decrementItem} onRemove={removeItem} />

          {/* Action bar */}
          {stage === "BROWSE" && (
            <div className="border-t border-gray-100 px-3 py-2">
              <button
                data-testid="finalize-button"
                onClick={handleFinalizeClick}
                disabled={ui === "thinking"}
                className="w-full rounded-full bg-[#25d366] px-3 py-2 text-sm font-bold text-white hover:bg-[#1dbd5a] disabled:opacity-40 transition-colors"
              >
                ✅ Finalizar pedido
              </button>
            </div>
          )}
          {/* Back to menu during checkout */}
          {stage !== "BROWSE" && stage !== "DONE" && (
            <div className="border-t border-gray-100 px-3 py-2">
              <button
                onClick={handleBackToBrowse}
                disabled={ui === "thinking"}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
              >
                ← Voltar ao cardápio
              </button>
            </div>
          )}

          {/* Done state */}
          {stage === "DONE" && (
            <div data-testid="stage-done" className="border-t border-gray-100 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-green-700">
                🎉 Pedido enviado com sucesso!
              </p>
            </div>
          )}

          {/* Text input */}
          {stage !== "DONE" && (
            <form
              onSubmit={handleSubmit}
              className="flex gap-2 items-end border-t border-gray-200 bg-white px-3 py-2"
            >
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={ui === "thinking"}
                placeholder={
                  stage === "ADDRESS_INPUT"
                    ? "Ex: Rua das Flores, 123"
                    : stage === "ADDRESS_DETAILS"
                    ? "Ex: Centro, Apto 42"
                    : stage === "ASK_NAME"
                    ? "Seu nome"
                    : "Digite uma mensagem..."
                }
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#25d366] focus:outline-none focus:ring-1 focus:ring-[#25d366] disabled:opacity-50"
                style={{ maxHeight: "5rem" }}
              />
              <button
                type="submit"
                disabled={!inputText.trim() || ui === "thinking"}
                className="shrink-0 rounded-full bg-[#25d366] p-2 text-white hover:bg-[#1dbd5a] disabled:opacity-40 transition-colors"
              >
                <svg className="h-4 w-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </form>
          )}
        </div>

        {/* Product detail modal — full-screen overlay inside phone frame */}
        {selectedProduct && (
          <ProductModal
            product={selectedProduct}
            emoji={catEmoji}
            qtyInCart={cart.find((c) => c.id === selectedProduct.id)?.qty ?? 0}
            disabled={ui === "thinking"}
            onAdd={() => handleItemAdd(selectedProduct)}
            onClose={() => setSelectedProduct(null)}
          />
        )}
      </div>

      </div> {/* phone frame wrapper */}

      {/* ── QA Panel — automatic mode only ─────────────────── */}
      {appMode === "automatic" && (
        <div className="flex-1 h-full overflow-y-auto">
          <QAPanel
            scenarios={allScenarios}
            criticalScenarioIds={CRITICAL_SCENARIO_IDS}
            onReplay={startReplay}
            replayingScenarioId={replayScenario?.id ?? null}
            replayStep={replayStep}
            replayTotal={replayActions.length}
          />
        </div>
      )}

      </div> {/* content area */}

      <style jsx>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
