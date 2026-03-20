"use client";

/**
 * /chat-sim — High-conversion guided ordering simulation
 *
 * Flow:
 *  1. Greeting → shows all categories as chips
 *  2. Category selected → shows ALL items in that category (no pagination)
 *  3. Item selected → addToCart + snap back to remaining categories (rule: never re-show covered categories)
 *  4. "Finalizar" clicked → Phase 2 upsell: ONE missing category at a time
 *  5. All categories covered → order summary + delivery/pickup
 *
 * Never asks yes/no. Always presents explicit choices.
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
}

interface MenuCategory {
  name: string;
  items: MenuItem[];
}

interface CartItem {
  name: string;
  price: number;
  qty: number;
}

type HistoryEntry = { role: "user" | "assistant"; content: string };
type UIState = "idle" | "thinking" | "error";
type Phase   = "exploration" | "upsell";

type ChipBarMode =
  | { type: "categories"; categories: MenuCategory[] }
  | { type: "items"; category: string; items: MenuItem[] }
  | { type: "upsell"; category: string; items: MenuItem[] };

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

const UPSELL_TRIGGERS = [
  "so isso", "e isso", "pode fechar", "finalizar", "ja escolhi",
  "pode confirmar", "to bem", "acabei", "mais nada", "isso mesmo",
  "pode ir", "finalize", "fecha o pedido",
];

function isUpsellTrigger(text: string) {
  const n = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return UPSELL_TRIGGERS.some((t) => n.includes(t));
}

function extractItemsFromMessage(text: string, menu: MenuCategory[]): MenuItem[] {
  const lower = text.toLowerCase();
  return menu.flatMap((c) => c.items).filter((i) => lower.includes(i.name.toLowerCase()));
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

// ─── ChipBar ──────────────────────────────────────────────────

function ChipBar({
  mode,
  disabled,
  onCategorySelect,
  onItemSelect,
  onBack,
  onFinalize,
  onUpsellDecline,
}: {
  mode: ChipBarMode;
  disabled: boolean;
  onCategorySelect: (cat: MenuCategory) => void;
  onItemSelect: (item: MenuItem) => void;
  onBack: () => void;
  onFinalize: () => void;
  onUpsellDecline: () => void;
}) {
  const chip = "shrink-0 rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-40 transition-colors";

  // ── Category chips (remaining categories without cart items) ─
  if (mode.type === "categories") {
    return (
      <div className="flex flex-wrap gap-1.5 pb-0.5">
        {mode.categories.map((cat) => (
          <button
            key={cat.name}
            type="button"
            disabled={disabled}
            onClick={() => onCategorySelect(cat)}
            className={`${chip} border-[#25d366] bg-[#e7fbe8] text-green-900 hover:bg-[#d0f5d2]`}
          >
            {categoryEmoji(cat.name)} {cat.name}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={onFinalize}
          className={`${chip} border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100`}
        >
          ✅ Finalizar pedido
        </button>
      </div>
    );
  }

  // ── Item chips (all items in selected category — no pagination) ─
  if (mode.type === "items") {
    return (
      <div className="flex flex-wrap gap-1.5 pb-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onBack}
          className={`${chip} border-gray-300 bg-white text-gray-600 hover:bg-gray-50`}
        >
          ← Categorias
        </button>
        {mode.items.map((item) => (
          <button
            key={item.name}
            type="button"
            disabled={disabled}
            onClick={() => onItemSelect(item)}
            className={`${chip} border-[#25d366] bg-[#e7fbe8] text-green-900 hover:bg-[#d0f5d2]`}
          >
            {item.name} — R$&nbsp;{item.price.toFixed(2)}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={onFinalize}
          className={`${chip} border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100`}
        >
          ✅ Finalizar pedido
        </button>
      </div>
    );
  }

  // ── Upsell chips (one missing category at a time) ─────────
  return (
    <div className="flex flex-wrap gap-1.5 pb-0.5">
      <span className="shrink-0 self-center text-xs font-semibold text-purple-700">
        {categoryEmoji(mode.category)} {mode.category}:
      </span>
      {mode.items.map((item) => (
        <button
          key={item.name}
          type="button"
          disabled={disabled}
          onClick={() => onItemSelect(item)}
          className={`${chip} border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100`}
        >
          {item.name} — R$&nbsp;{item.price.toFixed(2)}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={onUpsellDecline}
        className={`${chip} border-gray-300 bg-white text-gray-500 hover:bg-gray-50`}
      >
        Pular {mode.category.toLowerCase()}
      </button>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────

export default function ChatSimPage() {
  const [messages,           setMessages]           = useState<ChatMessage[]>([]);
  const [menu,               setMenu]               = useState<MenuCategory[]>([]);
  const [cart,               setCart]               = useState<CartItem[]>([]);
  const [visitedCategories,  setVisitedCategories]  = useState<string[]>([]);
  const [phase,              setPhase]              = useState<Phase>("exploration");
  const [activeCategory,     setActiveCategory]     = useState<string | null>(null);
  const [input,              setInput]              = useState("");
  const [uiState,            setUiState]            = useState<UIState>("idle");
  const [errorMsg,           setErrorMsg]           = useState("");

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

  // ── chip bar mode ─────────────────────────────────────────
  // Rule 4: never re-show categories that already have cart items.
  // Rule 6: always show ALL items in a category (no pagination).

  function getChipMode(): ChipBarMode {
    if (phase === "exploration") {
      if (activeCategory) {
        const cat = menu.find((c) => c.name === activeCategory);
        return { type: "items", category: activeCategory, items: cat?.items ?? [] };
      }
      // Only show categories that do NOT yet have items in the cart
      const cartNames = new Set(cart.map((c) => c.name));
      const remaining = menu.filter(
        (c) => !c.items.some((i) => cartNames.has(i.name))
      );
      return { type: "categories", categories: remaining };
    }

    // Phase 2: upsell — find first category with no cart items
    const cartNames = new Set(cart.map((c) => c.name));
    const missing = menu.find((c) => !c.items.some((i) => cartNames.has(i.name)));
    if (missing) {
      return { type: "upsell", category: missing.name, items: missing.items };
    }
    // All categories covered → show empty category list (just Finalizar button)
    return { type: "categories", categories: [] };
  }

  // ── auto-scroll ───────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, uiState]);

  // ── core AI call ─────────────────────────────────────────

  const callAI = useCallback(async (
    history: HistoryEntry[],
    userText: string,
    currentCart: CartItem[],
    currentVisited: string[],
    isGreeting = false
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

  // ── load menu on mount ───────────────────────────────────

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
    callAI([], "oi", [], [], true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── send ─────────────────────────────────────────────────

  async function sendText(text: string, cartSnapshot?: CartItem[], visitedSnapshot?: string[]) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");

    if (phase === "exploration" && isUpsellTrigger(trimmed)) {
      setPhase("upsell");
    }

    // Optimistic cart update from typed text (chip clicks are handled separately)
    const foundItems = extractItemsFromMessage(trimmed, menu);
    foundItems.forEach(addToCart);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed, ts: new Date() };
    setMessages((prev) => [...prev, userMsg]);

    // Build snapshot of cart including any newly extracted items
    const effectiveCart = cartSnapshot ?? (() => {
      const updated = [...cart];
      foundItems.forEach((item) => {
        if (!updated.some((c) => c.name === item.name)) {
          updated.push({ name: item.name, price: item.price, qty: 1 });
        }
      });
      return updated;
    })();

    await callAI(history, trimmed, effectiveCart, visitedSnapshot ?? visitedCategories);
  }

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    sendText(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(input); }
  }

  // ── chip handlers ─────────────────────────────────────────

  function handleCategorySelect(cat: MenuCategory) {
    const newVisited = visitedCategories.includes(cat.name)
      ? visitedCategories
      : [...visitedCategories, cat.name];
    setVisitedCategories(newVisited);
    setActiveCategory(cat.name);
    sendText(`Ver ${cat.name}`, cart, newVisited);
  }

  function handleItemSelect(item: MenuItem) {
    addToCart(item);
    setActiveCategory(null); // snap back to remaining category chips
    const newCart = cart.some((c) => c.name === item.name)
      ? cart
      : [...cart, { name: item.name, price: item.price, qty: 1 }];
    sendText(`Quero ${item.name}`, newCart, visitedCategories);
  }

  function handleBack() {
    setActiveCategory(null);
  }

  function handleFinalize() {
    setPhase("upsell");
    setActiveCategory(null);
    sendText("só isso, pode finalizar");
  }

  function handleUpsellDecline() {
    const chipMode = getChipMode();
    if (chipMode.type === "upsell") {
      sendText(`não quero ${chipMode.category.toLowerCase()}, obrigado`);
    }
  }

  // ── reset ─────────────────────────────────────────────────

  function handleClear() {
    setMessages([]);
    setCart([]);
    setVisitedCategories([]);
    setPhase("exploration");
    setActiveCategory(null);
    setInput("");
    setErrorMsg("");
    setUiState("idle");
    greeted.current = true;
    callAI([], "oi", [], [], true);
  }

  // ─── render ───────────────────────────────────────────────

  const chipMode = getChipMode();

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
          {phase === "exploration" ? (
            <span className="rounded-full bg-blue-500/30 px-2.5 py-0.5 text-[10px] font-semibold text-blue-100">
              Seleção
            </span>
          ) : (
            <span className="rounded-full bg-amber-400/30 px-2.5 py-0.5 text-[10px] font-semibold text-amber-100">
              Finalizando
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

      {/* ── Composer ────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-gray-200 bg-white px-4 py-3"
      >
        {/* Context-aware chip bar */}
        <div className="mb-2.5">
          <ChipBar
            mode={chipMode}
            disabled={busy}
            onCategorySelect={handleCategorySelect}
            onItemSelect={handleItemSelect}
            onBack={handleBack}
            onFinalize={handleFinalize}
            onUpsellDecline={handleUpsellDecline}
          />
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite ou use os botões acima…"
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
