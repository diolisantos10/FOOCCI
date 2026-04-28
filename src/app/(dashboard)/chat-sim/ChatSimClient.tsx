"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import QRCode from "qrcode";

// ─── Types ────────────────────────────────────────────────────

interface Session {
  sessionId:  string;
  customerId: string;
}

interface ToolCall {
  name:       string;
  success:    boolean;
  resultData: Record<string, unknown> | null;
}

interface ChatMessage {
  id:        string;
  role:      "user" | "ai";
  content:   string;
  toolCalls: ToolCall[];
  cart?:     { value: number; items: number };
}

interface CartState {
  value: number;
  items: number;
}

// ─── Helpers ──────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function fmt(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

// ─── Sub-components ───────────────────────────────────────────

function ProductCard({ data }: { data: Record<string, unknown> }) {
  const name  = String(data.name  ?? "Produto");
  const price = Number(data.price ?? 0);
  const desc  = data.description ? String(data.description) : null;
  const cat   = data.category    ? String(data.category)    : null;

  return (
    <div className="mt-2 w-full max-w-xs rounded-xl border border-orange-100 bg-white shadow-sm overflow-hidden">
      <div className="bg-orange-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-500">
        {cat ?? "Sugestão"}
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-semibold text-gray-900">{name}</p>
        {desc && (
          <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-2">{desc}</p>
        )}
        <p className="mt-1.5 text-sm font-bold text-orange-500">{fmt(price)}</p>
      </div>
    </div>
  );
}

function ToolBadge({ tc }: { tc: ToolCall }) {
  const icons: Record<string, string> = {
    add_item:        "🛒",
    suggest_upsell:  "✨",
    remove_item:     "🗑",
    confirm_order:   "✅",
    handoff_to_human:"👤",
  };
  const colors: Record<string, string> = {
    add_item:        tc.success ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-600 border-red-100",
    suggest_upsell:  tc.success ? "bg-orange-50 text-orange-600 border-orange-100" : "bg-red-50 text-red-600 border-red-100",
    remove_item:     tc.success ? "bg-gray-100 text-gray-600 border-gray-200" : "bg-red-50 text-red-600 border-red-100",
    confirm_order:   tc.success ? "bg-green-100 text-green-800 border-green-200" : "bg-red-50 text-red-600 border-red-100",
    handoff_to_human:"bg-yellow-50 text-yellow-700 border-yellow-100",
  };
  const icon  = icons[tc.name]  ?? "🔧";
  const color = colors[tc.name] ?? "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`}>
      {icon} {tc.name}
    </span>
  );
}

function ExternalTestPanel({
  pedidoUrl,
  restaurantSlug,
}: {
  pedidoUrl:      string;
  restaurantSlug: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, pedidoUrl, {
        width:  160,
        margin: 2,
        color:  { dark: "#111827", light: "#ffffff" },
      });
    }
  }, [pedidoUrl]);

  async function copy() {
    await navigator.clipboard.writeText(pedidoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-xs font-semibold text-gray-700">Link público / QR</p>
        <p className="text-[10px] text-gray-400 mt-0.5">Página de pedido real do cliente</p>
      </div>
      <div className="flex flex-col items-center gap-3 px-4 py-4">
        <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-gray-100">
          <canvas ref={canvasRef} className="block rounded-lg" />
        </div>
        <div className="w-full space-y-2">
          <input
            readOnly
            value={pedidoUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 font-mono text-[10px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-300"
          />
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {copied ? "✓ Copiado" : "Copiar link"}
            </button>
            <a
              href={pedidoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg bg-orange-500 px-2 py-1.5 text-center text-[11px] font-medium text-white hover:bg-orange-600 transition-colors"
            >
              Abrir
            </a>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 text-center">
          Esta página usa a pipeline pública (<code>/pedido</code>).<br />
          O Chat Sim testa a pipeline WhatsApp (AIOrderService).
        </p>
      </div>
    </div>
  );
}

function CartPanel({ cart }: { cart: CartState }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-xs font-semibold text-gray-700">Carrinho atual</p>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        {cart.items === 0 ? (
          <p className="text-xs text-gray-400">Nenhum item ainda.</p>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Itens</span>
              <span className="font-semibold text-gray-900">{cart.items}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-bold text-orange-500">{fmt(cart.value)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────

interface Props {
  restaurantName: string;
  restaurantSlug: string;
  pedidoUrl:      string;
}

export function ChatSimClient({ restaurantName, restaurantSlug, pedidoUrl }: Props) {
  const [session,    setSession]    = useState<Session | null>(null);
  const [messages,   setMessages]   = useState<ChatMessage[]>([]);
  const [cart,       setCart]       = useState<CartState>({ value: 0, items: 0 });
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [starting,   setStarting]   = useState(false);
  const [viewMode,   setViewMode]   = useState<"desktop" | "mobile">("desktop");
  const [confirmed,  setConfirmed]  = useState(false);
  const [sideOpen,   setSideOpen]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Create session on mount
  useEffect(() => {
    void createSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const createSession = useCallback(async () => {
    setStarting(true);
    setMessages([]);
    setCart({ value: 0, items: 0 });
    setConfirmed(false);
    try {
      const res  = await fetch("/api/chat-sim/session", { method: "POST" });
      const json = await res.json() as { success: boolean; data?: Session };
      if (json.success && json.data) setSession(json.data);
    } finally {
      setStarting(false);
    }
  }, []);

  const resetSession = useCallback(async () => {
    if (session) {
      void fetch("/api/chat-sim/session", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(session),
      });
    }
    await createSession();
  }, [session, createSession]);

  const sendMessage = useCallback(async (text: string) => {
    if (!session || !text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id:        uid(),
      role:      "user",
      content:   text.trim(),
      toolCalls: [],
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res  = await fetch("/api/chat-sim/message", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          sessionId:  session.sessionId,
          customerId: session.customerId,
          message:    text.trim(),
        }),
      });
      const json = await res.json() as {
        success: boolean;
        data?: { text: string; toolCalls: ToolCall[]; cart: CartState };
      };

      if (json.success && json.data) {
        const { text: aiText, toolCalls, cart: newCart } = json.data;
        setCart(newCart);

        const hadConfirm = toolCalls.some(
          (tc) => tc.name === "confirm_order" && tc.success
        );
        if (hadConfirm) setConfirmed(true);

        setMessages((prev) => [
          ...prev,
          {
            id:        uid(),
            role:      "ai",
            content:   aiText,
            toolCalls,
            cart:      newCart,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id:        uid(),
            role:      "ai",
            content:   "Erro ao obter resposta. Tente novamente.",
            toolCalls: [],
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, [session, loading]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  // Chat window width based on view mode
  const chatWidth = viewMode === "mobile" ? "max-w-sm" : "max-w-full";

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-gray-50">
      {/* ── Top bar ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">Chat Sim</p>
          <p className="text-[11px] text-gray-400 truncate">{restaurantName}</p>
        </div>

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => setViewMode("desktop")}
            title="Visão desktop"
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              viewMode === "desktop"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Desktop
          </button>
          <button
            onClick={() => setViewMode("mobile")}
            title="Visão mobile"
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              viewMode === "mobile"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Mobile
          </button>
        </div>

        {/* Side panel toggle (visible on smaller screens) */}
        <button
          onClick={() => setSideOpen((v) => !v)}
          className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 lg:hidden"
          title="Painel lateral"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M9 3v18M9 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9" />
          </svg>
        </button>

        <button
          onClick={resetSession}
          disabled={starting}
          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {starting ? "Criando..." : "Nova sessão"}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 gap-0 overflow-hidden">

        {/* ── Chat column ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className={`flex flex-1 flex-col overflow-y-auto px-4 py-4 mx-auto w-full ${chatWidth}`}>
            {/* Empty state */}
            {messages.length === 0 && !starting && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-xl">
                  💬
                </div>
                <p className="text-sm font-medium text-gray-600">Sessão criada</p>
                <p className="text-xs text-gray-400">
                  Envie uma mensagem para iniciar a conversa com a IA.
                </p>
              </div>
            )}

            {starting && (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-gray-400">Criando sessão...</p>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`mb-3 flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                {/* Bubble */}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-orange-500 text-white rounded-br-sm"
                      : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm"
                  }`}
                >
                  {msg.content || <span className="italic text-gray-400 text-xs">[sem resposta]</span>}
                </div>

                {/* Tool call badges */}
                {msg.toolCalls.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {msg.toolCalls.map((tc, i) => (
                      <ToolBadge key={i} tc={tc} />
                    ))}
                  </div>
                )}

                {/* Product card for suggest_upsell */}
                {msg.toolCalls.map((tc, i) =>
                  tc.name === "suggest_upsell" && tc.success && tc.resultData ? (
                    <ProductCard key={`pc-${i}`} data={tc.resultData} />
                  ) : null
                )}

                {/* Order confirmed banner */}
                {msg.toolCalls.some((tc) => tc.name === "confirm_order" && tc.success) && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-3 py-2 text-xs font-semibold text-green-700">
                    ✅ Pedido confirmado!
                    {msg.cart && msg.cart.value > 0 && (
                      <span className="font-normal text-green-600">
                        Total: {fmt(msg.cart.value)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Thinking indicator */}
            {loading && (
              <div className="mb-3 flex items-start">
                <div className="rounded-2xl rounded-bl-sm bg-white border border-gray-100 shadow-sm px-3.5 py-2.5">
                  <div className="flex gap-1 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ── */}
          <div className={`shrink-0 border-t border-gray-200 bg-white px-4 py-3 mx-auto w-full ${chatWidth}`}>
            {confirmed && (
              <div className="mb-2 flex items-center justify-between rounded-lg bg-green-50 border border-green-100 px-3 py-1.5 text-xs text-green-700">
                <span className="font-semibold">Pedido finalizado nesta sessão.</span>
                <button
                  onClick={resetSession}
                  className="underline text-green-600 hover:text-green-800"
                >
                  Nova sessão
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={session ? "Digite uma mensagem… (Enter para enviar)" : "Aguardando sessão..."}
                disabled={!session || loading || starting}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:opacity-50 transition-colors"
                style={{ maxHeight: "8rem" }}
              />
              <button
                type="submit"
                disabled={!session || !input.trim() || loading || starting}
                className="shrink-0 rounded-xl bg-orange-500 px-3.5 py-2.5 text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m22 2-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </form>
            {session && (
              <p className="mt-1.5 text-center text-[10px] text-gray-300 font-mono">
                session: {session.sessionId.slice(0, 8)}…
              </p>
            )}
          </div>
        </div>

        {/* ── Side panel ── */}
        <div
          className={`shrink-0 w-64 flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-white p-3 lg:flex ${
            sideOpen ? "flex absolute right-0 top-[56px] bottom-0 z-20 shadow-lg" : "hidden"
          }`}
        >
          {/* Close button (mobile) */}
          <button
            onClick={() => setSideOpen(false)}
            className="ml-auto rounded-lg p-1 text-gray-400 hover:bg-gray-100 lg:hidden"
          >
            ✕
          </button>

          <CartPanel cart={cart} />

          <ExternalTestPanel
            pedidoUrl={pedidoUrl}
            restaurantSlug={restaurantSlug}
          />

          {/* Pipeline note */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="text-[10px] font-semibold text-gray-600 mb-1">Pipeline activa</p>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              <strong>AIOrderService</strong> via{" "}
              <code className="text-[9px]">PromptBuilderService</code> +{" "}
              <code className="text-[9px]">UpsellEngine</code> +{" "}
              <code className="text-[9px]">AI_TOOL_DEFINITIONS</code>
            </p>
            <p className="mt-1 text-[10px] text-gray-400">
              Nenhuma mensagem é enviada ao WhatsApp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
