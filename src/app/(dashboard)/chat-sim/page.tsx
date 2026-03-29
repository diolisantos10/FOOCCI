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

// ─── ProductCard ──────────────────────────────────────────────

function ProductCard({
  item,
  categoryImage,
  emoji,
  qtyInCart,
  disabled,
  onAdd,
}: {
  item: MenuItem;
  categoryImage: string | null;
  emoji: string;
  qtyInCart: number;
  disabled: boolean;
  onAdd: () => void;
}) {
  const imageUrl = item.imageUrl ?? categoryImage;
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="relative h-24 bg-gray-100 flex items-center justify-center">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
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
        {item.description && (
          <p className="text-[10px] text-gray-500 leading-snug line-clamp-2">
            {item.description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-xs font-bold text-gray-800">
            R$&nbsp;{item.price.toFixed(2)}
          </span>
          <button
            onClick={onAdd}
            disabled={disabled}
            className="rounded-full bg-[#25d366] px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-[#1dbd5a] disabled:opacity-40 transition-colors"
          >
            + Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────

function Sidebar({
  menu,
  selectedCategory,
  onSelect,
}: {
  menu: MenuCategory[];
  selectedCategory: string | null;
  onSelect: (cat: MenuCategory) => void;
}) {
  return (
    <div className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-gray-200 bg-white p-2">
      <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
        Cardápio
      </p>
      {menu.map((cat) => {
        const isSelected = selectedCategory === cat.name;
        return (
          <button
            key={cat.name}
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
    return (
      <p className="text-xs text-gray-500 italic">
        Digite o endereço na caixa acima...
      </p>
    );
  }

  if (stage === "ADDRESS_DETAILS") {
    return (
      <p className="text-xs text-gray-500 italic">
        Digite o bairro e complemento acima...
      </p>
    );
  }

  if (stage === "ADDRESS_CONFIRM") {
    const summary = formatAddress(address);
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          📍 {summary}
        </div>
        <div className="flex gap-2">
          <button
            disabled={disabled}
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
    return (
      <p className="text-xs text-gray-500 italic">Digite seu nome acima...</p>
    );
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

// ─── Main page ────────────────────────────────────────────────

export default function ChatSimPage() {
  // ── Menu ────────────────────────────────────────────────────
  const [menu, setMenu] = useState<MenuCategory[]>([]);

  // ── Chat ────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [inputText, setInputText] = useState("");
  const [ui, setUi] = useState<UIState>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Cart ────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);

  // ── Stage / flow ────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("BROWSE");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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

  // ── Auto-scroll ──────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ui]);

  // ── Fetch menu + select first category ──────────────────────
  useEffect(() => {
    fetch("/api/chat-sim")
      .then((r) => r.json())
      .then((data) => {
        const cats: MenuCategory[] = data?.data?.categories ?? [];
        setMenu(cats);
        if (cats.length > 0) setSelectedCategory(cats[0].name);
      })
      .catch(() => {});
  }, []);

  // ─── sendText ────────────────────────────────────────────────

  const sendText = useCallback(
    async (
      text: string,
      cartSnap: CartItem[],
      stageSnap: Stage = stage,
      upsellOfferedSnap: "drink" | "dessert" | null = upsellOffered,
    ) => {
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
    if (menu.length === 0 || greetedRef.current) return;
    greetedRef.current = true;
    sendText("Olá!", [], "BROWSE", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  // ─── Handlers ────────────────────────────────────────────────

  const handleCategoryClick = useCallback((cat: MenuCategory) => {
    setSelectedCategory(cat.name);
  }, []);

  const handleItemAdd = useCallback(
    (item: MenuItem) => {
      const existing = cart.find((c) => c.name === item.name);
      const newCart = existing
        ? cart.map((c) => c.name === item.name ? { ...c, qty: c.qty + 1 } : c)
        : [...cart, { name: item.name, price: item.price, qty: 1 }];
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
        setSelectedCategory(drinkCat.name);
        sendText("Quero finalizar o pedido", cart, "BROWSE", "drink");
        return;
      }
      const dessertCat = findDessertCat(menu);
      const hasDessert = dessertCat?.items.some((i) => cartNames.has(i.name)) ?? false;
      if (dessertCat && !hasDessert) {
        setUpsellOffered("dessert");
        setSelectedCategory(dessertCat.name);
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
        setSelectedCategory(dessertCat.name);
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
  const selectedCat = menu.find((c) => c.name === selectedCategory) ?? null;
  const catEmoji = selectedCat ? categoryEmoji(selectedCat.name) : "🍽️";

  // Suppress addressConfirmed warning — used implicitly via setAddressConfirmed
  void addressConfirmed;
  void customerName;

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-gray-50">
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left Sidebar ────────────────────────────────────── */}
        <Sidebar
          menu={menu}
          selectedCategory={selectedCategory}
          onSelect={handleCategoryClick}
        />

        {/* ── Main content ────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((msg) => (
              <Bubble key={msg.id} msg={msg} />
            ))}
            {ui === "thinking" && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* Product grid — BROWSE stage only */}
          {stage === "BROWSE" && selectedCat && (
            <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-3 py-3 max-h-64 overflow-y-auto">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {catEmoji} {selectedCat.name}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {selectedCat.items.map((item) => {
                  const qty = cart.find((c) => c.name === item.name)?.qty ?? 0;
                  return (
                    <ProductCard
                      key={item.name}
                      item={item}
                      categoryImage={selectedCat.imageUrl}
                      emoji={catEmoji}
                      qtyInCart={qty}
                      disabled={ui === "thinking"}
                      onAdd={() => handleItemAdd(item)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Checkout UI — checkout stages only */}
          {isCheckoutStage && (
            <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
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
          <CartBar cart={cart} />

          {/* Persistent bottom bar — adjustment 2: always visible during checkout */}
          {stage !== "DONE" && (
            <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-2 flex gap-2">
              <button
                onClick={handleBackToBrowse}
                disabled={ui === "thinking" || stage === "BROWSE"}
                className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                📖 Ver cardápio
              </button>
              <button
                onClick={handleFinalizeClick}
                disabled={ui === "thinking" || stage !== "BROWSE"}
                className="flex-1 rounded-full bg-[#25d366] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1dbd5a] disabled:opacity-40 transition-colors"
              >
                ✅ Finalizar pedido
              </button>
            </div>
          )}
          {stage === "DONE" && (
            <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3 text-center">
              <p className="text-sm font-semibold text-green-700">
                🎉 Pedido enviado com sucesso!
              </p>
            </div>
          )}

          {/* Text input */}
          {stage !== "DONE" && (
            <form
              onSubmit={handleSubmit}
              className="shrink-0 border-t border-gray-200 bg-white px-3 py-2 flex gap-2 items-end"
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
                    ? "Seu nome..."
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
      </div>

      <style jsx>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
