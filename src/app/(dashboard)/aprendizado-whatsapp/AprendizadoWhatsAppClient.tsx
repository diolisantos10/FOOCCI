"use client";

/**
 * Central de Aprendizado WhatsApp — gestor-facing, business-language view of the
 * WhatsApp sales agent. Three tabs:
 *   1. Conversas de hoje  — recent conversations + outcome (masked).
 *   2. Aprendizados pendentes — error/opportunity cards to approve/reject/keep.
 *   3. Saúde do WhatsApp  — health metrics (conversas, pedidos, receita, erros).
 *
 * Technical terms are hidden inside a "Detalhes técnicos" collapse; the main copy
 * stays in plain business language. This screen never sends WhatsApp and never
 * creates orders/Pix — it only reads conversations and manages the learning queue.
 */

import { useCallback, useEffect, useState } from "react";

type Tab = "conversas" | "aprendizados" | "saude";

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

const OUTCOME_TONE: Record<string, string> = {
  VENDA_CONCLUIDA: "bg-green-100 text-green-800",
  ATENDENTE_ASSUMIU: "bg-blue-100 text-blue-800",
  OK_SEM_ACAO: "bg-gray-100 text-gray-700",
};
function outcomeTone(o: string): string {
  if (OUTCOME_TONE[o]) return OUTCOME_TONE[o];
  if (o.startsWith("ERRO") || o === "LOOP") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800"; // abandono / oportunidade / pergunta
}
const SEVERITY_TONE: Record<string, string> = {
  P0: "bg-red-100 text-red-800",
  P1: "bg-amber-100 text-amber-800",
  P2: "bg-gray-100 text-gray-700",
};

const moneyBR = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function AprendizadoWhatsAppClient() {
  const [tab, setTab] = useState<Tab>("aprendizados");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <p className="text-sm text-gray-500 mb-4">
        Erros e oportunidades encontrados nas conversas reais. Aprove o que o agente deve aprender.
      </p>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <TabButton active={tab === "conversas"} onClick={() => setTab("conversas")}>Conversas de hoje</TabButton>
        <TabButton active={tab === "aprendizados"} onClick={() => setTab("aprendizados")}>Aprendizados pendentes</TabButton>
        <TabButton active={tab === "saude"} onClick={() => setTab("saude")}>Saúde do WhatsApp</TabButton>
      </div>

      {tab === "conversas" && <ConversasTab />}
      {tab === "aprendizados" && <AprendizadosTab />}
      {tab === "saude" && <SaudeTab />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
        active ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

// ── Tab 1: Conversas de hoje ──────────────────────────────────────────────────
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
          {it.issueCount > 0 && (
            <span className="text-xs text-red-600">{it.issueCount} ponto(s) de aprendizado</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tab 2: Aprendizados pendentes ─────────────────────────────────────────────
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
      setCards((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
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
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_TONE[c.severity]}`}>{c.severity}</span>
            <h3 className="text-base font-semibold text-gray-900">{c.title}</h3>
            {c.occurrences > 1 && (
              <span className="ml-auto text-xs text-gray-500">{c.occurrences} conversas</span>
            )}
          </div>

          <dl className="space-y-2 text-sm">
            <Row label="Situação">{c.situationSummary}</Row>
            <Row label="O que o cliente queria">{c.customerWanted}</Row>
            <Row label="O que a IA respondeu">{c.agentAnswered}</Row>
            <Row label="Qual foi o erro">{c.problem}</Row>
            <Row label="Resposta ideal"><span className="text-emerald-700">{c.idealAnswer}</span></Row>
            <Row label="Aprendizado sugerido">{c.learningRule}</Row>
            <Row label="Impacto na venda">{c.salesImpact}</Row>
          </dl>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-gray-400">Detalhes técnicos</summary>
            <pre className="mt-1 overflow-auto rounded bg-gray-50 p-2 text-[11px] text-gray-500">
              {JSON.stringify(c.technicalDetails, null, 2)}
            </pre>
          </details>

          <div className="mt-4 flex gap-2">
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
        </div>
      ))}

      <p className="pt-2 text-xs text-gray-400">
        Aprovar significa: este aprendizado entra na base de treinamento do WhatsApp Agent e será usado na
        próxima rodada de melhoria. Não altera a produção automaticamente.
      </p>
    </div>
  );
}

// ── Tab 3: Saúde do WhatsApp ──────────────────────────────────────────────────
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
        <Metric label="Conversas (24h)" value={String(snap.conversations)} />
        <Metric label="Pedidos gerados" value={String(snap.ordersGenerated)} />
        <Metric label="Receita" value={moneyBR(snap.revenue)} />
        <Metric label="Conversa → pedido" value={`${Math.round(snap.conversationToOrderRate * 100)}%`} />
        <Metric label="Atendentes acionados" value={String(snap.handoffs)} />
        <Metric label="Abandonos" value={String(snap.abandonos)} />
        <Metric label="Aprendizados pendentes" value={String(snap.pendingLearnings)} />
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-gray-700">Top erros detectados</h3>
      {snap.topErrors.length === 0 ? (
        <Empty>Nenhum erro detectado nas últimas 24h 🎉</Empty>
      ) : (
        <ul className="space-y-1">
          {snap.topErrors.map((e) => (
            <li key={e.category} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2 text-sm">
              <span>{e.label}</span>
              <span className="font-semibold text-red-600">{e.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── small presentational helpers ──────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
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
  return <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">{children}</div>;
}
