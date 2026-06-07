"use client";

/**
 * WA Pedido Texto — admin Test Center (W5).
 *
 * Multi-step WhatsApp order simulator. Maintains a transcript and a continuing
 * session so you can walk a full conversation (items → options → delivery →
 * address → payment) without affecting real customers. Dry-run from this page
 * NEVER sends WhatsApp, creates an order, or generates a real Pix.
 */

import { useState, useCallback } from "react";

// ── Types (mirror WaProcessResult) ────────────────────────────────────────────

interface OrderItem {
  quantity: number; menuItemName: string; variantName?: string;
  unitPrice: number; lineTotal: number;
  options: { optionName: string }[]; extras: { extraName: string }[];
}
interface Unresolved { rawText: string; reason: string; candidates: string[] }
interface MissingQ { itemName: string; groupName: string; options: string[] }
interface DraftLine { name: string; quantity: number; variant?: string; options: string[]; extras: string[]; lineTotal: number }
interface Draft { subtotal: number; items: DraftLine[]; missingRequirements: string[] }
interface DeliveryQuote { fee: number; distanceKm?: number; status: string; reason?: string }
interface Payment { method: string | null; status: string | null; pixCopyPaste?: string; isDryRunStub?: boolean; changeFor?: number }
interface Session {
  status: string; stage: string; deliveryType: string | null;
  address: Record<string, string> | null; paymentMethod: string | null; paymentStatus: string | null;
  orderId: string | null; orderDraftId: string | null;
}
interface FlagStatus {
  enabled: boolean; mode: string; requestedMode: string;
  restaurantAllowlisted: boolean; phoneAllowlisted: boolean; liveRoutingActive: boolean;
}
interface SimResult {
  restaurant: { id: string; name: string; slug: string };
  messageText: string;
  flagStatus: FlagStatus;
  session: Session;
  stage: string; intent: string;
  matchedItems: OrderItem[]; unresolvedItems: Unresolved[]; missingQuestions: MissingQ[];
  draft: Draft | null; deliveryQuote: DeliveryQuote | null; payment: Payment | null;
  order: { orderId: string | null; status: string | null; wouldCreate: boolean } | null;
  estimatedTotal: number; suggestedReply: string; operatorSummary: string;
  actions: string[]; safetyNotes: string[]; sideEffectsPerformed: string[]; handoff: boolean;
}

interface TranscriptTurn { who: "customer" | "agent"; text: string; stage?: string }

const QUICK = [
  "quero 2 yakisoba e uma coca",
  "quero um combinado grande",
  "frango",
  "é entrega",
  "meu endereço é Rua das Flores, 123",
  "vou pagar no pix",
  "cartão na entrega",
  "cancela",
  "quero falar com atendente",
];

const fmtBRL = (v: number) => `R$ ${v.toFixed(2)}`;

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-xl border ${accent ? "border-orange-200 bg-orange-50" : "border-gray-200 bg-white"} p-4`}>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">{title}</h3>
      {children}
    </div>
  );
}

function Pill({ text, tone = "gray" }: { text: string; tone?: "gray" | "green" | "amber" | "red" | "orange" }) {
  const cls = {
    gray:   "bg-gray-100 text-gray-700 border-gray-200",
    green:  "bg-green-100 text-green-700 border-green-200",
    amber:  "bg-amber-100 text-amber-700 border-amber-200",
    red:    "bg-red-100 text-red-700 border-red-200",
    orange: "bg-orange-100 text-orange-700 border-orange-200",
  }[tone];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{text}</span>;
}

export default function WaTextOrderingPage() {
  const [slug, setSlug]               = useState("sushi-cazza");
  const [phone, setPhone]             = useState("+5511999990000");
  const [conversationId, setConvId]   = useState("");
  const [customerId, setCustomerId]   = useState("");
  const [mode, setMode]               = useState<"dry_run" | "reply_only" | "full_test">("dry_run");
  const [message, setMessage]         = useState("quero 2 yakisoba e uma coca");

  const [result, setResult]           = useState<SimResult | null>(null);
  const [sessionState, setSessionState] = useState<Record<string, unknown> | null>(null);
  const [transcript, setTranscript]   = useState<TranscriptTurn[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);

  const send = useCallback(async (continueSession: boolean, overrideMsg?: string) => {
    const msg = (overrideMsg ?? message).trim();
    if (!msg) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/diagnostics/whatsapp-text-ordering/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          restaurantSlug: slug,
          messageText:    msg,
          phone, mode,
          conversationId: conversationId || undefined,
          customerId:     customerId || undefined,
          currentSession: continueSession ? (sessionState ?? undefined) : undefined,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      const data: SimResult = await res.json();
      setResult(data);
      setSessionState(data.session as unknown as Record<string, unknown>);
      setTranscript(prev => [
        ...(continueSession ? prev : []),
        { who: "customer", text: msg },
        { who: "agent", text: data.suggestedReply, stage: data.stage },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }, [slug, phone, mode, message, conversationId, customerId, sessionState]);

  const reset = useCallback(() => {
    setResult(null); setSessionState(null); setTranscript([]); setError(null);
  }, []);

  const copyJson = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }, [result]);

  const fs = result?.flagStatus;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 text-gray-900">
      {/* A. Header */}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg">🧾</span>
        <h1 className="text-xl font-bold">WA Pedido Texto</h1>
        <Pill text="TEST CENTER" tone="orange" />
      </div>
      <p className="text-sm text-gray-500">Simule pedidos por WhatsApp sem afetar clientes reais.</p>

      {/* B. Safety banner */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Pill text={fs?.enabled ? "flag: ON" : "flag: OFF"} tone={fs?.enabled ? "amber" : "green"} />
          <Pill text={`modo: ${fs?.mode ?? "DRY_RUN_ONLY"}`} tone="gray" />
          <Pill text={fs?.liveRoutingActive ? "live routing: ATIVO" : "live routing: inativo"} tone={fs?.liveRoutingActive ? "red" : "green"} />
          {fs && <Pill text={fs.restaurantAllowlisted ? "restaurante allowlist ✓" : "restaurante não allowlist"} tone={fs.restaurantAllowlisted ? "green" : "gray"} />}
          {fs && <Pill text={fs.phoneAllowlisted ? "telefone allowlist ✓" : "telefone não allowlist"} tone={fs.phoneAllowlisted ? "green" : "gray"} />}
        </div>
        <p className="mt-2 text-gray-600">
          Dry-run não cria pedido, não gera Pix e não envia WhatsApp.
        </p>
      </div>

      {/* C. Input panel */}
      <div className="mt-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Restaurante (slug)
          <input value={slug} onChange={e => setSlug(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Telefone
          <input value={phone} onChange={e => setPhone(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Conversation ID (opcional)
          <input value={conversationId} onChange={e => setConvId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Customer ID (opcional)
          <input value={customerId} onChange={e => setCustomerId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Modo
          <select value={mode} onChange={e => setMode(e.target.value as typeof mode)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="dry_run">Dry-run (sem efeitos)</option>
            <option value="reply_only">Reply-only (teste controlado)</option>
            <option value="full_test">Full controlled test</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600 sm:col-span-2">
          Mensagem do cliente
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-mono" />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button onClick={() => send(false)} disabled={loading}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            {loading ? "Simulando…" : "Simular mensagem"}
          </button>
          <button onClick={() => send(true)} disabled={loading || !sessionState}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Continuar sessão
          </button>
          <button onClick={() => send(true, "cancela")} disabled={loading || !sessionState}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancelar sessão
          </button>
          <button onClick={reset} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Limpar
          </button>
          <button onClick={copyJson} disabled={!result}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {copied ? "✓ Copiado" : "Copiar JSON"}
          </button>
        </div>
      </div>

      {/* D. Quick scenarios */}
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK.map(q => (
          <button key={q} onClick={() => { setMessage(q); send(!!sessionState, q); }}
            className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-600 hover:border-orange-300 hover:text-orange-700">
            {q}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{result.restaurant.name}</span>
            <Pill text={result.intent} tone="orange" />
            <Pill text={`stage: ${result.stage}`} />
            {result.handoff && <Pill text="HANDOFF" tone="red" />}
          </div>

          {/* E. Conversation transcript */}
          <Card title="Conversa simulada">
            <div className="space-y-2">
              {transcript.map((t, i) => (
                <div key={i} className={`flex ${t.who === "customer" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    t.who === "customer" ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-900"}`}>
                    {t.text}
                    {t.stage && t.who === "agent" && (
                      <span className="mt-1 block text-[10px] opacity-60">{t.stage}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* F. Session panel */}
          <Card title="Sessão">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <Field k="status" v={result.session.status} />
              <Field k="stage" v={result.session.stage} />
              <Field k="entrega" v={result.session.deliveryType ?? "—"} />
              <Field k="pagamento" v={result.session.paymentMethod ?? "—"} />
              <Field k="pgto status" v={result.session.paymentStatus ?? "—"} />
              <Field k="orderId" v={result.session.orderId ?? "—"} />
            </div>
            {result.session.address && (
              <p className="mt-2 text-xs text-gray-600">
                Endereço: {[result.session.address.street, result.session.address.number, result.session.address.neighborhood].filter(Boolean).join(", ") || "—"}
              </p>
            )}
            {result.missingQuestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {result.missingQuestions.map((q, i) => (
                  <Pill key={i} text={`${q.itemName}: ${q.groupName}`} tone="amber" />
                ))}
              </div>
            )}
            {result.unresolvedItems.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {result.unresolvedItems.map((u, i) => (
                  <Pill key={i} text={`${u.rawText} (${u.reason})`} tone="red" />
                ))}
              </div>
            )}
          </Card>

          {/* G. Comanda */}
          {result.draft && (
            <Card title="Comanda">
              <ul className="space-y-1 text-sm">
                {result.draft.items.map((l, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{l.quantity}× {l.name}{l.variant ? ` ${l.variant}` : ""}{l.options.length ? ` (${l.options.join(", ")})` : ""}</span>
                    <span className="tabular-nums">{fmtBRL(l.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t border-gray-200 pt-2 text-sm">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmtBRL(result.draft.subtotal)}</span></div>
                {result.deliveryQuote && result.session.deliveryType === "DELIVERY" && (
                  <div className="flex justify-between text-gray-600"><span>Entrega</span><span>{fmtBRL(result.deliveryQuote.fee)}</span></div>
                )}
                <div className="flex justify-between font-bold"><span>Total</span><span>{fmtBRL(result.estimatedTotal)}</span></div>
              </div>
              <div className="mt-2">
                {result.draft.missingRequirements.length > 0
                  ? <Pill text="incompleto" tone="amber" />
                  : result.order?.orderId
                    ? <Pill text="pedido criado" tone="green" />
                    : result.session.stage === "AWAITING_PIX_PAYMENT"
                      ? <Pill text="aguardando pagamento" tone="amber" />
                      : <Pill text="pronto para confirmar" tone="green" />}
              </div>
            </Card>
          )}

          {/* H. Payment */}
          {result.payment && (
            <Card title="Pagamento" accent>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Pill text={result.payment.method ?? "—"} tone="orange" />
                <Pill text={result.payment.status ?? "—"} />
                {result.payment.isDryRunStub && <Pill text="STUB (não real)" tone="amber" />}
                {result.payment.changeFor && <Pill text={`troco p/ ${fmtBRL(result.payment.changeFor)}`} />}
              </div>
              {result.payment.pixCopyPaste && (
                <pre className="mt-2 overflow-auto rounded bg-white p-2 text-[11px] text-gray-600 border border-gray-200">
                  {result.payment.pixCopyPaste}
                </pre>
              )}
              <p className="mt-2 text-xs font-semibold text-orange-700">⚠ Pix gerado não confirma pedido.</p>
            </Card>
          )}

          {/* Operator summary (handoff) */}
          {result.handoff && (
            <Card title="Resumo para o operador">
              <p className="text-sm text-gray-700">{result.operatorSummary}</p>
            </Card>
          )}

          {/* Safety notes */}
          <Card title="Notas de segurança">
            <ul className="space-y-1 text-xs text-gray-600">
              {result.safetyNotes.map((n, i) => <li key={i}>✓ {n}</li>)}
              {result.sideEffectsPerformed.length === 0
                ? <li className="text-green-700 font-semibold">Nenhum efeito colateral real executado.</li>
                : result.sideEffectsPerformed.map((s, i) => <li key={`se-${i}`} className="text-red-700 font-semibold">⚠ efeito real: {s}</li>)}
            </ul>
          </Card>

          {/* I. Raw JSON */}
          <Card title="JSON bruto">
            <pre className="max-h-72 overflow-auto rounded bg-gray-50 p-3 text-[11px] text-gray-600">
              {JSON.stringify(result, null, 2)}
            </pre>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-gray-50 px-2 py-1">
      <span className="block text-[10px] uppercase tracking-wide text-gray-400">{k}</span>
      <span className="text-gray-800 break-all">{v}</span>
    </div>
  );
}
