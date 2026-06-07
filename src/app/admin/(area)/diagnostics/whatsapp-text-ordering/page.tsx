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
import { DiagnosticReportActions } from "@/components/admin/DiagnosticReportActions";
import { buildWaOrderingReport, deriveMatchStatus, type WaOrderingReportResult } from "@/lib/admin/waOrderingReport";
import { buildScenarioRunnerReport } from "@/lib/admin/waScenarioReport";
import type { WaScenarioRunReport, WaScenarioResult } from "@/services/whatsapp/ordering/WhatsAppOrderingScenarioRunner";

// ── Types (mirror WaProcessResult) ────────────────────────────────────────────

interface OrderItem {
  quantity: number; menuItemName: string; variantName?: string;
  unitPrice: number; lineTotal: number;
  options: { optionName: string }[]; extras: { extraName: string }[];
}
interface ParsedItem { rawText: string; quantity: number; name: string }
interface Unresolved { rawText: string; quantity: number; reason: string; candidates: string[] }
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
  parsedItems: ParsedItem[];
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
  const [prevStage, setPrevStage]     = useState<string | null>(null);
  const [transcript, setTranscript]   = useState<TranscriptTurn[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const send = useCallback(async (continueSession: boolean, overrideMsg?: string) => {
    const msg = (overrideMsg ?? message).trim();
    if (!msg) return;
    // Stage the session was in BEFORE this message (for "stage anterior").
    const stageBefore = continueSession
      ? ((sessionState?.stage as string | undefined) ?? null)
      : null;
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
      setPrevStage(stageBefore);
      setTranscript(prev => [
        ...(continueSession ? prev : []),
        { who: "customer", text: msg },
        { who: "agent", text: data.suggestedReply, stage: data.stage },
      ]);
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }, [slug, phone, mode, message, conversationId, customerId, sessionState]);

  const reset = useCallback(() => {
    setResult(null); setSessionState(null); setPrevStage(null); setTranscript([]); setError(null);
  }, []);

  const hasSession = !!sessionState;

  // ── Scenario Runner state ───────────────────────────────────────────────────
  const [scReport, setScReport]     = useState<WaScenarioRunReport | null>(null);
  const [scLoading, setScLoading]   = useState<string | null>(null);
  const [scError, setScError]       = useState<string | null>(null);
  const [scExpanded, setScExpanded] = useState<Set<string>>(new Set());

  const runScenarios = useCallback(async (suite: "quick" | "full" | "edge" | "payment" | "all") => {
    setScLoading(suite); setScError(null);
    try {
      const res = await fetch("/api/admin/diagnostics/whatsapp-text-ordering/scenarios/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ restaurantSlug: slug, suite, phone }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      const data: WaScenarioRunReport = await res.json();
      setScReport(data);
      // Auto-expand failures so they're visible immediately.
      setScExpanded(new Set(data.results.filter(r => r.verdict === "FAIL").map(r => r.id)));
    } catch (e) {
      setScError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setScLoading(null);
    }
  }, [slug, phone]);

  const toggleScenario = useCallback((id: string) => {
    setScExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const buildScenarioReport = useCallback(() => {
    if (!scReport) return "";
    return buildScenarioRunnerReport(scReport);
  }, [scReport]);

  const buildReport = useCallback(() => {
    if (!result) return "";
    return buildWaOrderingReport(result as unknown as WaOrderingReportResult, {
      restaurant:  result.restaurant.name,
      slug:        result.restaurant.slug,
      phone,
      mode:        result.flagStatus.mode,
      messageText: result.messageText,
      previousStage: prevStage ?? undefined,
    });
  }, [result, phone, prevStage]);

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

      {/* B2. Controlled test activation checklist */}
      <details className="mt-3 rounded-xl border border-orange-200 bg-orange-50">
        <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-orange-800 select-none">
          Instruções para ativar teste controlado (clique para expandir)
        </summary>
        <div className="px-4 pb-4 pt-2 text-xs text-orange-900 space-y-2">
          <p className="font-semibold">Defina estas variáveis de ambiente no servidor de produção:</p>
          <pre className="rounded bg-white border border-orange-200 px-3 py-2 font-mono text-[11px] overflow-auto whitespace-pre-wrap">
{`# 1. Ativar o motor (false por padrão — nenhum cliente é afetado sem isso)
WHATSAPP_TEXT_ORDERING_ENABLED=true

# 2. Modo controlado
#   ALLOWLIST_REPLY_ONLY  → envia resposta, NÃO cria pedido real nem Pix
#   ALLOWLIST_FULL_TEST   → envia + pode criar pedido real + Pix (use com cuidado)
WHATSAPP_TEXT_ORDERING_MODE=ALLOWLIST_REPLY_ONLY

# 3. Restaurante(s) no allowlist (IDs separados por vírgula)
WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS=<restaurantId>

# 4. Telefone(s) de teste (formato E.164, separados por vírgula)
WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES=+5511999990000`}
          </pre>
          <p className="font-semibold mt-2">Checklist — tudo deve estar verde antes de ativar:</p>
          <ul className="space-y-1">
            <li className={`flex items-center gap-2 ${fs?.enabled ? "text-green-700" : "text-gray-500"}`}>
              <span>{fs?.enabled ? "✅" : "⬜"}</span>
              <span>WHATSAPP_TEXT_ORDERING_ENABLED=true</span>
            </li>
            <li className={`flex items-center gap-2 ${fs && fs.mode !== "DRY_RUN_ONLY" ? "text-green-700" : "text-gray-500"}`}>
              <span>{fs && fs.mode !== "DRY_RUN_ONLY" ? "✅" : "⬜"}</span>
              <span>Modo não é DRY_RUN_ONLY (atual: {fs?.mode ?? "—"})</span>
            </li>
            <li className={`flex items-center gap-2 ${fs?.restaurantAllowlisted ? "text-green-700" : "text-gray-500"}`}>
              <span>{fs?.restaurantAllowlisted ? "✅" : "⬜"}</span>
              <span>Restaurante &quot;{slug}&quot; no allowlist</span>
            </li>
            <li className={`flex items-center gap-2 ${fs?.phoneAllowlisted ? "text-green-700" : "text-gray-500"}`}>
              <span>{fs?.phoneAllowlisted ? "✅" : "⬜"}</span>
              <span>Telefone de teste no allowlist</span>
            </li>
            <li className="flex items-center gap-2 text-gray-500">
              <span>⬜</span>
              <span>Rodar suite &quot;quick&quot; abaixo e confirmar score ≥ 95/100 sem FAIL</span>
            </li>
            <li className="flex items-center gap-2 text-gray-500">
              <span>⬜</span>
              <span>Confirmar que número de teste NÃO é um cliente real (ou usar número de desenvolvimento)</span>
            </li>
          </ul>
          <p className="mt-2 text-orange-700 font-semibold">
            ⚠ Mesmo com o motor ativo, clientes fora do allowlist continuam usando o Receptionist normal.
          </p>
        </div>
      </details>

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
        {/* Active-session indicator — makes session continuity obvious */}
        {hasSession && (
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs">
            <Pill text="sessão ativa" tone="green" />
            <span className="text-gray-600">stage atual:</span>
            <Pill text={String(sessionState?.stage ?? "—")} tone="orange" />
            <span className="text-gray-500">A próxima mensagem continua esta sessão. Use “Nova sessão” para recomeçar.</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button onClick={() => send(hasSession)} disabled={loading}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            {loading ? "Simulando…" : hasSession ? "Enviar (continua sessão)" : "Simular mensagem"}
          </button>
          <button onClick={() => send(false)} disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Nova sessão
          </button>
          <button onClick={() => send(true, "cancela")} disabled={loading || !sessionState}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancelar sessão
          </button>
          <button onClick={reset} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Limpar
          </button>
          {result && (
            <DiagnosticReportActions
              buildReport={buildReport}
              jsonData={result}
              filenamePrefix="wa-text-ordering"
              slug={slug}
              ranAt={new Date().toISOString()}
            />
          )}
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

      {/* ── Scenario Runner ─────────────────────────────────────────────── */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-base">🤖</span>
          <h2 className="text-sm font-bold">Cenários automáticos</h2>
          <Pill text="REGRESSÃO" tone="orange" />
        </div>
        <p className="text-xs text-gray-500">
          Rode conversas completas (multi-turno) sem enviar WhatsApp real. A sessão é
          preservada entre as mensagens de cada cenário.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => runScenarios("quick")} disabled={!!scLoading}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
            {scLoading === "quick" ? "Rodando…" : "Rodar smoke test"}
          </button>
          <button onClick={() => runScenarios("full")} disabled={!!scLoading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {scLoading === "full" ? "Rodando…" : "Rodar cenários de pedido"}
          </button>
          <button onClick={() => runScenarios("edge")} disabled={!!scLoading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {scLoading === "edge" ? "Rodando…" : "Rodar casos difíceis"}
          </button>
          <button onClick={() => runScenarios("payment")} disabled={!!scLoading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {scLoading === "payment" ? "Rodando…" : "Rodar pagamento/frete"}
          </button>
          <button onClick={() => runScenarios("all")} disabled={!!scLoading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {scLoading === "all" ? "Rodando…" : "Rodar tudo"}
          </button>
          {scReport && (
            <DiagnosticReportActions
              buildReport={buildScenarioReport}
              jsonData={scReport}
              filenamePrefix="wa-scenarios"
              slug={slug}
              ranAt={scReport.ranAt}
            />
          )}
        </div>

        {scError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{scError}</div>
        )}

        {scReport && (
          <div className="mt-4 space-y-3">
            {/* Totals */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Pill text={`suíte: ${scReport.suite}`} tone="gray" />
              <Pill text={`total: ${scReport.total}`} tone="gray" />
              <Pill text={`✅ ${scReport.pass}`} tone="green" />
              <Pill text={`⚠️ ${scReport.warn}`} tone="amber" />
              <Pill text={`❌ ${scReport.fail}`} tone={scReport.fail > 0 ? "red" : "gray"} />
              <Pill text={`score: ${scReport.score}/100`} tone={scReport.fail > 0 ? "red" : scReport.warn > 0 ? "amber" : "green"} />
            </div>

            {/* Scenario list (failed first) */}
            <div className="space-y-2">
              {scReport.results.map(r => (
                <ScenarioRow key={r.id} r={r} open={scExpanded.has(r.id)} onToggle={() => toggleScenario(r.id)} />
              ))}
            </div>
          </div>
        )}
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

          {/* E2. Suggested reply (what the WhatsApp Agent would send) */}
          <Card title="Resposta sugerida" accent>
            <p className="text-sm text-gray-900">{result.suggestedReply || "—"}</p>
          </Card>

          {/* E3. Parsed items (raw → quantity/name) */}
          <Card title="Itens interpretados">
            {result.parsedItems && result.parsedItems.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {result.parsedItems.map((p, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Pill text={`${p.quantity}×`} />
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[11px] text-gray-400">raw: “{p.rawText}”</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">Sem itens interpretados</p>
            )}
          </Card>

          {/* E4. Menu matches (per-item status) */}
          <Card title="Correspondências no cardápio">
            {result.matchedItems.length > 0 || result.unresolvedItems.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {result.matchedItems.map((m, i) => {
                  const status = deriveMatchStatus(m, result.missingQuestions);
                  return (
                    <li key={`m-${i}`} className="flex flex-wrap items-center gap-2">
                      <Pill text={`${m.quantity}×`} />
                      <span className="font-medium">{m.menuItemName}{m.variantName ? ` ${m.variantName}` : ""}</span>
                      <Pill text={status} tone={status === "RESOLVED" ? "green" : "amber"} />
                      <span className="tabular-nums text-gray-500">{fmtBRL(m.unitPrice)}</span>
                    </li>
                  );
                })}
                {result.unresolvedItems.map((u, i) => (
                  <li key={`u-${i}`} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.rawText}</span>
                    <Pill text={u.reason} tone="red" />
                    {u.candidates.length > 0 && (
                      <span className="text-[11px] text-gray-500">candidatos: {u.candidates.join(", ")}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">Nenhum produto encontrado</p>
            )}
          </Card>

          {/* E5. Missing questions */}
          <Card title="Perguntas pendentes">
            {result.missingQuestions.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {result.missingQuestions.map((q, i) => (
                  <li key={i}>
                    <span className="font-medium">{q.itemName}</span>
                    <span className="text-gray-600"> — {q.groupName}?</span>
                    {q.options.length > 0 && (
                      <span className="text-[11px] text-gray-400"> ({q.options.join(", ")})</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">Nenhuma pergunta pendente</p>
            )}
          </Card>

          {/* F. Session panel */}
          <Card title="Sessão">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <Field k="status" v={result.session.status} />
              <Field k="stage anterior" v={prevStage ?? "—"} />
              <Field k="stage final" v={result.session.stage} />
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

const VERDICT_TONE = { PASS: "green", WARN: "amber", FAIL: "red" } as const;
const VERDICT_ICON = { PASS: "✅", WARN: "⚠️", FAIL: "❌" } as const;

function ScenarioRow({ r, open, onToggle }: { r: WaScenarioResult; open: boolean; onToggle: () => void }) {
  const tone = VERDICT_TONE[r.verdict];
  return (
    <div className={`rounded-lg border ${r.verdict === "FAIL" ? "border-red-200" : r.verdict === "WARN" ? "border-amber-200" : "border-gray-200"}`}>
      <button onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm">
        <span className="flex items-center gap-2">
          <span>{VERDICT_ICON[r.verdict]}</span>
          <span className="font-semibold">{r.name}</span>
          <Pill text={r.category} tone="gray" />
        </span>
        <span className="flex items-center gap-2">
          <Pill text={r.verdict} tone={tone} />
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-gray-100 px-3 py-3 text-xs">
          <p className="text-gray-500">{r.description}</p>

          {/* Checks */}
          <div>
            <p className="mb-1 font-semibold uppercase tracking-wide text-gray-400">Verificações</p>
            <ul className="space-y-1">
              {r.checks.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span>{VERDICT_ICON[c.severity]}</span>
                  <span className="font-medium">{c.label}:</span>
                  <span className="text-gray-600">{c.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Transcript + stage transitions */}
          <div>
            <p className="mb-1 font-semibold uppercase tracking-wide text-gray-400">Conversa</p>
            <div className="space-y-1.5">
              {r.steps.map(s => (
                <div key={s.index} className="rounded-md bg-gray-50 p-2">
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <span>{s.previousStage}</span><span>→</span><span className="font-semibold text-gray-600">{s.stage}</span>
                    {s.actions.length > 0 && <span className="ml-1">· {s.actions.join(", ")}</span>}
                  </div>
                  <p className="text-gray-900">→ {s.message}</p>
                  <p className="text-gray-600">← {s.suggestedReply || "—"}</p>
                  {s.matchedItems.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      itens: {s.matchedItems.map(m => `${m.quantity}× ${m.name}${m.variant ? ` ${m.variant}` : ""}`).join(", ")}
                    </p>
                  )}
                  {s.unresolvedItems.length > 0 && (
                    <p className="text-[11px] text-amber-700">
                      não resolvido: {s.unresolvedItems.map(u => `${u.rawText} (${u.reason})`).join(", ")}
                    </p>
                  )}
                  {s.sideEffectsPerformed.length > 0 && (
                    <p className="text-[11px] font-semibold text-red-700">⚠ efeito: {s.sideEffectsPerformed.join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Final draft / items */}
          {r.finalItems.length > 0 && (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-gray-400">Comanda final</p>
              <ul className="space-y-0.5">
                {r.finalItems.map((m, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{m.quantity}× {m.name}{m.variant ? ` ${m.variant}` : ""}</span>
                    <span className="tabular-nums text-gray-500">R$ {m.lineTotal.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Raw JSON */}
          <details>
            <summary className="cursor-pointer font-semibold uppercase tracking-wide text-gray-400">JSON do cenário</summary>
            <pre className="mt-1 max-h-60 overflow-auto rounded bg-gray-50 p-2 text-[10px] text-gray-600">
              {JSON.stringify(r, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
