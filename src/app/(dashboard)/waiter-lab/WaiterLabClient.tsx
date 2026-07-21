"use client";

import { useState, useEffect, useCallback } from "react";
import AutoPilotPanel from "./autopilot/AutoPilotPanel";

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
  BROWSE:           "bg-ink text-line2",
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

// ── Response normalizer ───────────────────────────────────────────────────────

function normalizeResponse(raw: unknown): LabResponse {
  if (!raw || typeof raw !== "object") {
    return { reply: "", cards: [], options: [], mode: "BROWSE" };
  }
  const r = raw as Record<string, unknown>;
  return {
    reply:   typeof r.reply   === "string" ? r.reply                      : "",
    cards:   Array.isArray(r.cards)        ? (r.cards   as string[])      : [],
    options: Array.isArray(r.options)      ? (r.options as LabOption[])   : [],
    mode:    typeof r.mode    === "string" ? r.mode                       : "BROWSE",
  };
}

// ── Quick-test buttons ────────────────────────────────────────────────────────

type QuickTest = {
  label:         string;
  event:         V2Event;
  message:       string;
  useFirstId?:   boolean;
  needsCatalog?: boolean;
};

const QUICK_TESTS: QuickTest[] = [
  { label: "Entry",               event: "ON_ENTRY",               message: ""                                    },
  { label: "Idle / Permission",   event: "ON_IDLE",                message: ""                                    },
  { label: "Permission Accepted", event: "ON_PERMISSION_ACCEPT",   message: ""                                    },
  { label: "Permission Declined", event: "ON_PERMISSION_DECLINED", message: ""                                    },
  { label: "Quero sugestão",      event: "ON_USER_MESSAGE",        message: "quero uma sugestão",  needsCatalog: true },
  { label: "Leve",                event: "ON_USER_MESSAGE",        message: "quero algo leve",     needsCatalog: true },
  { label: "Completo",            event: "ON_USER_MESSAGE",        message: "quero algo completo", needsCatalog: true },
  { label: "Quero sobremesa",     event: "ON_USER_MESSAGE",        message: "quero uma sobremesa", needsCatalog: true },
  { label: "Quero bebida",        event: "ON_USER_MESSAGE",        message: "quero uma bebida",    needsCatalog: true },
  { label: "Add first product",   event: "ON_ITEM_ADDED",          message: "", useFirstId: true,  needsCatalog: true },
  { label: "Checkout start",      event: "ON_CHECKOUT_STARTED",    message: "",                    needsCatalog: true },
  { label: "After checkout",      event: "AFTER_CHECKOUT",         message: ""                                    },
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
  const [showRaw,        setShowRaw]       = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [iframeStatus,   setIframeStatus]   = useState<"loading" | "loaded" | "error">("loading");
  const [lastError,      setLastError]      = useState<{ message: string; stack?: string; event?: string } | null>(null);
  const [labMode,        setLabMode]        = useState<"manual" | "autopilot">("manual");

  // ── Catalog loading ───────────────────────────────────────────────────────

  const loadCatalog = useCallback(async (targetSlug: string) => {
    setCatalogError(null);
    setCatalog([]);
    setCatalogLoading(true);
    try {
      const res = await fetch(`/api/pedido/${encodeURIComponent(targetSlug)}`);
      if (!res.ok) {
        setCatalogError(`Restaurante "${targetSlug}" não encontrado (${res.status}).`);
        return;
      }
      // ok() wraps as { success: true, data: { restaurantName, categories } }
      const json = await res.json();
      const payload: { categories?: { items: CatalogItem[] }[] } = json.data ?? json;
      const items: CatalogItem[] = (payload.categories ?? []).flatMap((c) => c.items);
      setCatalog(items);
    } catch {
      setCatalogError("Erro de rede ao carregar catálogo.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (defaultSlug) void loadCatalog(defaultSlug); }, []);

  // ── Fire event ────────────────────────────────────────────────────────────

  const fireEvent = useCallback(
    async (event: V2Event, message = "", lastAddedId?: string) => {
      setIsLoading(true);
      setLastEvent(event);
      setLastError(null);
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
          const text = await res.text().catch(() => "(sem corpo)");
          setLastResponse(null);
          setLastError({ message: `HTTP ${res.status}`, event, stack: text.slice(0, 400) });
          setAssertions([{ label: `HTTP ${res.status} — ${text.slice(0, 120)}`, pass: false }]);
          return;
        }

        // ok() wraps as { success: true, data: { reply, cards, mode, options } }
        const json = await res.json();
        const data = normalizeResponse(json.data ?? json);
        if (message) setHistory((h) => [...h, { role: "user",      content: message      }]);
        if (data.reply) setHistory((h) => [...h, { role: "assistant", content: data.reply }]);
        setLastResponse(data);
        setAssertions(buildAssertions(event, data, catalog));
      } catch (err) {
        const msg   = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? (err.stack ?? "") : "";
        setLastError({ message: msg, stack, event });
        setAssertions([{ label: `Evento falhou: ${event} — ${msg}`, pass: false }]);
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
        <p className="text-lg font-semibold text-ink2">
          Nenhum restaurante encontrado
        </p>
        <p className="max-w-xs text-sm text-muted">
          Faça login com uma conta que tenha um restaurante cadastrado para usar o Waiter Lab.
        </p>
      </div>
    );
  }

  if (!hasMenu) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="text-4xl">🍽️</span>
        <p className="text-lg font-semibold text-ink2">
          Nenhum restaurante com cardápio encontrado para testar.
        </p>
        <p className="max-w-xs text-sm text-muted">
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
    setIframeStatus("loading");
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
    setLastError(null);
    setIframeStatus("loading");
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
    <div className="flex h-full flex-col overflow-hidden bg-ink text-gray-100 font-mono text-xs">

      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-800 px-3 py-2">
        <span className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-950">
          Waiter Lab
        </span>

        {/* Auto-load button — loads the owner's own restaurant */}
        {defaultSlug && (
          <button
            onClick={() => void handleLoad(defaultSlug)}
            className="rounded bg-ink px-2 py-1 text-[10px] text-line2 hover:bg-ink2 active:bg-ink"
          >
            ↺ Carregar restaurante atual
            {restaurantName && (
              <span className="ml-1 text-amber-400">({restaurantName})</span>
            )}
          </button>
        )}

        {/* Manual slug override */}
        <input
          className="w-40 rounded bg-ink px-2 py-1 text-xs text-gray-100 outline-none placeholder:text-ink2 focus:ring-1 focus:ring-brand-500"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="outro slug…"
          onKeyDown={(e) => { if (e.key === "Enter") void handleLoad(slug); }}
        />
        <button
          onClick={() => void handleLoad(slug)}
          className="rounded border border-gray-700 px-2 py-1 text-[10px] text-muted hover:border-amber-600 hover:text-amber-300"
        >
          Carregar
        </button>

        {catalogError && <span className="text-red-400">{catalogError}</span>}
        {catalog.length > 0 && !catalogError && (
          <span className="text-green-400">
            {catalog.length} itens · <span className="text-muted">{activeSlug}</span>
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex overflow-hidden rounded border border-gray-700">
            <button
              onClick={() => setLabMode("manual")}
              className={`px-2 py-1 text-[10px] transition-colors ${
                labMode === "manual"
                  ? "bg-ink text-gray-100"
                  : "text-ink2 hover:text-muted"
              }`}
            >
              Manual
            </button>
            <button
              onClick={() => setLabMode("autopilot")}
              className={`px-2 py-1 text-[10px] transition-colors ${
                labMode === "autopilot"
                  ? "bg-amber-600 text-white"
                  : "text-ink2 hover:text-amber-400"
              }`}
            >
              AutoPilot
            </button>
          </div>

          <button
            onClick={resetSession}
            className="rounded border border-gray-700 px-2 py-1 text-[10px] text-muted hover:border-red-700 hover:text-red-400"
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
            <span className="text-[10px] uppercase tracking-widest text-ink2">UI Real</span>
            <button
              onClick={() => { setIframeStatus("loading"); setIframeKey((k) => k + 1); }}
              className="text-[10px] text-ink2 hover:text-muted"
            >
              ↺ reload
            </button>
          </div>

          {/* iframe debug info */}
          <div className="shrink-0 space-y-0.5 border-b border-gray-800 px-3 py-1.5">
            <div className="flex gap-1.5">
              <span className="w-16 shrink-0 text-[10px] text-ink2">restaurante</span>
              <span className="truncate text-[10px] text-amber-400">{restaurantName ?? activeSlug}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="w-16 shrink-0 text-[10px] text-ink2">slug</span>
              <span className="text-[10px] text-muted">{activeSlug}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="w-16 shrink-0 text-[10px] text-ink2">url</span>
              <span className="text-[10px] text-muted">/pedido/{activeSlug}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="w-16 shrink-0 text-[10px] text-ink2">catálogo</span>
              <span className={`text-[10px] ${
                catalogLoading          ? "animate-pulse text-muted" :
                catalog.length > 0      ? "text-green-400"              : "text-red-400"
              }`}>
                {catalogLoading ? "carregando…" : `${catalog.length} itens`}
              </span>
            </div>
            <div className="flex gap-1.5">
              <span className="w-16 shrink-0 text-[10px] text-ink2">iframe</span>
              <span className={`text-[10px] ${
                iframeStatus === "loaded"  ? "text-green-400"              :
                iframeStatus === "error"   ? "text-red-400"               : "animate-pulse text-muted"
              }`}>
                {iframeStatus === "loaded" ? "carregado" : iframeStatus === "error" ? "erro" : "carregando…"}
              </span>
            </div>
          </div>

          <div className="relative flex-1 overflow-hidden bg-paper">
            {iframeStatus === "error" && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#F4F4F2] p-4 text-center">
                <span className="text-2xl">⚠️</span>
                <p className="text-xs font-semibold text-ink2">Não foi possível carregar</p>
                <code className="rounded bg-line2 px-2 py-0.5 text-[10px] text-ink2">
                  /pedido/{activeSlug}
                </code>
                <p className="text-[10px] text-muted">
                  Verifique se o restaurante possui cardápio publicado.
                </p>
              </div>
            )}
            <iframe
              key={iframeKey}
              src={`/pedido/${activeSlug}`}
              title="Ordering UI"
              onLoad={() => setIframeStatus("loaded")}
              onError={() => setIframeStatus("error")}
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

        {/* Right — AutoPilot mode */}
        {labMode === "autopilot" && (
          <AutoPilotPanel
            slug={activeSlug}
            catalog={catalog}
            restaurantName={restaurantName ?? activeSlug}
          />
        )}

        {/* Right — Manual debug panel */}
        {labMode === "manual" && <div className="flex flex-1 flex-col overflow-hidden">

          {/* Quick test buttons */}
          <div className="shrink-0 border-b border-gray-800 px-3 py-2">
            <div className="mb-1.5 text-[10px] uppercase tracking-widest text-ink2">Teste Rápido</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TESTS.map(({ label, event, message, useFirstId, needsCatalog }) => {
                const noCatalog = needsCatalog && catalog.length === 0;
                const isDisabled = isLoading || noCatalog;
                return (
                  <button
                    key={label}
                    disabled={isDisabled}
                    title={noCatalog ? "Aguardando catálogo…" : label}
                    onClick={() => {
                      try {
                        setLastError(null);
                        const lastAddedId = useFirstId ? (catalog[0]?.id ?? undefined) : undefined;
                        void fireEvent(event, message, lastAddedId);
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        setLastError({ message: msg, event });
                      }
                    }}
                    className={`rounded border px-2 py-0.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      noCatalog
                        ? "border-gray-800 text-ink2"
                        : "border-gray-700 text-muted hover:border-amber-600 hover:text-amber-300"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-1.5">
              <input
                className="flex-1 rounded bg-ink px-2 py-1 text-xs text-gray-100 outline-none placeholder:text-ink2 focus:ring-1 focus:ring-brand-500"
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
                className="rounded border border-gray-700 px-3 py-1 text-[10px] text-muted hover:border-amber-600 hover:text-amber-300 disabled:opacity-40"
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
                <span className="text-[10px] uppercase tracking-widest text-ink2">Última Resposta</span>
                {lastEvent && (
                  <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] text-amber-400">{lastEvent}</span>
                )}
                {isLoading && (
                  <span className="animate-pulse text-[10px] text-muted">aguardando…</span>
                )}
              </div>

              {!lastResponse && !isLoading && (
                <div className="text-ink2">
                  Nenhuma resposta. Use um botão de teste acima.
                </div>
              )}

              {lastResponse && !isLoading && (
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-[10px] text-ink2">mode</div>
                    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${MODE_COLORS[lastResponse.mode] ?? "bg-ink text-muted"}`}>
                      {lastResponse.mode}
                    </span>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-ink2">message</div>
                    <div className="whitespace-pre-wrap rounded bg-ink px-2 py-2 leading-relaxed text-line2">
                      {lastResponse.reply}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] text-ink2">
                      cards[] <span className="text-ink2">({lastResponse.cards.length})</span>
                    </div>
                    {lastResponse.cards.length === 0 ? (
                      <span className="text-ink2">[]</span>
                    ) : (
                      <div className="space-y-1">
                        {lastResponse.cards.map((id) => {
                          const item = catalog.find((c) => c.id === id);
                          return (
                            <div key={id} className={`rounded px-2 py-1 ${item ? "bg-ink text-muted" : "bg-red-950 text-red-400"}`}>
                              <span className="text-muted">{id.slice(0, 8)}…</span>
                              {item ? (
                                <span className="ml-2 text-line2">{item.name}</span>
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
                    <div className="mb-1 text-[10px] text-ink2">
                      options[] <span className="text-ink2">({lastResponse.options.length})</span>
                    </div>
                    {lastResponse.options.length === 0 ? (
                      <span className="text-ink2">[]</span>
                    ) : (
                      <div className="space-y-1">
                        {lastResponse.options.map((opt) => (
                          <div key={opt.value} className="flex gap-2 rounded bg-ink px-2 py-1">
                            <span className="text-amber-300">{opt.label}</span>
                            <span className="text-ink2">→</span>
                            <span className="text-muted">{opt.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <button
                      onClick={() => setShowRaw((v) => !v)}
                      className="text-[10px] text-ink2 hover:text-muted"
                    >
                      {showRaw ? "▲ ocultar raw" : "▼ raw JSON"}
                    </button>
                    {showRaw && (
                      <pre className="mt-1 overflow-x-auto rounded bg-ink p-2 text-[10px] text-muted">
                        {JSON.stringify(lastResponse, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right column — Assertions + State */}
            <div className="flex w-72 shrink-0 flex-col overflow-y-auto p-3">

              {/* Error panel — shown when last event threw */}
              {lastError && (
                <div className="mb-4 rounded border border-red-900 bg-red-950/40 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">
                      Evento falhou{lastError.event ? `: ${lastError.event}` : ""}
                    </span>
                    <button
                      onClick={() => setLastError(null)}
                      className="text-[10px] text-red-700 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="mb-1 break-all text-[10px] text-red-300">{lastError.message}</p>
                  {lastError.stack && (
                    <pre className="overflow-auto text-[9px] text-red-700 leading-relaxed">
                      {lastError.stack.slice(0, 300)}
                    </pre>
                  )}
                </div>
              )}

              {/* Assertions */}
              <div className="mb-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-ink2">Assertions</span>
                  {assertions.length > 0 && (
                    <span className="flex gap-1">
                      {passCount > 0 && <span className="text-green-400">{passCount}✓</span>}
                      {failCount > 0 && <span className="text-red-400">{failCount}✗</span>}
                    </span>
                  )}
                </div>
                {assertions.length === 0 && (
                  <div className="text-ink2">Execute um evento para validar.</div>
                )}
                <div className="space-y-1">
                  {assertions.map((a, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className={`mt-px shrink-0 text-[11px] ${a.pass === true ? "text-green-400" : a.pass === false ? "text-red-400" : "text-ink2"}`}>
                        {a.pass === true ? "✓" : a.pass === false ? "✗" : "—"}
                      </span>
                      <span className={a.pass === false ? "text-red-300" : "text-muted"}>
                        {a.label}
                        {a.detail && <span className="ml-1 text-ink2">({a.detail})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lab controls */}
              <div className="mb-4">
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-ink2">Lab Controls</div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={resetSession}
                    className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-muted hover:border-amber-600 hover:text-amber-300"
                  >
                    Reset Lab
                  </button>
                  <button
                    onClick={() => setLabCart([])}
                    className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-muted hover:border-red-700 hover:text-red-400"
                  >
                    Clear Cart
                  </button>
                  <button
                    onClick={() => setHistory([])}
                    className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-muted hover:border-red-700 hover:text-red-400"
                  >
                    Clear Memory
                  </button>
                  <button
                    onClick={() => { setIframeStatus("loading"); setIframeKey((k) => k + 1); }}
                    className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-muted hover:border-gray-500 hover:text-muted"
                  >
                    Reload UI
                  </button>
                </div>
              </div>

              {/* Session state */}
              <div className="mb-4">
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-ink2">Estado da Sessão</div>
                <div className="space-y-1 text-[11px]">
                  <div>
                    <span className="text-ink2">Último evento: </span>
                    <span className="text-amber-400">{lastEvent ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-ink2">Modo atual: </span>
                    <span className={`font-bold ${
                      lastResponse?.mode === "CHECKOUT_SUPPORT" ? "text-blue-400"   :
                      lastResponse?.mode === "SUGGESTION"       ? "text-green-400"  :
                      lastResponse?.mode === "INTERVENTION"     ? "text-yellow-400" : "text-muted"
                    }`}>
                      {lastResponse?.mode ?? "—"}
                    </span>
                  </div>
                  <div><span className="text-ink2">Cards: </span><span className="text-muted">{lastResponse?.cards.length ?? 0}</span></div>
                  <div><span className="text-ink2">Options: </span><span className="text-muted">{lastResponse?.options.length ?? 0}</span></div>
                  <div><span className="text-ink2">Turnos: </span><span className="text-muted">{history.length}</span></div>
                  <div><span className="text-ink2">Catálogo: </span><span className="text-muted">{catalog.length} itens</span></div>
                </div>
              </div>

              {/* Lab cart */}
              <div className="mb-4">
                <div className="mb-1.5 text-[10px] uppercase tracking-widest text-ink2">
                  Cart do Lab {labCart.length > 0 && <span className="text-muted">R$ {cartTotal.toFixed(2)}</span>}
                </div>
                {labCart.length === 0 ? (
                  <div className="text-ink2">vazio</div>
                ) : (
                  <div className="space-y-0.5">
                    {labCart.map((item) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <span className="text-muted">{item.name}</span>
                        <span className="flex items-center gap-2 text-ink2">
                          x{item.qty}
                          <button onClick={() => setLabCart((c) => c.filter((i) => i.id !== item.id))} className="text-[10px] hover:text-red-500">✕</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {catalog.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 text-[10px] text-ink2">Adicionar ao cart:</div>
                    <div className="flex flex-wrap gap-1">
                      {catalog.slice(0, 6).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => addToLabCart(item)}
                          title={`R$ ${item.price.toFixed(2)}`}
                          className="rounded border border-gray-800 px-1.5 py-0.5 text-[10px] text-ink2 hover:border-gray-600 hover:text-muted"
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
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-ink2">Produtos Sugeridos</div>
                  <div className="space-y-0.5">
                    {lastResponse.cards.map((id) => {
                      const item = catalog.find((c) => c.id === id);
                      return (
                        <div key={id} className={`text-[11px] ${item ? "text-muted" : "text-red-400"}`}>
                          {item ? `${item.name} — R$ ${item.price.toFixed(2)}` : `ID desconhecido: ${id}`}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>}
      </div>
    </div>
  );
}
