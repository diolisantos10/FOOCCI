"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type V2Event =
  | "ON_ENTRY"
  | "ON_MENU_MODE"
  | "ON_ITEM_ADDED"
  | "ON_CART_UPDATED"
  | "ON_IDLE"
  | "ON_USER_MESSAGE"
  | "ON_CHECKOUT_STARTED"
  | "AFTER_CHECKOUT"
  | "ON_PERMISSION_ACCEPT"
  | "ON_PERMISSION_DECLINED";

type WaiterMode = "BROWSE" | "SUGGESTION" | "INTERVENTION" | "CHECKOUT_SUPPORT";

interface LabOption { label: string; value: string }

interface LabResponse {
  reply:   string;
  cards:   string[];
  mode:    string;
  options: LabOption[];
}

interface CatalogItem {
  id:    string;
  name:  string;
  price: number;
}

interface LabCartItem {
  id:    string;
  name:  string;
  price: number;
  qty:   number;
}

interface HistoryEntry { role: "user" | "assistant"; content: string }

interface Assertion {
  label:   string;
  pass:    boolean | null; // null = N/A for this event
  detail?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_MODES: WaiterMode[] = [
  "BROWSE", "SUGGESTION", "INTERVENTION", "CHECKOUT_SUPPORT",
];

const MODE_COLORS: Record<string, string> = {
  BROWSE:           "bg-gray-700 text-gray-200",
  SUGGESTION:       "bg-green-900 text-green-300",
  INTERVENTION:     "bg-yellow-900 text-yellow-200",
  CHECKOUT_SUPPORT: "bg-blue-900 text-blue-300",
};

// ── Assertions ────────────────────────────────────────────────────────────────

function buildAssertions(
  event: V2Event,
  res: LabResponse,
  catalog: CatalogItem[],
): Assertion[] {
  const catIds = new Set(catalog.map((i) => i.id));
  const out: Assertion[] = [];

  out.push({
    label: "Contrato normalizado (reply, cards, mode, options presentes)",
    pass:
      typeof res.reply === "string" &&
      Array.isArray(res.cards) &&
      typeof res.mode === "string" &&
      Array.isArray(res.options),
  });

  out.push({
    label:  "mode é valor válido (BROWSE | SUGGESTION | INTERVENTION | CHECKOUT_SUPPORT)",
    pass:   VALID_MODES.includes(res.mode as WaiterMode),
    detail: res.mode,
  });

  const nonEmptyLines = res.reply.split("\n").filter((l) => l.trim()).length;
  out.push({
    label:  "message ≤ 2 linhas não-vazias (Rule 3)",
    pass:   nonEmptyLines <= 2,
    detail: nonEmptyLines > 2 ? `${nonEmptyLines} linhas detectadas` : undefined,
  });

  const noMix = !(res.cards.length > 0 && res.options.length > 0);
  out.push({
    label:  "Sem options[] quando cards[] existe (Rule 9)",
    pass:   noMix,
    detail: !noMix ? `cards=${res.cards.length}, options=${res.options.length}` : undefined,
  });

  if (catalog.length > 0) {
    const ghosts = res.cards.filter((id) => !catIds.has(id));
    out.push({
      label:  "cards[] contêm apenas IDs do catálogo atual (Rule 2)",
      pass:   ghosts.length === 0,
      detail: ghosts.length > 0 ? `IDs fantasma: ${ghosts.join(", ")}` : undefined,
    });
  }

  if (event === "ON_ITEM_ADDED") {
    out.push({
      label:  "ON_ITEM_ADDED → cards=[] e options=[] (Rule 7)",
      pass:   res.cards.length === 0 && res.options.length === 0,
      detail:
        res.cards.length > 0 || res.options.length > 0
          ? `cards=${res.cards.length}, options=${res.options.length}`
          : undefined,
    });
  }

  if (res.mode === "CHECKOUT_SUPPORT") {
    out.push({
      label:  "CHECKOUT_SUPPORT → cards=[] (Rule 8)",
      pass:   res.cards.length === 0,
      detail: res.cards.length > 0 ? `cards=${res.cards.length}` : undefined,
    });
  }

  return out;
}

// ── Quick-test buttons ────────────────────────────────────────────────────────

type QuickTest = {
  label:      string;
  event:      V2Event;
  message:    string;
  useFirstId?: boolean;
};

const QUICK_TESTS: QuickTest[] = [
  { label: "Entry",               event: "ON_ENTRY",              message: ""                     },
  { label: "Idle / Permission",   event: "ON_IDLE",               message: ""                     },
  { label: "Permission Accepted", event: "ON_PERMISSION_ACCEPT",  message: ""                     },
  { label: "Permission Declined", event: "ON_PERMISSION_DECLINED", message: ""                    },
  { label: "Quero sugestão",      event: "ON_USER_MESSAGE",       message: "quero uma sugestão"   },
  { label: "Leve",                event: "ON_USER_MESSAGE",       message: "quero algo leve"      },
  { label: "Completo",            event: "ON_USER_MESSAGE",       message: "quero algo completo"  },
  { label: "Quero sobremesa",     event: "ON_USER_MESSAGE",       message: "quero uma sobremesa"  },
  { label: "Quero bebida",        event: "ON_USER_MESSAGE",       message: "quero uma bebida"     },
  { label: "Add first product",   event: "ON_ITEM_ADDED",         message: "", useFirstId: true    },
  { label: "Checkout start",      event: "ON_CHECKOUT_STARTED",   message: ""                     },
  { label: "After checkout",      event: "AFTER_CHECKOUT",        message: ""                     },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  defaultSlug:    string | null;
  restaurantName: string | null;
  hasMenu:        boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WaiterLabClient({ defaultSlug, restaurantName, hasMenu }: Props) {
  const [slug,          setSlug]         = useState(defaultSlug ?? "");
  const [activeSlug,    setActiveSlug]   = useState(defaultSlug ?? "");
  const [iframeKey,     setIframeKey]    = useState(0);
  const [catalog,       setCatalog]      = useState<CatalogItem[]>([]);
  const [catalogError,  setCatalogError] = useState<string | null>(null);
  const [history,       setHistory]      = useState<HistoryEntry[]>([]);
  const [labCart,       setLabCart]      = useState<LabCartItem[]>([]);
  const [lastEvent,     setLastEvent]    = useState<V2Event | null>(null);
  const [lastResponse,  setLastResponse] = useState<LabResponse | null>(null);
  const [typedMessage,  setTypedMessage] = useState("");
  const [isLoading,     setIsLoading]    = useState(false);
  const [assertions,    setAssertions]   = useState<Assertion[]>([]);
  const [showRaw,       setShowRaw]      = useState(false);

  // ── Catalog loading ───────────────────────────────────────────────────────

  const loadCatalog = useCallback(async (targetSlug: string) => {
    setCatalogError(null);
    setCatalog([]);
    try {
      const res = await fetch(`/api/pedido/${encodeURIComponent(targetSlug)}`);
      if (!res.ok) {
        setCatalogError(`Restaurante "${targetSlug}" não encontrado (${res.status}).`);
        return;
      }
      const data = await res.json();
      const items: CatalogItem[] = (data.categories ?? []).flatMap(
        (c: { items: CatalogItem[] }) => c.items,
      );
      setCatalog(items);
    } catch {
      setCatalogError("Erro de rede ao carregar catálogo.");
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (defaultSlug) void loadCatalog(defaultSlug); }, []);

  // ── Fire event ────────────────────────────────────────────────────────────

  const fireEvent = useCallback(
    async (event: V2Event, message = "", lastAddedId?: string) => {
      setIsLoading(true);
      setLastEvent(event);
      try {
        const cartPayload = labCart.map((i) => ({
          id: i.id, name: i.name, price: i.price, qty: i.qty,
        }));
        const body: Record<string, unknown> = {
          event, message, history, cart: cartPayload, stage: "BROWSE",
        };
        if (lastAddedId) body.lastAddedId = lastAddedId;

        const res = await fetch(`/api/pedido/${encodeURIComponent(activeSlug)}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text();
          setLastResponse(null);
          setAssertions([{ label: `HTTP ${res.status} — ${text.slice(0, 120)}`, pass: false }]);
          return;
        }

        const data = (await res.json()) as LabResponse;
        if (message) setHistory((h) => [...h, { role: "user",      content: message   }]);
        if (data.reply) setHistory((h) => [...h, { role: "assistant", content: data.reply }]);
        setLastResponse(data);
        setAssertions(buildAssertions(event, data, catalog));
      } catch (err) {
        setAssertions([{ label: `Erro de rede: ${String(err)}`, pass: false }]);
      } finally {
        setIsLoading(false);
      }
    },
    [activeSlug, history, labCart, catalog],
  );

  // ── No restaurant / no menu guard (after all hooks) ───────────────────────

  if (!defaultSlug) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="text-4xl">🍽️</span>
        <p className="text-lg font-semibold text-gray-700">
          Nenhum restaurante encontrado
        </p>
        <p className="max-w-xs text-sm text-gray-400">
          Faça login com uma conta que tenha um restaurante cadastrado para usar o Waiter Lab.
        </p>
      </div>
    );
  }

  if (!hasMenu) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="text-4xl">🍽️</span>
        <p className="text-lg font-semibold text-gray-700">
          Nenhum restaurante com cardápio encontrado para testar.
        </p>
        <p className="max-w-xs text-sm text-gray-400">
          Adicione itens ao cardápio em{" "}
          <a href="/menu" className="text-amber-600 underline hover:text-amber-500">
            Cardápio
          </a>{" "}
          e volte aqui para testar o Waiter.
        </p>
      </div>
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const handleLoad = async (targetSlug: string) => {
    const trimmed = targetSlug.trim();
    if (!trimmed) return;
    setSlug(trimmed);
    setActiveSlug(trimmed);
    await loadCatalog(trimmed);
    setHistory([]);
    setLabCart([]);
    setLastEvent(null);
    setLastResponse(null);
    setAssertions([]);
    setIframeKey((k) => k + 1);
  };

  const resetSession = () => {
    setHistory([]);
    setLabCart([]);
    setLastEvent(null);
    setLastResponse(null);
    setAssertions([]);
    setIframeKey((k) => k + 1);
  };

  const addToLabCart = (item: CatalogItem) => {
    setLabCart((c) => {
      const existing = c.find((i) => i.id === item.id);
      if (existing) return c.map((i) => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const cartTotal  = labCart.reduce((s, i) => s + i.price * i.qty, 0);
  const passCount  = assertions.filter((a) => a.pass === true).length;
  const failCount  = assertions.filter((a) => a.pass === false).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-950 text-gray-100 font-mono text-xs">

      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-800 px-3 py-2">
        <span className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-950">
          Waiter Lab
        </span>

        {/* Auto-load button — loads the owner's own restaurant */}
        {defaultSlug && (
          <button
            onClick={() => void handleLoad(defaultSlug)}
            className="rounded bg-gray-700 px-2 py-1 text-[10px] text-gray-200 hover:bg-gray-600 active:bg-gray-800"
          >
            ↺ Carregar restaurante atual
            {restaurantName && (
              <span className="ml-1 text-amber-400">({restaurantName})</span>
            )}
          </button>
        )}

        {/* Manual slug override */}
        <input
          className="w-40 rounded bg-gray-800 px-2 py-1 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:ring-1 focus:ring-amber-500"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="outro slug…"
          onKeyDown={(e) => { if (e.key === "Enter") void handleLoad(slug); }}
        />
        <button
          onClick={() => void handleLoad(slug)}
          className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-400 hover:border-amber-600 hover:text-amber-300"
        >
          Carregar
        </button>

        {catalogError && <span className="text-red-400">{catalogError}</span>}
        {catalog.length > 0 && !catalogError && (
          <span className="text-green-400">
            {catalog.length} itens · <span className="text-gray-500">{activeSlug}</span>
          </span>
        )}

        <div className="ml-auto">
          <button
            onClick={resetSession}
            className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-500 hover:border-red-700 hover:text-red-400"
          >
            Reset Session
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — Real ordering UI iframe */}
        <div className="flex w-72 shrink-0 flex-col border-r border-gray-800">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-3 py-1.5">
            <span className="text-[10px] uppercase tracking-widest text-gray-600">UI Real</span>
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              className="text-[10px] text-gray-600 hover:text-gray-400"
            >
              ↺ reload
            </button>
          </div>
          <div className="relative flex-1 overflow-hidden bg-white">
            <iframe
              key={iframeKey}
              src={`/pedido/${activeSlug}`}
              title="Ordering UI"
              className="absolute inset-0 h-full w-full border-0"
              style={{
                transform:       "scale(0.77)",
                transformOrigin: "top left",
                width:           "130%",
                height:          "130%",
              }}
            />
          </div>
        </div>

        {/* Right — Debug panel */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Quick test buttons */}
          <div className="shrink-0 border-b border-gray-800 px-3 py-2">
            <div className="mb-1.5 text-[10px] uppercase tracking-widest text-gray-600">Teste Rápido</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TESTS.map(({ label, event, message, useFirstId }) => (
                <button
                  key={label}
                  disabled={isLoading}
                  onClick={() => {
                    const lastAddedId = useFirstId ? catalog[0]?.id : undefined;
                    void fireEvent(event, message, lastAddedId);
                  }}
                  className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400 hover:border-amber-600 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5">
              <input
                className="flex-1 rounded bg-gray-800 px-2 py-1 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:ring-1 focus:ring-amber-500"
                value={typedMessage}
                onChange={(e) => setTypedMessage(e.target.value)}
                placeholder="Mensagem do usuário (ON_USER_MESSAGE)…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && typedMessage.trim()) {
                    void fireEvent("ON_USER_MESSAGE", typedMessage.trim());
                    setTypedMessage("");
                  }
                }}
              />
              <button
                disabled={isLoading || !typedMessage.trim()}
                onClick={() => {
                  if (typedMessage.trim()) {
                    void fireEvent("ON_USER_MESSAGE", typedMessage.trim());
                    setTypedMessage("");
                  }
                }}
                className="rounded border border-gray-700 px-3 py-1 text-[10px] text-gray-400 hover:border-amber-600 hover:text-amber-300 disabled:opacity-40"
              >
                Enviar
              </button>
            </div>
          </div>

          {/* Response + Assertions + State */}
          <div className="flex flex-1 overflow-hidden">

            {/* Response column */}
            <div className="flex flex-1 flex-col overflow-y-auto border-r border-gray-800 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-gray-600">Última Resposta</span>
                {lastEvent && (
                  <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-amber-400">{lastEvent}</span>
                )}
                {isLoading && (
                  <span className="animate-pulse text-[10px] text-gray-500">aguardando…</span>
                )}
              </div>

              {!lastResponse && !isLoading && (
                <div className="text-gray-700">
                  Nenhuma resposta. Use um botão de teste acima.
                </div>
              )}

              {lastResponse && !isLoading && (
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-[10px] text-gray-600">mode</div>
                    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${MODE_COLORS[lastResponse.mode] ?? "bg-gray-800 text-gray-300"}`}>
                      {lastResponse.mode}
                    </span>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-gray-600">message</div>
                    <div className="whitespace-pre-wrap rounded bg-gray-800 px-2 py-2 leading-relaxed text-gray-200">
                      {lastResponse.reply}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-gray-600">
                      cards[] <span className="text-gray-700">({lastResponse.cards.length})</span>
                    </div>
                    {lastResponse.cards.length === 0 ? (
                      <span className="text-gray-700">[]</span>
                    ) : (
                      <div className="space-y-1">
                        {lastResponse.cards.map((id) => {
                          const item = catalog.find((c) => c.id === id);
                          return (
                            <div key={id} className={`rounded px-2 py-1 ${item ? "bg-gray-800 text-gray-300" : "bg-red-950 text-red-400"}`}>
                              <span className="text-gray-500">{id.slice(0, 8)}…</span>
                              {item ? (
                                <span className="ml-2 text-gray-200">{item.name}</span>
                              ) : (
                                <span className="ml-2 text-red-400">ID não encontrado no catálogo!</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-gray-600">
                      options[] <span className="text-gray-700">({lastResponse.options.length})</span>
                    </div>
                    {lastResponse.options.length === 0 ? (
                      <span className="text-gray-700">[]</span>
                    ) : (
                      <div className="space-y-1">
                        {lastResponse.options.map((opt) => (
                          <div key={opt.value} className="flex gap-2 rounded bg-gray-800 px-2 py-1">
                            <span className="text-amber-300">{opt.label}</span>
                            <span className="text-gray-600">→</span>
                            <span className="text-gray-500">{opt.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <button
                      onClick={() => setShowRaw((v) => !v)}
                      className="text-[10px] text-gray-600 hover:text-gray-400"
                    >
                      {showRaw ? "▲ ocultar raw" : "▼ raw JSON"}
                    </button>
                    {showRaw && (
                      <pre className="mt-1 overflow-x-auto rounded bg-gray-800 p-2 text-[10px] text-gray-500">
                        {JSON.stringify(lastResponse, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right column — Assertions + State */}
            <div className="flex w-72 shrink-0 flex-col overflow-y-auto p-3">

              {/* Assertions */}
              <div className="mb-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-gray-600">Assertions</span>
                  {assertions.length > 0 && (
                    <span className="flex gap-1">
                      {passCount > 0 && <span className="text-green-400">{passCount}✓</span>}
                      {failCount > 0 && <span className="text-red-400">{failCount}✗</span>}
                    </span>
                  )}
                </div>
                {assertions.length === 0 && (
                  <div className="text-gray-700">Execute um evento para validar.</div>
                )}
                <div className="space-y-1">
                  {assertions.map((a, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className={`mt-px shrink-0 text-[11px] ${a.pass === true ? "text-green-400" : a.pass === false ? "text-red-400" : "text-gray-600"}`}>
                        {a.pass === true ? "✓" : a.pass === false ? "✗" : "—"}
                      </span>
                      <span className={a.pass === false ? "text-red-300" : "text-gray-400"}>
                        {a.label}
                        {a.detail && <span className="ml-1 text-gray-600">({a.detail})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lab controls */}
              <div className="mb-4">
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-gray-600">Lab Controls</div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setLabCart([])}
                    className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-500 hover:border-red-700 hover:text-red-400"
                  >
                    Clear Cart
                  </button>
                  <button
                    onClick={() => setHistory([])}
                    className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-500 hover:border-red-700 hover:text-red-400"
                  >
                    Clear Memory
                  </button>
                  <button
                    onClick={() => setIframeKey((k) => k + 1)}
                    className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-500 hover:border-gray-500 hover:text-gray-300"
                  >
                    Reload UI
                  </button>
                </div>
              </div>

              {/* Session state */}
              <div className="mb-4">
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-gray-600">Estado da Sessão</div>
                <div className="space-y-1 text-[11px]">
                  <div>
                    <span className="text-gray-600">Último evento: </span>
                    <span className="text-amber-400">{lastEvent ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Modo atual: </span>
                    <span className={`font-bold ${
                      lastResponse?.mode === "CHECKOUT_SUPPORT" ? "text-blue-400"   :
                      lastResponse?.mode === "SUGGESTION"       ? "text-green-400"  :
                      lastResponse?.mode === "INTERVENTION"     ? "text-yellow-400" : "text-gray-300"
                    }`}>
                      {lastResponse?.mode ?? "—"}
                    </span>
                  </div>
                  <div><span className="text-gray-600">Cards: </span><span className="text-gray-300">{lastResponse?.cards.length ?? 0}</span></div>
                  <div><span className="text-gray-600">Options: </span><span className="text-gray-300">{lastResponse?.options.length ?? 0}</span></div>
                  <div><span className="text-gray-600">Turnos: </span><span className="text-gray-300">{history.length}</span></div>
                  <div><span className="text-gray-600">Catálogo: </span><span className="text-gray-300">{catalog.length} itens</span></div>
                </div>
              </div>

              {/* Lab cart */}
              <div className="mb-4">
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-gray-600">
                  Cart do Lab {labCart.length > 0 && <span className="text-gray-500">R$ {cartTotal.toFixed(2)}</span>}
                </div>
                {labCart.length === 0 ? (
                  <div className="text-gray-700">vazio</div>
                ) : (
                  <div className="space-y-0.5">
                    {labCart.map((item) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <span className="text-gray-400">{item.name}</span>
                        <span className="flex items-center gap-2 text-gray-600">
                          x{item.qty}
                          <button onClick={() => setLabCart((c) => c.filter((i) => i.id !== item.id))} className="text-[10px] hover:text-red-500">✕</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {catalog.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 text-[10px] text-gray-700">Adicionar ao cart:</div>
                    <div className="flex flex-wrap gap-1">
                      {catalog.slice(0, 6).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => addToLabCart(item)}
                          title={`R$ ${item.price.toFixed(2)}`}
                          className="rounded border border-gray-800 px-1.5 py-0.5 text-[10px] text-gray-600 hover:border-gray-600 hover:text-gray-300"
                        >
                          + {item.name.length > 14 ? `${item.name.slice(0, 14)}…` : item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Resolved product names */}
              {lastResponse && lastResponse.cards.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-gray-600">Produtos Sugeridos</div>
                  <div className="space-y-0.5">
                    {lastResponse.cards.map((id) => {
                      const item = catalog.find((c) => c.id === id);
                      return (
                        <div key={id} className={`text-[11px] ${item ? "text-gray-300" : "text-red-400"}`}>
                          {item ? `${item.name} — R$ ${item.price.toFixed(2)}` : `ID desconhecido: ${id}`}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
