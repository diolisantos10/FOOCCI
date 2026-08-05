"use client";

/**
 * WA Pedido Texto — Simulador WhatsApp (admin-only).
 *
 * Visually simulates a WhatsApp conversation against the Text Ordering engine
 * and the old WhatsApp Agent. NEVER sends real WhatsApp messages, creates real
 * orders, or generates real Pix. Everything is a safe simulation.
 */

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SimMessage {
  id:   string;
  role: "customer" | "bot";
  text: string;
  ts:   Date;
  turn?: SimTurn;
}

interface SimTurn {
  finalHandler:          string;
  detectedIntent:        string;
  stageBefore:           string;
  stageAfter:            string;
  session:               Record<string, unknown> | null;
  comanda:               ComandaData | null;
  routing:               RoutingData;
  safetyNotes:           string[];
  sideEffectsPerformed:  string[];
  restaurant:            { id: string; name: string; slug: string };
  missingInfo:           Array<{ itemName: string; groupName: string; options: string[] }>;
  paymentInfo:           PaymentInfo | null;
}

interface ComandaData {
  subtotal:    number;
  deliveryFee: number;
  total:       number;
  summary: {
    items: Array<{
      name:      string;
      quantity:  number;
      variant?:  string;
      options:   string[];
      extras:    string[];
      lineTotal: number;
    }>;
  };
}

interface RoutingData {
  routingEligible:          boolean;
  hasActiveSession:         boolean;
  detectedIntent:           string;
  messageHasOrderIntent:    boolean;
  wouldRouteToTextOrdering: boolean;
  finalHandler:             string;
  effectiveFinalHandler:    string;
  replyCapable:             boolean;
  declineReason:            string | null;
  mode:                     string;
  scope:                    string;
}

interface PaymentInfo {
  method:        string | null;
  status:        string | null;
  pixCopyPaste?: string;
  isDryRunStub?: boolean;
  changeFor?:    number;
}

type InspectorTab = "estado" | "comanda" | "roteamento" | "seguranca" | "json";

const QUICK_BUTTONS = [
  { label: "Saudação",           text: "Olá" },
  { label: "Pedido simples",     text: "Quero um yakisoba" },
  { label: "Yakisoba + Coca",    text: "Quero 2 yakisoba e uma coca" },
  { label: "Entrega",            text: "entrega" },
  { label: "Pix",                text: "pix" },
  { label: "Cancelar",           text: "cancelar pedido" },
  { label: "Falar c/ atendente", text: "quero falar com um atendente" },
];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ── Inspector panel ───────────────────────────────────────────────────────────

function Badge({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  const color =
    ok === true  ? "bg-emerald-900/40 text-emerald-300 border-emerald-700" :
    ok === false ? "bg-red-900/40 text-red-300 border-red-700"             :
                   "bg-gray-800 text-gray-300 border-gray-700";
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-mono ${color}`}>
        {value}
      </span>
    </div>
  );
}

function InspectorEstado({ turn }: { turn: SimTurn }) {
  const s = turn.session as Record<string, unknown> | null;
  return (
    <div className="space-y-0.5 px-1">
      <Badge label="Handler"   value={turn.finalHandler}   ok={turn.finalHandler === "TEXT_ORDERING"} />
      <Badge label="Intent"    value={turn.detectedIntent} />
      <Badge label="Stage →"   value={`${turn.stageBefore} → ${turn.stageAfter}`} />
      <Badge label="Status"    value={String(s?.status ?? "—")} />
      <Badge label="Mode"      value={turn.routing.mode} />
      <Badge label="Scope"     value={turn.routing.scope} />
      {turn.missingInfo.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Perguntas pendentes</p>
          {turn.missingInfo.map((q, i) => (
            <p key={i} className="text-xs text-amber-300">
              {q.itemName}: {q.groupName} ({q.options.join(", ")})
            </p>
          ))}
        </div>
      )}
      {Array.isArray(s?.unresolvedItems) && (s.unresolvedItems as unknown[]).length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Itens não resolvidos</p>
          {(s.unresolvedItems as Array<{ rawText: string; reason: string; candidates?: string[] }>).map((u, i) => (
            <p key={i} className="text-xs text-amber-300">
              {u.rawText} ({u.reason}){u.candidates?.length ? `: ${u.candidates.join(", ")}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function InspectorComanda({ turn }: { turn: SimTurn }) {
  const c = turn.comanda;
  const s = turn.session as Record<string, unknown> | null;
  if (!c || !c.summary || c.summary.items.length === 0) {
    return (
      <div className="px-1">
        <p className="text-xs text-gray-500 italic">Nenhum item no pedido ainda.</p>
        {!!s?.deliveryType && <Badge label="Entrega/Retirada" value={String(s.deliveryType)} />}
        {!!s?.paymentMethod && <Badge label="Pagamento" value={String(s.paymentMethod)} />}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 px-1">
      <div className="space-y-0.5">
        {c.summary.items.map((item, i) => (
          <div key={i} className="flex items-start justify-between gap-2 text-xs">
            <span className="text-gray-300">
              {item.quantity}× {item.name}
              {item.variant ? ` ${item.variant}` : ""}
              {item.options.length > 0 ? ` (${item.options.join(", ")})` : ""}
            </span>
            <span className="shrink-0 text-gray-400">R$ {item.lineTotal.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-700 pt-1.5 space-y-0.5">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Subtotal</span>
          <span>R$ {c.subtotal.toFixed(2)}</span>
        </div>
        {c.deliveryFee > 0 && (
          <div className="flex justify-between text-xs text-gray-400">
            <span>Entrega</span>
            <span>R$ {c.deliveryFee.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-semibold text-white">
          <span>Total</span>
          <span>R$ {c.total.toFixed(2)}</span>
        </div>
      </div>
      {!!s?.deliveryType && <Badge label="Entrega/Retirada" value={String(s.deliveryType)} />}
      {!!s?.address && typeof s.address === "object" && (
        <p className="text-[11px] text-gray-400">
          📍 {(s.address as Record<string, string>).street ?? ""}{" "}
          {(s.address as Record<string, string>).number ?? ""}
          {(s.address as Record<string, string>).neighborhood
            ? `, ${(s.address as Record<string, string>).neighborhood}`
            : ""}
        </p>
      )}
      {!!s?.paymentMethod && <Badge label="Pagamento" value={String(s.paymentMethod)} />}
      {!!turn.paymentInfo?.pixCopyPaste && (
        <div className="mt-1 rounded bg-emerald-900/30 border border-emerald-700 p-1.5">
          <p className="text-[10px] text-emerald-400 mb-0.5">Pix (dry-run stub)</p>
          <p className="text-[11px] font-mono text-emerald-300 break-all">
            {turn.paymentInfo.pixCopyPaste}
          </p>
        </div>
      )}
    </div>
  );
}

function InspectorRoteamento({ turn }: { turn: SimTurn }) {
  const r = turn.routing;
  return (
    <div className="space-y-0.5 px-1">
      <Badge label="Handler final"     value={r.effectiveFinalHandler}
        ok={r.effectiveFinalHandler === "TEXT_ORDERING"} />
      <Badge label="Roteável (config)" value={r.routingEligible ? "sim" : "não"}
        ok={r.routingEligible} />
      <Badge label="Ordem detectada"   value={r.messageHasOrderIntent ? "sim" : "não"}
        ok={r.messageHasOrderIntent} />
      <Badge label="Sessão ativa"      value={r.hasActiveSession ? "sim" : "não"} />
      <Badge label="Reply capable"     value={r.replyCapable ? "sim" : "não"}
        ok={r.replyCapable} />
      <Badge label="Rotearia →"        value={r.wouldRouteToTextOrdering ? "TEXT_ORDERING" : "OLD_AGENT"}
        ok={r.wouldRouteToTextOrdering} />
      {r.declineReason && (
        <div className="mt-2 rounded bg-amber-900/30 border border-amber-700 p-1.5">
          <p className="text-[10px] text-amber-400 mb-0.5">Motivo de bloqueio</p>
          <p className="text-xs text-amber-300">{r.declineReason}</p>
        </div>
      )}
    </div>
  );
}

function InspectorSeguranca({ turn }: { turn: SimTurn }) {
  const hasSideEffects = turn.sideEffectsPerformed.length > 0;
  return (
    <div className="space-y-2 px-1">
      {hasSideEffects && (
        <div className="rounded border border-red-600 bg-red-900/40 p-2">
          <p className="text-xs font-bold text-red-300">⚠ Efeito colateral detectado!</p>
          {turn.sideEffectsPerformed.map((s, i) => (
            <p key={i} className="text-xs text-red-300">{s}</p>
          ))}
        </div>
      )}
      <div className="rounded border border-emerald-700 bg-emerald-900/20 p-2 space-y-1">
        <p className="text-[11px] font-semibold text-emerald-400">✓ Garantias do simulador</p>
        <p className="text-[11px] text-emerald-300">✓ Sem envio WhatsApp real</p>
        <p className="text-[11px] text-emerald-300">✓ Sem pedido real criado</p>
        <p className="text-[11px] text-emerald-300">✓ Sem Pix real gerado</p>
        <p className="text-[11px] text-emerald-300">✓ allowSideEffects=false fixo</p>
        <p className="text-[11px] text-emerald-300">✓ envio de WhatsApp nunca chamado</p>
      </div>
      <div className="space-y-0.5">
        {turn.safetyNotes.map((n, i) => (
          <p key={i} className="text-[11px] text-gray-400">· {n}</p>
        ))}
      </div>
    </div>
  );
}

function InspectorRawJson({ turn }: { turn: SimTurn }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify({ session: turn.session, routing: turn.routing, comanda: turn.comanda }, null, 2);

  async function copy() {
    await navigator.clipboard.writeText(json).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="px-1">
      <button
        type="button"
        onClick={copy}
        className="mb-2 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-700"
      >
        {copied ? "✓ Copiado" : "Copiar JSON"}
      </button>
      <pre className="overflow-auto rounded bg-gray-900 p-2 text-[10px] text-gray-300 max-h-64">
        {json}
      </pre>
    </div>
  );
}

function InspectorPanel({ turn, tab, setTab }: {
  turn: SimTurn | null;
  tab:  InspectorTab;
  setTab: (t: InspectorTab) => void;
}) {
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: "estado",     label: "Estado" },
    { id: "comanda",    label: "Comanda" },
    { id: "roteamento", label: "Roteamento" },
    { id: "seguranca",  label: "Segurança" },
    { id: "json",       label: "JSON" },
  ];

  return (
    <div className="flex w-[340px] shrink-0 flex-col border-l border-gray-700 bg-gray-900">
      {/* Tab bar */}
      <div className="flex border-b border-gray-700 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-3 py-2 text-[11px] font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-violet-400 text-violet-300"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {!turn ? (
          <p className="text-xs text-gray-500 italic">Envie uma mensagem para ver o diagnóstico aqui.</p>
        ) : (
          <>
            {tab === "estado"     && <InspectorEstado     turn={turn} />}
            {tab === "comanda"    && <InspectorComanda    turn={turn} />}
            {tab === "roteamento" && <InspectorRoteamento turn={turn} />}
            {tab === "seguranca"  && <InspectorSeguranca  turn={turn} />}
            {tab === "json"       && <InspectorRawJson    turn={turn} />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Chat bubble ───────────────────────────────────────────────────────────────

function ChatBubble({ msg, onClick, selected }: {
  msg:      SimMessage;
  onClick:  () => void;
  selected: boolean;
}) {
  const isCustomer = msg.role === "customer";
  const lines = msg.text.split("\n");

  return (
    <div
      className={`flex ${isCustomer ? "justify-end" : "justify-start"} px-4 py-0.5`}
      onClick={onClick}
    >
      <div
        className={`max-w-[72%] cursor-pointer rounded-xl px-3 py-2 shadow-sm transition-all ${
          isCustomer
            ? "rounded-br-sm bg-[#dcf8c6] text-gray-900"
            : `rounded-bl-sm ${selected ? "bg-blue-50 ring-2 ring-blue-300" : "bg-white"} text-gray-900`
        }`}
      >
        {lines.map((line, i) => (
          <p key={i} className={`text-[13.5px] leading-relaxed ${line === "" ? "h-2" : ""}`}>
            {line}
          </p>
        ))}
        <p className={`mt-0.5 text-[10px] ${isCustomer ? "text-right text-green-700" : "text-right text-gray-400"}`}>
          {fmtTime(msg.ts)}
          {!isCustomer && msg.turn && (
            <span className={`ml-1.5 rounded px-1 text-[9px] font-medium ${
              msg.turn.finalHandler === "TEXT_ORDERING"
                ? "bg-violet-100 text-violet-700"
                : "bg-orange-100 text-orange-700"
            }`}>
              {msg.turn.finalHandler === "TEXT_ORDERING" ? "IA" : "Agente"}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start px-4 py-1">
      <div className="rounded-xl rounded-bl-sm bg-white px-4 py-3 shadow-sm">
        <div className="flex gap-1">
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
          <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WaSimulatorPage() {
  const [restaurantSlug, setRestaurantSlug] = useState("sushi-cazza");
  const [customerName,   setCustomerName]   = useState("Diego");
  const [customerPhone,  setCustomerPhone]  = useState("+5511999990000");

  const [messages,     setMessages]     = useState<SimMessage[]>([]);
  const [inputText,    setInputText]    = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [session,      setSession]      = useState<Record<string, unknown> | null>(null);
  const [lastTurn,     setLastTurn]     = useState<SimTurn | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("estado");
  const [copiedReport, setCopiedReport] = useState(false);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const selectedMsgRef = useRef<string | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<string | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const resetConversation = useCallback(() => {
    setMessages([]);
    setSession(null);
    setLastTurn(null);
    setError(null);
    setInputText("");
    selectedMsgRef.current = null;
    setSelectedMsg(null);
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInputText("");
    setError(null);

    const customerMsg: SimMessage = {
      id:   uid(),
      role: "customer",
      text: trimmed,
      ts:   new Date(),
    };
    setMessages(prev => [...prev, customerMsg]);
    setLoading(true);

    try {
      const res = await fetch(
        "/api/admin/diagnostics/whatsapp-text-ordering/simulator/message",
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restaurantSlug,
            customerName,
            customerPhone,
            messageText:    trimmed,
            currentSession: session ?? undefined,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro desconhecido.");
        setLoading(false);
        return;
      }

      const turn: SimTurn = {
        finalHandler:         data.finalHandler,
        detectedIntent:       data.detectedIntent,
        stageBefore:          data.stageBefore,
        stageAfter:           data.stageAfter,
        session:              data.session,
        comanda:              data.comanda,
        routing:              data.routing,
        safetyNotes:          data.safetyNotes ?? [],
        sideEffectsPerformed: data.sideEffectsPerformed ?? [],
        restaurant:           data.restaurant,
        missingInfo:          data.missingInfo ?? [],
        paymentInfo:          data.paymentInfo ?? null,
      };

      const botMsg: SimMessage = {
        id:   uid(),
        role: "bot",
        text: data.botReply,
        ts:   new Date(),
        turn,
      };

      setMessages(prev => [...prev, botMsg]);
      setSession(data.session);
      setLastTurn(turn);

      // Auto-select the latest bot message for inspector
      selectedMsgRef.current = botMsg.id;
      setSelectedMsg(botMsg.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de rede.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [restaurantSlug, customerName, customerPhone, session, loading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(inputText);
    }
  }, [inputText, sendMessage]);

  function handleBubbleClick(msg: SimMessage) {
    if (msg.role === "bot" && msg.turn) {
      selectedMsgRef.current = msg.id;
      setSelectedMsg(msg.id);
      setLastTurn(msg.turn);
      setInspectorTab("estado");
    }
  }

  function buildTranscriptReport(): string {
    const lines: string[] = [
      "=== RELATÓRIO DO SIMULADOR WHATSAPP ===",
      `Restaurante: ${restaurantSlug}`,
      `Cliente: ${customerName} | Tel: ${customerPhone.replace(/\d(?=\d{4})/g, "*")}`,
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      "",
      "=== CONVERSA ===",
    ];
    for (const m of messages) {
      const role = m.role === "customer" ? `${customerName}:` : "Bot:";
      lines.push(`[${fmtTime(m.ts)}] ${role}`);
      lines.push(m.text);
      if (m.turn) {
        lines.push(
          `  → handler: ${m.turn.finalHandler} | intent: ${m.turn.detectedIntent} | stage: ${m.turn.stageBefore}→${m.turn.stageAfter}`,
        );
        if (m.turn.sideEffectsPerformed.length > 0) {
          lines.push(`  ⚠ SIDE EFFECTS: ${m.turn.sideEffectsPerformed.join(", ")}`);
        }
      }
      lines.push("");
    }
    if (lastTurn?.comanda) {
      lines.push("=== COMANDA FINAL ===");
      const c = lastTurn.comanda;
      for (const item of c.summary.items) {
        lines.push(`${item.quantity}× ${item.name} — R$ ${item.lineTotal.toFixed(2)}`);
      }
      lines.push(`Total: R$ ${c.total.toFixed(2)}`);
      lines.push("");
    }
    lines.push("=== SEGURANÇA ===");
    lines.push("✓ Nenhuma mensagem WhatsApp real enviada");
    lines.push("✓ Nenhum pedido real criado");
    lines.push("✓ Nenhum Pix real gerado");
    return lines.join("\n");
  }

  async function copyReport() {
    await navigator.clipboard.writeText(buildTranscriptReport()).catch(() => {});
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 1500);
  }

  const activeInspectorTurn = selectedMsg
    ? messages.find(m => m.id === selectedMsg)?.turn ?? lastTurn
    : lastTurn;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-white">
      {/* ── Debug banner ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-amber-900/20 border-b border-amber-700/40 px-6 py-2 flex items-center gap-3">
        <span className="text-amber-400 text-sm">⚠</span>
        <p className="text-xs text-amber-400">
          <span className="font-semibold">Esta tela é uma ferramenta de debug para desenvolvedores.</span>
          {" "}Para treinamento automático com clientes IA, use{" "}
          <a href="/admin/agentes/training" className="underline hover:text-amber-300">Treinamento IA → Arena</a>.
        </p>
      </div>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900 px-6 py-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-lg">🔧</span>
            <h1 className="text-base font-semibold text-white">
              WA Simulador — Debug / Desenvolvedor
            </h1>
            <span className="rounded-full border border-emerald-700 bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
              Simulação segura
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-400">
            Ferramenta de debug — permite digitar mensagens manualmente para testar o motor.
          </p>
        </div>
        <a
          href="/admin/diagnostics/whatsapp-text-ordering"
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
        >
          ← Test Center técnico
        </a>
      </div>

      {/* ── Safety banner ────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-emerald-800 bg-emerald-950/60 px-6 py-1.5">
        <p className="text-center text-[11px] font-medium text-emerald-300">
          🔒 Simulação — não envia WhatsApp · não cria pedido · não gera Pix · allowSideEffects=false sempre
        </p>
      </div>

      {/* ── Control bar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-gray-800 bg-gray-900 px-4 py-2 space-y-2">
        {/* Config inputs */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400">Restaurante</span>
            <input
              value={restaurantSlug}
              onChange={e => setRestaurantSlug(e.target.value)}
              className="w-32 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white focus:border-violet-500 focus:outline-none"
              placeholder="sushi-cazza"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400">Nome</span>
            <input
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              className="w-24 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white focus:border-violet-500 focus:outline-none"
              placeholder="Diego"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400">Telefone</span>
            <input
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              className="w-36 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white focus:border-violet-500 focus:outline-none"
              placeholder="+5511999990000"
            />
          </label>
          <button
            type="button"
            onClick={resetConversation}
            className="rounded border border-gray-600 bg-gray-800 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
          >
            ↺ Reset
          </button>
          <button
            type="button"
            onClick={copyReport}
            disabled={messages.length === 0}
            className="rounded border border-gray-600 bg-gray-800 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-40"
          >
            {copiedReport ? "✓ Copiado" : "📋 Copiar relatório"}
          </button>
        </div>

        {/* Quick buttons */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_BUTTONS.map(btn => (
            <button
              key={btn.label}
              type="button"
              onClick={() => void sendMessage(btn.text)}
              disabled={loading}
              className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] text-gray-300 hover:border-violet-600 hover:bg-violet-900/30 hover:text-violet-200 disabled:opacity-40 transition-colors"
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main split: chat + inspector ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Chat area ──────────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Chat header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-gray-800 bg-[#075E54] px-4 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-lg">
              🍣
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {restaurantSlug || "Restaurante"}
              </p>
              <p className="text-[11px] text-green-200">simulação</p>
            </div>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto py-3"
            style={{ background: "#e5ddd5", backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c2b5a8' fill-opacity='0.15'%3E%3Ccircle cx='25' cy='25' r='2'/%3E%3Ccircle cx='75' cy='75' r='2'/%3E%3Ccircle cx='75' cy='25' r='2'/%3E%3Ccircle cx='25' cy='75' r='2'/%3E%3C/g%3E%3C/svg%3E\")" }}
          >
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="rounded-xl bg-white/70 px-5 py-3 text-center shadow">
                  <p className="text-sm text-gray-600">Use os botões acima ou digite uma mensagem para iniciar a simulação.</p>
                </div>
              </div>
            )}
            {messages.map(msg => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                onClick={() => handleBubbleClick(msg)}
                selected={selectedMsg === msg.id}
              />
            ))}
            {loading && <TypingIndicator />}
            {error && (
              <div className="mx-4 my-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-xs text-red-700">⚠ {error}</p>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <div
            className="flex shrink-0 items-center gap-2 px-3 py-2"
            style={{ background: "#f0f0f0" }}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Digite uma mensagem…"
              className="flex-1 rounded-full border-0 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void sendMessage(inputText)}
              disabled={loading || !inputText.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#128C7E] text-white shadow disabled:opacity-50 hover:bg-[#0d7165] transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Inspector panel ─────────────────────────────────────────────────── */}
        <InspectorPanel
          turn={activeInspectorTurn}
          tab={inspectorTab}
          setTab={setInspectorTab}
        />
      </div>
    </div>
  );
}
