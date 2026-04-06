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

import { useState, useEffect, useRef, useCallback, useMemo, type FormEvent, type KeyboardEvent } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  | "DONE";

type PaymentMode = "pay_now" | "pay_on_delivery" | "pay_on_pickup";
type PaymentMethodSub = "card_machine" | "pix_in_person" | "cash";

interface Address {
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
}

interface Props {
  slug: string;
  restaurantName: string;
  logoUrl: string | null;
  categories: MenuCategory[];
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
  const m = raw.trim().match(/^(.*?),?\s*(\d+\S*)\s*$/);
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

// ── Bubble ────────────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
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
    <div className="relative flex shrink-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      {item.imageUrl ? (
        <button onClick={onOpen} className="block h-28 w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-20 w-full items-center justify-center bg-gray-50 text-3xl">
          {categoryEmoji(item.name)}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p
          onClick={onOpen}
          className="cursor-pointer text-xs font-semibold leading-tight text-gray-900 line-clamp-2"
        >
          {item.name}
        </p>
        {item.description && (
          <p className="text-[10px] text-gray-500 line-clamp-2">{item.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-xs font-bold text-gray-800">
            R$ {item.price.toFixed(2).replace(".", ",")}
          </span>
          <button
            onClick={onAdd}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-colors ${
              qty > 0
                ? "bg-[#25d366] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-[#25d366] hover:text-white"
            }`}
          >
            {qty > 0 ? `+${qty}` : "+"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Product modal ─────────────────────────────────────────────────────────────

function ProductModal({
  item,
  qty,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  qty: number;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl">
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-52 w-full object-cover" />
        )}
        <div className="p-5">
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="text-base font-bold text-gray-900">{item.name}</p>
            <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600">✕</button>
          </div>
          {item.description && (
            <p className="mb-3 text-sm text-gray-500">{item.description}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-gray-900">
              R$ {item.price.toFixed(2).replace(".", ",")}
            </span>
            <button
              onClick={onAdd}
              className="rounded-full bg-[#25d366] px-5 py-2 text-sm font-bold text-white hover:bg-[#1ebe5a]"
            >
              {qty > 0 ? `Adicionar mais (${qty} no carrinho)` : "Adicionar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cart bar ──────────────────────────────────────────────────────────────────

function CartBar({ cart, onFinalize }: { cart: CartItem[]; onFinalize: () => void }) {
  if (cart.length === 0) return null;
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-2.5">
      <button
        onClick={onFinalize}
        className="flex w-full items-center justify-between rounded-2xl bg-[#25d366] px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-[#1ebe5a]"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/30 text-xs font-bold">
          {count}
        </span>
        <span>Finalizar pedido</span>
        <span>R$ {total.toFixed(2).replace(".", ",")}</span>
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PedidoClient({ slug, restaurantName, logoUrl, categories }: Props) {
  // ── Chat ─────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [inputText, setInputText] = useState("");
  const [ui, setUi] = useState<UIState>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Menu nav ──────────────────────────────────────────────────────
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [selectedProduct, setSelectedProduct] = useState<MenuItem | null>(null);

  // ── Cart ──────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);

  // ── Stage / flow ──────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>("BROWSE");

  // ── Upsell engine ─────────────────────────────────────────────────
  const [upsellState, setUpsellState] = useState({
    offeredDrink: false,
    offeredDessert: false,
    refusedDrink: false,
    refusedDessert: false,
    lastUpsellCategory: null as "drink" | "dessert" | null,
  });

  // ── Checkout data ─────────────────────────────────────────────────
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup" | null>(null);
  const [address, setAddress] = useState<Address>({ street: "", number: "", neighborhood: "", complement: "" });
  const [customerName, setCustomerName] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [paymentMethodSub, setPaymentMethodSub] = useState<PaymentMethodSub | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  // ── Derived ───────────────────────────────────────────────────────
  const activeUpsell = useMemo((): "drink" | "dessert" | null => {
    const { lastUpsellCategory, offeredDrink, refusedDrink, offeredDessert, refusedDessert } = upsellState;
    if (lastUpsellCategory === "drink" && offeredDrink && !refusedDrink) return "drink";
    if (lastUpsellCategory === "dessert" && offeredDessert && !refusedDessert) return "dessert";
    return null;
  }, [upsellState]);

  const currentCategoryItems = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId)?.items ?? [],
    [categories, selectedCategoryId],
  );

  // ── Auto-scroll ───────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ui]);

  // ── sendText ──────────────────────────────────────────────────────
  const sendText = useCallback(
    async (
      text: string,
      cartSnap: CartItem[],
      stageSnap: Stage = stage,
      upsellOfferedSnap: "drink" | "dessert" | null = activeUpsell,
      deliveryMethodSnap: "delivery" | "pickup" | null = deliveryMethod,
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
        const res = await fetch(`/api/pedido/${slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history,
            cart: cartSnap,
            stage: stageSnap,
            upsellOffered: upsellOfferedSnap,
            deliveryMethod: deliveryMethodSnap,
          }),
        });

        const data = await res.json();
        const reply: string = data?.data?.reply ?? "Desculpe, algo deu errado 😅";

        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant" as const, content: reply, ts: new Date() },
        ]);
        setHistory([...newHistory, { role: "assistant" as const, content: reply }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant" as const, content: "Ops! Tivemos um problema. Tente novamente.", ts: new Date() },
        ]);
      } finally {
        setUi("idle");
      }
    },
    [slug, history, stage, activeUpsell, deliveryMethod],
  );

  // ── Initial greeting ──────────────────────────────────────────────
  const greetedRef = useRef(false);
  useEffect(() => {
    if (categories.length === 0 || greetedRef.current) return;
    greetedRef.current = true;
    sendText("Olá!", [], "BROWSE", null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleItemAdd = useCallback(
    (item: MenuItem) => {
      const existing = cart.find((c) => c.id === item.id);
      const newCart = existing
        ? cart.map((c) => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
        : [...cart, { id: item.id, name: item.name, price: item.price, qty: 1 }];
      setCart(newCart);
      sendText(`Adicionar ${item.name}`, newCart, stage, activeUpsell);
    },
    [cart, stage, activeUpsell, sendText],
  );

  const handleFinalizeClick = useCallback(() => {
    if (cart.length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant" as const,
          content: "Seu carrinho está vazio! Selecione itens antes de finalizar 👆",
          ts: new Date(),
        },
      ]);
      return;
    }
    if (stage !== "BROWSE") return;

    const cartIds = new Set(cart.map((c) => c.id));
    const allItems = categories.flatMap((c) => c.items);
    const drinkCat = findBeverageCat(categories);
    const dessertCat = findDessertCat(categories);
    const hasDrink = drinkCat ? drinkCat.items.some((i) => cartIds.has(i.id)) : false;
    const hasDessert = dessertCat ? dessertCat.items.some((i) => cartIds.has(i.id)) : false;

    const justRefusedDrink = upsellState.lastUpsellCategory === "drink" && !hasDrink;
    const justRefusedDessert = upsellState.lastUpsellCategory === "dessert" && !hasDessert;

    if (justRefusedDrink || justRefusedDessert) {
      setUpsellState((prev) => ({
        ...prev,
        refusedDrink: prev.refusedDrink || justRefusedDrink,
        refusedDessert: prev.refusedDessert || justRefusedDessert,
      }));
    }

    const refusedDrink = upsellState.refusedDrink || justRefusedDrink;
    const refusedDessert = upsellState.refusedDessert || justRefusedDessert;

    if (!hasDrink && !upsellState.offeredDrink && !refusedDrink && drinkCat) {
      setSelectedCategoryId(drinkCat.id);
      setUpsellState((prev) => ({ ...prev, offeredDrink: true, lastUpsellCategory: "drink" }));
      sendText("Quero finalizar o pedido", cart, "BROWSE", "drink");
      return;
    }

    if (!hasDessert && !upsellState.offeredDessert && !refusedDessert && dessertCat) {
      setSelectedCategoryId(dessertCat.id);
      setUpsellState((prev) => ({ ...prev, offeredDessert: true, lastUpsellCategory: "dessert" }));
      sendText("Quero finalizar o pedido", cart, "BROWSE", "dessert");
      return;
    }

    void allItems; // suppress unused warning
    setStage("DELIVERY_TYPE");
    sendText("Confirmar pedido", cart, "DELIVERY_TYPE", null);
  }, [cart, categories, stage, upsellState, sendText]);

  const handleDeliveryMethod = useCallback(
    (type: "delivery" | "pickup") => {
      setDeliveryMethod(type);
      if (type === "pickup") {
        setStage("ASK_NAME");
        sendText("Quero retirar no local", cart, "ASK_NAME", activeUpsell, type);
      } else {
        setStage("ADDRESS_INPUT");
        sendText("Quero entrega no endereço", cart, "ADDRESS_INPUT", activeUpsell, type);
      }
    },
    [cart, activeUpsell, sendText],
  );

  const handleAddressInput = useCallback(
    (text: string) => {
      const { street, number } = parseStreetLine(text);
      setAddress((prev) => ({ ...prev, street, number }));
      if (!number) {
        sendText(text, cart, "ADDRESS_INPUT", activeUpsell);
        return;
      }
      setStage("ADDRESS_DETAILS");
      sendText(text, cart, "ADDRESS_DETAILS", activeUpsell);
    },
    [cart, activeUpsell, sendText],
  );

  const handleAddressDetails = useCallback(
    (text: string) => {
      const { neighborhood, complement } = parseNeighborhoodLine(text);
      if (!neighborhood.trim()) {
        sendText(text, cart, "ADDRESS_DETAILS", activeUpsell);
        return;
      }
      setAddress((prev) => ({ ...prev, neighborhood, complement }));
      setStage("ADDRESS_CONFIRM");
      sendText(text, cart, "ADDRESS_CONFIRM", activeUpsell);
    },
    [cart, activeUpsell, sendText],
  );

  const handleAddressConfirm = useCallback(() => {
    setStage("ASK_NAME");
    sendText("Confirmar endereço", cart, "ASK_NAME", activeUpsell);
  }, [cart, activeUpsell, sendText]);

  const handleNameInput = useCallback(
    (text: string) => {
      if (!isValidName(text)) {
        sendText(text, cart, "ASK_NAME", activeUpsell);
        return;
      }
      setCustomerName(text.trim());
      setStage("PAYMENT");
      sendText(text, cart, "PAYMENT", activeUpsell);
    },
    [cart, activeUpsell, sendText],
  );

  const handlePaymentMode = useCallback(
    (mode: PaymentMode) => {
      setPaymentMode(mode);
      if (mode === "pay_now") {
        setStage("REVIEW_ORDER");
        sendText("Pagar agora (link)", cart, "REVIEW_ORDER", activeUpsell);
      } else {
        setStage("PAYMENT_METHOD");
        const label = mode === "pay_on_delivery" ? "Pagar na entrega" : "Pagar na retirada";
        sendText(label, cart, "PAYMENT_METHOD", activeUpsell);
      }
    },
    [cart, activeUpsell, sendText],
  );

  const handlePaymentMethodSub = useCallback(
    (method: PaymentMethodSub) => {
      setPaymentMethodSub(method);
      setStage("REVIEW_ORDER");
      const labels: Record<PaymentMethodSub, string> = {
        card_machine: "Cartão",
        pix_in_person: "Pix",
        cash: "Dinheiro",
      };
      sendText(`Pagar com ${labels[method]}`, cart, "REVIEW_ORDER", activeUpsell);
    },
    [cart, activeUpsell, sendText],
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
      setOrderId(data.orderId ?? data.data?.orderId ?? null);
      setStage("DONE");
      sendText("Confirmar pedido final", cart, "DONE", activeUpsell);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant" as const, content: "Erro ao confirmar pedido. Tente novamente.", ts: new Date() },
      ]);
    } finally {
      setUi("idle");
    }
  }, [slug, cart, customerName, deliveryMethod, address, paymentMode, paymentMethodSub, activeUpsell, sendText]);

  const handleBackToBrowse = useCallback(() => {
    setStage("BROWSE");
    setDeliveryMethod(null);
    setPaymentMode(null);
    setPaymentMethodSub(null);
    setOrderId(null);
    setUpsellState({ offeredDrink: false, offeredDessert: false, refusedDrink: false, refusedDessert: false, lastUpsellCategory: null });
    sendText("Ver cardápio", cart, "BROWSE", activeUpsell, null);
  }, [cart, activeUpsell, sendText]);

  // ── Input submit ──────────────────────────────────────────────────
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || ui === "thinking") return;
    setInputText("");

    switch (stage) {
      case "ADDRESS_INPUT":   handleAddressInput(text);   break;
      case "ADDRESS_DETAILS": handleAddressDetails(text); break;
      case "ASK_NAME":        handleNameInput(text);      break;
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
              className="flex-1 rounded-xl bg-[#25d366] py-2 text-sm font-bold text-white hover:bg-[#1ebe5a]"
            >
              Confirmar endereço
            </button>
            <button
              onClick={() => { setStage("ADDRESS_INPUT"); }}
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
      const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
      return (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-gray-500">Revise seu pedido</p>
          <div className="mb-2 max-h-32 overflow-y-auto">
            {cart.map((c) => (
              <div key={c.id} className="flex justify-between py-0.5 text-xs text-gray-700">
                <span>{c.name} × {c.qty}</span>
                <span>R$ {(c.price * c.qty).toFixed(2).replace(".", ",")}</span>
              </div>
            ))}
          </div>
          <div className="mb-3 flex justify-between border-t border-gray-100 pt-2 text-sm font-bold text-gray-900">
            <span>Total</span>
            <span>R$ {total.toFixed(2).replace(".", ",")}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleFinalConfirm}
              disabled={ui === "thinking"}
              className="flex-1 rounded-xl bg-[#25d366] py-2.5 text-sm font-bold text-white hover:bg-[#1ebe5a] disabled:opacity-50"
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
  const showInput = stage === "BROWSE" || stage === "ADDRESS_INPUT" || stage === "ADDRESS_DETAILS" || stage === "ASK_NAME";
  const inputPlaceholder =
    stage === "ADDRESS_INPUT"   ? "Ex: Rua das Flores, 123" :
    stage === "ADDRESS_DETAILS" ? "Ex: Vila Madalena, apto 42" :
    stage === "ASK_NAME"        ? "Seu nome…" :
    "Digite uma mensagem…";

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#ece5dd]">

      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 bg-[#128c7e] px-4 py-3 shadow">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={restaurantName} className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-xl leading-none">
            🍕
          </div>
        )}
        <div>
          <p className="text-sm font-bold text-white">{restaurantName}</p>
          <p className="text-[10px] text-green-200">
            {ui === "thinking" ? "digitando…" : "online"}
          </p>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <Bubble key={msg.id} msg={msg} />
        ))}
        {ui === "thinking" && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Category tabs — BROWSE only */}
      {stage === "BROWSE" && categories.length > 0 && (
        <div className="shrink-0 flex overflow-x-auto gap-2 border-t border-gray-200 bg-white px-3 py-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
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

      {/* Product grid — BROWSE only */}
      {stage === "BROWSE" && currentCategoryItems.length > 0 && (
        <div className="shrink-0 border-t border-gray-100 bg-gray-50">
          <div className="flex gap-3 overflow-x-auto px-3 py-3">
            {currentCategoryItems.map((item) => (
              <div key={item.id} className="w-36 shrink-0">
                <ProductCard
                  item={item}
                  qty={cart.find((c) => c.id === item.id)?.qty ?? 0}
                  onAdd={() => handleItemAdd(item)}
                  onOpen={() => setSelectedProduct(item)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cart bar */}
      {stage === "BROWSE" && (
        <CartBar cart={cart} onFinalize={handleFinalizeClick} />
      )}

      {/* Checkout panels */}
      {renderCheckoutPanel()}

      {/* Text input */}
      {showInput && (
        <form onSubmit={handleSubmit} className="shrink-0 flex items-end gap-2 border-t border-gray-200 bg-white px-3 py-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={inputPlaceholder}
            className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#25d366] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || ui === "thinking"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white disabled:opacity-40 hover:bg-[#1ebe5a] transition"
          >
            ➤
          </button>
        </form>
      )}

      {/* Back to browse link in non-BROWSE non-DONE stages */}
      {stage !== "BROWSE" && stage !== "DONE" && (
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-1.5 text-center">
          <button onClick={handleBackToBrowse} className="text-xs text-gray-400 hover:text-gray-600">
            ← Voltar ao cardápio
          </button>
        </div>
      )}

      {/* Product modal */}
      {selectedProduct && (
        <ProductModal
          item={selectedProduct}
          qty={cart.find((c) => c.id === selectedProduct.id)?.qty ?? 0}
          onAdd={() => {
            handleItemAdd(selectedProduct);
            setSelectedProduct(null);
          }}
          onClose={() => setSelectedProduct(null)}
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
