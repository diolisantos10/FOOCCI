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
    <div className="mt-2 w-full max-w-xs rounded-xl border border-brand-100 bg-paper shadow-sm overflow-hidden">
      <div className="bg-brand-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
        {cat ?? "Sugestão"}
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-semibold text-ink">{name}</p>
        {desc && (
          <p className="mt-0.5 text-[11px] text-muted line-clamp-2">{desc}</p>
        )}
        <p className="mt-1.5 text-sm font-bold text-brand-600">{fmt(price)}</p>
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
    suggest_upsell:  tc.success ? "bg-brand-50 text-brand-600 border-brand-100" : "bg-red-50 text-red-600 border-red-100",
    remove_item:     tc.success ? "bg-[#F4F4F2] text-ink2 border-line2" : "bg-red-50 text-red-600 border-red-100",
    confirm_order:   tc.success ? "bg-green-100 text-green-800 border-green-200" : "bg-red-50 text-red-600 border-red-100",
    handoff_to_human:"bg-yellow-50 text-yellow-700 border-yellow-100",
  };
  const icon  = icons[tc.name]  ?? "🔧";
  const color = colors[tc.name] ?? "bg-[#F4F4F2] text-ink2 border-line2";

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
    <div className="rounded-xl border border-line bg-paper overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <p className="text-xs font-semibold text-ink2">Link público / QR</p>
        <p className="text-[10px] text-muted mt-0.5">Página de pedido real do cliente</p>
      </div>
      <div className="flex flex-col items-center gap-3 px-4 py-4">
        <div className="rounded-xl bg-paper p-2 shadow-sm ring-1 ring-gray-100">
          <canvas ref={canvasRef} className="block rounded-lg" />
        </div>
        <div className="w-full space-y-2">
          <input
            readOnly
            value={pedidoUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-line2 bg-[#FAFAF8] px-2.5 py-1.5 font-mono text-[10px] text-ink2 focus:outline-none focus:ring-1 focus:ring-brand-300"
          />
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="flex-1 rounded-lg border border-line2 bg-paper px-2 py-1.5 text-[11px] font-medium text-ink2 hover:bg-[#FAFAF8] transition-colors"
            >
              {copied ? "✓ Copiado" : "Copiar link"}
            </button>
            <a
              href={pedidoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg bg-brand-500 px-2 py-1.5 text-center text-[11px] font-medium text-white hover:bg-brand-600 transition-colors"
            >
              Abrir no navegador
            </a>
          </div>
          <p className="text-[10px] text-muted text-center">
            📱 Escaneie o QR para abrir no celular
          </p>
        </div>
        <p className="text-[10px] text-muted text-center">
          Esta página usa a pipeline pública (<code>/pedido</code>).
        </p>
      </div>
    </div>
  );
}

function CartPanel({ cart }: { cart: CartState }) {
  return (
    <div className="rounded-xl border border-line bg-paper overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <p className="text-xs font-semibold text-ink2">Carrinho atual</p>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        {cart.items === 0 ? (
          <p className="text-xs text-muted">Nenhum item ainda.</p>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Itens</span>
              <span className="font-semibold text-ink">{cart.items}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Subtotal</span>
              <span className="font-bold text-brand-600">{fmt(cart.value)}</span>
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
  /** When true: hides the internal top bar and side panel (used by TestAIHubClient). */
  embedded?:      boolean;
}

export function ChatSimClient({ restaurantName, restaurantSlug, pedidoUrl, embedded = false }: Props) {
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

  // Chat window width: full when embedded (hub controls the view mode), otherwise based on local toggle
  const chatWidth = embedded ? "max-w-full" : (viewMode === "mobile" ? "max-w-sm" : "max-w-full");

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#FAFAF8]">
      {/* ── Top bar — hidden when embedded inside TestAIHubClient ── */}
      {!embedded && <div className="flex shrink-0 items-center gap-3 border-b border-line2 bg-paper px-4 py-2.5 shadow-sm">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">Chat Sim</p>
          <p className="text-[11px] text-muted truncate">{restaurantName}</p>
        </div>

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-line2 bg-[#FAFAF8] p-0.5">
          <button
            onClick={() => setViewMode("desktop")}
            title="Visão desktop"
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              viewMode === "desktop"
                ? "bg-paper text-ink shadow-sm"
                : "text-muted hover:text-ink2"
            }`}
          >
            Desktop
          </button>
          <button
            onClick={() => setViewMode("mobile")}
            title="Visão mobile"
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              viewMode === "mobile"
                ? "bg-paper text-ink shadow-sm"
                : "text-muted hover:text-ink2"
            }`}
          >
            Mobile
          </button>
        </div>

        {/* Side panel toggle (visible on smaller screens) */}
        <button
          onClick={() => setSideOpen((v) => !v)}
          className="rounded-lg border border-line2 p-1.5 text-muted hover:bg-[#FAFAF8] lg:hidden"
          title="Painel lateral"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M9 3v18M9 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9" />
          </svg>
        </button>

        <button
          onClick={resetSession}
          disabled={starting}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {starting ? "Criando..." : "Nova sessão"}
        </button>
      </div>}

      {/* ── Body ── */}
      <div className="flex flex-1 gap-0 overflow-hidden">

        {/* ── Chat column ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className={`flex flex-1 flex-col overflow-y-auto px-4 py-4 mx-auto w-full ${chatWidth}`}>
            {/* Empty state */}
            {messages.length === 0 && !starting && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-xl">
                  💬
                </div>
                <p className="text-sm font-medium text-ink2">Sessão criada</p>
                <p className="text-xs text-muted">
                  Envie uma mensagem para iniciar a conversa com a IA.
                </p>
              </div>
            )}

            {starting && (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted">Criando sessão...</p>
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
                      ? "bg-brand-500 text-white rounded-br-sm"
                      : "bg-paper text-ink shadow-sm border border-line rounded-bl-sm"
                  }`}
                >
                  {msg.content || <span className="italic text-muted text-xs">[sem resposta]</span>}
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
                <div className="rounded-2xl rounded-bl-sm bg-paper border border-line shadow-sm px-3.5 py-2.5">
                  <div className="flex gap-1 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ── */}
          <div className={`shrink-0 border-t border-line2 bg-paper px-4 py-3 mx-auto w-full ${chatWidth}`}>
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
                className="flex-1 resize-none rounded-xl border border-line2 bg-[#FAFAF8] px-3 py-2.5 text-sm text-ink placeholder-gray-400 focus:border-brand-300 focus:bg-paper focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-50 transition-colors"
                style={{ maxHeight: "8rem" }}
              />
              <button
                type="submit"
                disabled={!session || !input.trim() || loading || starting}
                className="shrink-0 rounded-xl bg-brand-500 px-3.5 py-2.5 text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m22 2-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </form>
            {session && (
              <p className="mt-1.5 text-center text-[10px] text-muted font-mono">
                session: {session.sessionId.slice(0, 8)}…
              </p>
            )}
          </div>
        </div>

        {/* ── Side panel — hidden when embedded inside TestAIHubClient ── */}
        {!embedded && <div
          className={`shrink-0 w-64 flex-col gap-3 overflow-y-auto border-l border-line2 bg-paper p-3 lg:flex ${
            sideOpen ? "flex absolute right-0 top-[56px] bottom-0 z-20 shadow-lg" : "hidden"
          }`}
        >
          {/* Close button (mobile) */}
          <button
            onClick={() => setSideOpen(false)}
            className="ml-auto rounded-lg p-1 text-muted hover:bg-[#F4F4F2] lg:hidden"
          >
            ✕
          </button>

          <CartPanel cart={cart} />

          <ExternalTestPanel
            pedidoUrl={pedidoUrl}
            restaurantSlug={restaurantSlug}
          />

          {/* Pipeline note */}
          <div className="rounded-xl border border-line bg-[#FAFAF8] p-3">
            <p className="text-[10px] font-semibold text-ink2 mb-1">Pipeline activa</p>
            <p className="text-[10px] text-muted leading-relaxed">
              <strong>AIOrderService</strong> via{" "}
              <code className="text-[9px]">PromptBuilderService</code> +{" "}
              <code className="text-[9px]">UpsellEngine</code> +{" "}
              <code className="text-[9px]">AI_TOOL_DEFINITIONS</code>
            </p>
            <p className="mt-1 text-[10px] text-muted">
              Nenhuma mensagem é enviada ao WhatsApp.
            </p>
          </div>
        </div>}
      </div>
    </div>
  );
}
