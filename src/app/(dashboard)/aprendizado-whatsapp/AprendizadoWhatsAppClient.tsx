"use client";

/**
 * Agentes → WhatsApp — gestor-facing, business-language view of the WhatsApp
 * sales agent.
 *
 * Seven tabs:
 *   1. Visão Geral        — status, KPIs, pending learnings count.
 *   2. Conversas de hoje  — recent conversations + masked outcome.
 *   3. Aprendizados pendentes — error/opportunity cards to approve/reject/keep.
 *   4. Simulador          — try a message, see what the agent would say.
 *   5. Saúde do WhatsApp  — 24 h metrics, top errors.
 *   6. Configurações      — minimal WA config (read-mostly, current state).
 *   7. Modo avançado      — links to technical admin diagnostics (admin only).
 *
 * Technical terms are hidden inside "Detalhes técnicos" collapses; the main copy
 * stays in plain business language. This screen never sends WhatsApp and never
 * creates orders/Pix — it only reads conversations and manages the learning queue.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  WA_TABS,
  APPROVAL_DISCLAIMER,
  MODO_AVANCADO_LINKS,
  MASTER_STATUS_LABEL,
  MASTER_AREA_LABEL,
  MASTER_SEVERITY_LABEL,
} from "./wa-agent-ux.constants";
import type { WaTabId } from "./wa-agent-ux.constants";

// ── shared types ──────────────────────────────────────────────────────────────

interface LearningCard {
  id: string;
  status: string;
  title: string;
  situationSummary: string;
  customerWanted: string;
  agentAnswered: string;
  problem: string;
  idealAnswer: string;
  learningRule: string;
  salesImpact: string;
  severity: "P0" | "P1" | "P2";
  suggestedAction: string;
  occurrences: number;
  technicalDetails: unknown;
}

interface FeedItem {
  conversationId: string;
  outcome: string;
  summary: string;
  outcomeReason: string;
  issueCount: number;
  lastMessageAt: string | null;
}

interface HealthSnapshot {
  conversations: number;
  ordersGenerated: number;
  revenue: number;
  conversationToOrderRate: number;
  handoffs: number;
  abandonos: number;
  topErrors: { category: string; label: string; count: number }[];
  pendingLearnings: number;
}

interface AgentConfig {
  agentName?: string;
  agentMode?: string;
  handoffPhone?: string;
  menuUrl?: string;
}

interface SimMessage {
  id: string;
  role: "customer" | "bot";
  text: string;
}

interface MasterScenarioResult {
  id: string;
  area: string;
  status: "PASS" | "WARNING" | "FAIL";
  severity: "P0" | "P1" | "P2";
  what: string;
  expected: string;
  got: string;
  recommendedFix?: string;
}

interface MasterAreaSummary {
  area: string;
  status: "PASS" | "WARNING" | "FAIL";
  passed: number;
  warned: number;
  failed: number;
}

interface MasterReport {
  status: "PASS" | "WARNING" | "FAIL";
  p0: number; p1: number; p2: number;
  total: number; passed: number; warned: number; failed: number;
  scenarios: MasterScenarioResult[];
  summary: MasterAreaSummary[];
  safety: { noEvolution: boolean; noRealOrder: boolean; noRealPix: boolean; runtimeTouched: false };
  runtimeTouched: false;
  ranAt: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_LABEL: Record<string, string> = {
  P0: "crítico",
  P1: "atenção",
  P2: "melhoria",
};

const SEVERITY_TONE: Record<string, string> = {
  P0: "bg-red-100 text-red-800",
  P1: "bg-amber-100 text-amber-800",
  P2: "bg-gray-100 text-gray-700",
};

const OUTCOME_TONE: Record<string, string> = {
  VENDA_CONCLUIDA: "bg-green-100 text-green-800",
  ATENDENTE_ASSUMIU: "bg-blue-100 text-blue-800",
  OK_SEM_ACAO: "bg-gray-100 text-gray-700",
};

function outcomeTone(o: string): string {
  if (OUTCOME_TONE[o]) return OUTCOME_TONE[o];
  if (o.startsWith("ERRO") || o === "LOOP") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

const moneyBR = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ── root component ────────────────────────────────────────────────────────────

export function AprendizadoWhatsAppClient() {
  const [tab, setTab] = useState<WaTabId>("visao-geral");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <p className="text-sm text-gray-500 mb-4">
        Acompanhe o desempenho do agente, revise aprendizados e ajuste configurações do WhatsApp.
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {WA_TABS.map((t) => (
          <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </TabButton>
        ))}
      </div>

      {tab === "visao-geral"   && <VisaoGeralTab onTabChange={setTab} />}
      {tab === "conversas"     && <ConversasTab />}
      {tab === "aprendizados"  && <AprendizadosTab />}
      {tab === "simulador"     && <SimuladorTab />}
      {tab === "saude"         && <SaudeTab />}
      {tab === "configuracoes" && <ConfiguracoesTab />}
      {tab === "modo-avancado" && <ModoAvancadoTab />}
    </div>
  );
}

// ── Tab 1: Visão Geral ────────────────────────────────────────────────────────

function VisaoGeralTab({ onTabChange }: { onTabChange: (t: WaTabId) => void }) {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/whatsapp/learning/health?period=24h")
      .then((r) => r.json())
      .then((j) => setSnap(j?.data?.snapshot ?? null))
      .catch(() => setError("Não foi possível carregar o resumo do WhatsApp."));
  }, []);

  if (error) return <Empty>{error}</Empty>;
  if (!snap) return <Empty>Carregando…</Empty>;

  const rateFormatted = `${Math.round(snap.conversationToOrderRate * 100)}%`;

  return (
    <div className="space-y-6">
      {snap.pendingLearnings > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {snap.pendingLearnings} aprendizado{snap.pendingLearnings > 1 ? "s" : ""} aguardando revisão
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Revise e aprove para a IA melhorar nas próximas conversas.
            </p>
          </div>
          <button
            onClick={() => onTabChange("aprendizados")}
            className="shrink-0 ml-4 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            Revisar agora
          </button>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">WhatsApp hoje (últimas 24h)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Clientes atendidos"   value={String(snap.conversations)} />
          <Metric label="Pedidos gerados"       value={String(snap.ordersGenerated)} />
          <Metric label="Receita gerada"        value={moneyBR(snap.revenue)} />
          <Metric label="Conversa → pedido"     value={rateFormatted} />
          <Metric label="Transferências humanas" value={String(snap.handoffs)} />
          <Metric label="Conversas abandonadas" value={String(snap.abandonos)} />
        </div>
      </div>

      {snap.topErrors.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Erros detectados hoje</h2>
          <ul className="space-y-1">
            {snap.topErrors.slice(0, 3).map((e) => (
              <li key={e.category} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                <span className="text-gray-700">{e.label}</span>
                <span className="font-semibold text-red-600">{e.count}</span>
              </li>
            ))}
          </ul>
          {snap.topErrors.length > 3 && (
            <button
              onClick={() => onTabChange("saude")}
              className="mt-2 text-xs text-brand-600 hover:underline"
            >
              Ver todos os erros →
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <QuickAction icon="💬" label="Conversas de hoje"        onClick={() => onTabChange("conversas")} />
        <QuickAction icon="🧠" label="Aprendizados pendentes"   onClick={() => onTabChange("aprendizados")} />
        <QuickAction icon="🧪" label="Testar uma mensagem"      onClick={() => onTabChange("simulador")} />
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors text-left"
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );
}

// ── Tab 2: Conversas de hoje ──────────────────────────────────────────────────

function ConversasTab() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/whatsapp/learning/conversations?window=24")
      .then((r) => r.json())
      .then((j) => setItems(j?.data?.conversations ?? []))
      .catch(() => setError("Não foi possível carregar as conversas."));
  }, []);

  if (error) return <Empty>{error}</Empty>;
  if (!items) return <Empty>Carregando…</Empty>;
  if (items.length === 0) return <Empty>Nenhuma conversa nas últimas 24h.</Empty>;

  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.conversationId} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
          <div>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${outcomeTone(it.outcome)}`}>
              {it.summary}
            </span>
            <p className="mt-1 text-xs text-gray-500">{it.outcomeReason}</p>
          </div>
          <div className="flex items-center gap-3">
            {it.issueCount > 0 && (
              <span className="text-xs text-red-600">{it.issueCount} ponto(s) de aprendizado</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab 3: Aprendizados pendentes ─────────────────────────────────────────────

function AprendizadosTab() {
  const [cards, setCards] = useState<LearningCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/whatsapp/learning?status=PENDING_REVIEW")
      .then((r) => r.json())
      .then((j) => setCards(j?.data?.learnings ?? []))
      .catch(() => setError("Não foi possível carregar os aprendizados."));
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, decision: "APPROVE" | "REJECT" | "BACKLOG") => {
    setBusy(id);
    try {
      await fetch(`/api/whatsapp/learning/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      setCards((prev) => prev ? prev.filter((c) => c.id !== id) : prev);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Empty>{error}</Empty>;
  if (!cards) return <Empty>Carregando…</Empty>;
  if (cards.length === 0) return <Empty>Nenhum aprendizado pendente 🎉</Empty>;

  return (
    <div className="space-y-4">
      {cards.map((c) => (
        <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_TONE[c.severity]}`}>
              {SEVERITY_LABEL[c.severity] ?? c.severity}
            </span>
            <h3 className="text-base font-semibold text-gray-900">{c.title}</h3>
            {c.occurrences > 1 && (
              <span className="ml-auto text-xs text-gray-500">{c.occurrences} conversas</span>
            )}
          </div>

          <dl className="space-y-2 text-sm">
            <Row label="O que o cliente queria">{c.customerWanted}</Row>
            <Row label="O que a IA respondeu">{c.agentAnswered}</Row>
            <Row label="Qual foi o erro">{c.problem}</Row>
            <Row label="Resposta ideal">
              <span className="text-emerald-700">{c.idealAnswer}</span>
            </Row>
            <Row label="Aprendizado sugerido">{c.learningRule}</Row>
            <Row label="Impacto na venda">{c.salesImpact}</Row>
          </dl>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-gray-400">Detalhes técnicos</summary>
            <pre className="mt-1 overflow-auto rounded bg-gray-50 p-2 text-[11px] text-gray-500">
              {JSON.stringify(c.technicalDetails, null, 2)}
            </pre>
          </details>

          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <button
                disabled={busy === c.id}
                onClick={() => decide(c.id, "APPROVE")}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Aprovar aprendizado
              </button>
              <button
                disabled={busy === c.id}
                onClick={() => decide(c.id, "REJECT")}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Rejeitar
              </button>
              <button
                disabled={busy === c.id}
                onClick={() => decide(c.id, "BACKLOG")}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                Guardar para depois
              </button>
            </div>
            <p className="text-xs text-gray-400 border-t border-gray-100 pt-2">
              ℹ️ {APPROVAL_DISCLAIMER}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Master Simulator section (top of Simulador tab) ───────────────────────────

const MASTER_STATUS_BG: Record<string, string> = {
  PASS:    "bg-green-50 border-green-200",
  WARNING: "bg-amber-50 border-amber-200",
  FAIL:    "bg-red-50 border-red-200",
};

const MASTER_STATUS_TEXT: Record<string, string> = {
  PASS:    "text-green-800",
  WARNING: "text-amber-800",
  FAIL:    "text-red-800",
};

const MASTER_STATUS_ICON: Record<string, string> = {
  PASS:    "✅",
  WARNING: "⚠️",
  FAIL:    "❌",
};

const MASTER_SEVERITY_CHIP: Record<string, string> = {
  P0: "bg-red-200 text-red-800",
  P1: "bg-amber-200 text-amber-800",
  P2: "bg-gray-200 text-gray-700",
};

function MasterSimuladorSection() {
  const [report, setReport] = useState<MasterReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/master-simulator/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? json.message ?? "Erro na verificação");
      setReport(json as MasterReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setRunning(false);
    }
  }

  const problems = report?.scenarios.filter((s) => s.status !== "PASS") ?? [];

  return (
    <div className="space-y-4 pb-6 border-b border-gray-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Verificação completa do agente</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Testa todas as áreas: cardápio, recepção, pedido, pagamento, entrega e transferência.
            Seguro — nenhuma mensagem real é enviada.
          </p>
        </div>
        <button
          onClick={runCheck}
          disabled={running}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {running ? "Verificando…" : "Executar verificação"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">{error}</p>
      )}

      {!report && !running && !error && (
        <p className="text-xs text-gray-400 text-center py-3">
          Clique em &ldquo;Executar verificação&rdquo; para testar todas as áreas do agente WhatsApp.
        </p>
      )}

      {report && (
        <div className="space-y-4">
          {/* Overall status card */}
          <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${MASTER_STATUS_BG[report.status]}`}>
            <div>
              <p className={`text-base font-semibold ${MASTER_STATUS_TEXT[report.status]}`}>
                {MASTER_STATUS_ICON[report.status]} {MASTER_STATUS_LABEL[report.status] ?? report.status}
              </p>
              <p className={`text-xs mt-0.5 ${MASTER_STATUS_TEXT[report.status]}`}>
                {report.passed}/{report.total} verificações passaram
                {report.p0 > 0 && ` · ${report.p0} crítico${report.p0 > 1 ? "s" : ""}`}
                {report.p1 > 0 && report.p0 === 0 && ` · ${report.p1} atenção`}
              </p>
            </div>
            <p className="text-xs text-gray-400 shrink-0 ml-4">
              {new Date(report.ranAt).toLocaleString("pt-BR")}
            </p>
          </div>

          {/* Area grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {report.summary.map((area) => {
              const total = area.passed + area.warned + area.failed;
              return (
                <div key={area.area} className={`rounded-lg border p-3 ${MASTER_STATUS_BG[area.status]}`}>
                  <p className={`text-xs font-semibold ${MASTER_STATUS_TEXT[area.status]}`}>
                    {MASTER_STATUS_ICON[area.status]} {MASTER_AREA_LABEL[area.area] ?? area.area}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${MASTER_STATUS_TEXT[area.status]}`}>
                    {area.passed}/{total} ok
                  </p>
                </div>
              );
            })}
          </div>

          {/* Problem list */}
          {problems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-700">
                {problems.length} situaç{problems.length > 1 ? "ões" : "ão"} para atenção
              </h4>
              {problems.map((s) => (
                <div key={s.id} className={`rounded-lg border p-3 ${MASTER_STATUS_BG[s.status]}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${MASTER_SEVERITY_CHIP[s.severity] ?? "bg-gray-200 text-gray-700"}`}>
                      {MASTER_SEVERITY_LABEL[s.severity] ?? s.severity}
                    </span>
                    <span className={`text-xs font-medium ${MASTER_STATUS_TEXT[s.status]}`}>
                      {MASTER_AREA_LABEL[s.area] ?? s.area}
                    </span>
                  </div>
                  <dl className="space-y-1 text-xs">
                    <div>
                      <dt className="text-gray-500 inline">Situação: </dt>
                      <dd className="inline text-gray-800">{s.what}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 inline">Esperado: </dt>
                      <dd className="inline text-emerald-700">{s.expected}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 inline">Aconteceu: </dt>
                      <dd className="inline text-gray-700">{s.got}</dd>
                    </div>
                    {s.recommendedFix && (
                      <div>
                        <dt className="text-gray-500 inline">Correção sugerida: </dt>
                        <dd className="inline text-gray-700">{s.recommendedFix}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </div>
          )}

          {/* Safety flags */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">Garantias de segurança</p>
            <ul className="space-y-1 text-xs text-gray-600">
              <li>✅ Nenhuma mensagem WhatsApp foi enviada</li>
              <li>✅ Nenhum pedido real foi criado</li>
              <li>✅ Nenhum Pix real foi gerado</li>
              <li>✅ Atendimento em produção não foi alterado</li>
            </ul>
          </div>

          {/* Technical details accordion */}
          <details className="rounded-xl border border-gray-200">
            <summary className="cursor-pointer select-none px-4 py-2 text-xs text-gray-400">
              Detalhes técnicos ({report.total} verificações)
            </summary>
            <pre className="overflow-auto rounded-b-xl bg-gray-50 p-3 text-[10px] text-gray-500 max-h-64">
              {JSON.stringify({ safety: report.safety, scenarios: report.scenarios }, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Simulador ──────────────────────────────────────────────────────────

function SimuladorTab() {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);

    const customerMsg: SimMessage = { id: `c-${Date.now()}`, role: "customer", text };
    setMessages((prev) => [...prev, customerMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/whatsapp/simulate/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageText: text, currentSession: session }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro na simulação");
      const botMsg: SimMessage = { id: `b-${Date.now()}`, role: "bot", text: json.data?.reply ?? "…" };
      setMessages((prev) => [...prev, botMsg]);
      if (json.data?.session) setSession(json.data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setMessages([]);
    setSession(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <MasterSimuladorSection />

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Simular uma conversa</h3>
        <div className="space-y-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <strong>Modo simulação</strong> — nenhuma mensagem real é enviada, nenhum pedido é criado.
          Teste como o agente responderia a diferentes situações.
        </div>

      {/* WA-style chat window */}
      <div className="rounded-2xl bg-[#e5ddd5] min-h-[280px] max-h-[400px] overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-xs text-gray-400 pt-8">
            Digite uma mensagem abaixo para simular uma conversa no WhatsApp.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "customer" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm whitespace-pre-wrap ${
                m.role === "customer"
                  ? "rounded-tr-none bg-[#dcf8c6] text-gray-800"
                  : "rounded-tl-none bg-white text-gray-800"
              }`}
            >
              {m.role === "bot" && (
                <p className="mb-0.5 text-[10px] font-semibold text-[#075e54]">WhatsApp Agent</p>
              )}
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-none bg-white px-3 py-2 text-xs text-gray-400 shadow-sm">
              Simulando…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="text-xs text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Digite uma mensagem…"
          disabled={loading}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Enviar
        </button>
        {messages.length > 0 && (
          <button
            onClick={reset}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Reiniciar
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {[
          "Olá", "Quero fazer um pedido", "Qual é o cardápio?", "Cadê meu pedido?", "Preciso falar com um atendente",
        ].map((q) => (
          <button
            key={q}
            onClick={() => { setInput(q); }}
            className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
        </div>{/* /space-y-4 */}
      </div>{/* /chat section */}
    </div>
  );
}

// ── Tab 5: Saúde do WhatsApp ──────────────────────────────────────────────────

function SaudeTab() {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/whatsapp/learning/health?period=24h")
      .then((r) => r.json())
      .then((j) => setSnap(j?.data?.snapshot ?? null))
      .catch(() => setError("Não foi possível carregar a saúde do WhatsApp."));
  }, []);

  if (error) return <Empty>{error}</Empty>;
  if (!snap) return <Empty>Carregando…</Empty>;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Clientes atendidos (24h)"  value={String(snap.conversations)} />
        <Metric label="Pedidos gerados"            value={String(snap.ordersGenerated)} />
        <Metric label="Receita gerada"             value={moneyBR(snap.revenue)} />
        <Metric label="Conversa → pedido"          value={`${Math.round(snap.conversationToOrderRate * 100)}%`} />
        <Metric label="Transferências humanas"     value={String(snap.handoffs)} />
        <Metric label="Conversas abandonadas"      value={String(snap.abandonos)} />
        <Metric label="Aprendizados pendentes"     value={String(snap.pendingLearnings)} />
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-gray-700">Erros detectados nas últimas 24h</h3>
      {snap.topErrors.length === 0 ? (
        <Empty>Nenhum erro detectado nas últimas 24h 🎉</Empty>
      ) : (
        <ul className="space-y-1">
          {snap.topErrors.map((e) => (
            <li key={e.category} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2 text-sm">
              <span className="text-gray-700">{e.label}</span>
              <span className="font-semibold text-red-600">{e.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Tab 6: Configurações ──────────────────────────────────────────────────────

function ConfiguracoesTab() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/whatsapp-agent")
      .then((r) => r.json())
      .then((j) => setConfig(j?.data ?? null))
      .catch(() => setError("Não foi possível carregar as configurações."));
  }, []);

  if (error) return <Empty>{error}</Empty>;
  if (!config) return <Empty>Carregando…</Empty>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Configuração atual do WhatsApp</h2>
        <dl className="space-y-3 text-sm">
          <ConfigRow label="Nome do agente">
            {config.agentName || <span className="text-gray-400">Não configurado</span>}
          </ConfigRow>
          <ConfigRow label="Modo de operação">
            {config.agentMode === "RECEPTIONIST_ONLY"
              ? "Recepcionista automático"
              : config.agentMode === "HUMAN_ASSISTED"
              ? "Com suporte humano"
              : config.agentMode ?? <span className="text-gray-400">Padrão</span>}
          </ConfigRow>
          <ConfigRow label="Telefone de transferência">
            {config.handoffPhone
              ? <span className="font-mono text-xs">{config.handoffPhone}</span>
              : <span className="text-gray-400">Não configurado</span>}
          </ConfigRow>
          <ConfigRow label="Link do cardápio">
            {config.menuUrl
              ? <a href={config.menuUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline text-xs">{config.menuUrl}</a>
              : <span className="text-gray-400">Não configurado</span>}
          </ConfigRow>
        </dl>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Para editar as configurações do agente, acesse{" "}
        <Link href="/agente-ia" className="text-brand-600 hover:underline">
          Agentes IA → WhatsApp Host
        </Link>.
      </p>
    </div>
  );
}

// ── Tab 7: Modo avançado ──────────────────────────────────────────────────────

function ModoAvancadoTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-semibold text-amber-800">Área técnica</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Estas ferramentas são para equipe técnica e administradores. Modificações aqui podem
          afetar o comportamento do agente em produção.
        </p>
      </div>

      <ul className="space-y-2">
        {MODO_AVANCADO_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 hover:border-gray-300 transition-colors group"
            >
              <span className="mt-0.5 text-gray-400 group-hover:text-gray-600">→</span>
              <div>
                <p className="text-sm font-medium text-gray-900">{link.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{link.desc}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── shared presentational helpers ─────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
        active ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </div>
  );
}

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className="text-gray-900 text-right">{children}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
      {children}
    </div>
  );
}
