"use client";

/**
 * Caixa Única de Aprovação — the unified approval inbox, now backed by the
 * Brain aggregator (7 queues): GET /api/admin/brain/inbox lists every pending
 * approval (Brain change requests, WhatsApp learnings, waiter training,
 * improvement proposals, simulation lab examples/opportunities, knowledge base)
 * and POST /api/admin/brain/inbox/decision routes the human decision back to
 * the right table. The "sala" (per-agent filter) is derived from the item's
 * source + agentSlug. Every decision records a real HUMAN reviewer name
 * (persisted in localStorage) — generic names are refused by the backend.
 */

import { useState, useEffect, useCallback } from "react";

/** Same key used by the BrainDirectorQueue — one identity across the admin. */
const REVIEWER_STORAGE_KEY = "foocci.brain.reviewerName";

type InboxSource =
  | "BRAIN_CHANGE_REQUEST"
  | "WHATSAPP_LEARNING"
  | "WAITER_TRAINING"
  | "AGENT_IMPROVEMENT_PROPOSAL"
  | "SIMULATION_EXAMPLE"
  | "SIMULATION_OPPORTUNITY"
  | "KNOWLEDGE_ITEM";

interface InboxItem {
  source: InboxSource;
  id: string;
  title: string;
  summary: string;
  riskLevel?: string | null;
  createdAt: string;
  conversationId?: string | null;
  agentSlug?: string | null;
}

interface InboxData {
  ok: boolean;
  items: InboxItem[];
  countsBySource: Record<InboxSource, number>;
  totalPending: number;
  duplicatesCollapsed: number;
  error?: string;
}

type SalaKey = "whatsapp" | "waiter" | "crm" | "analytics" | "brain" | "conhecimento" | "outro";

const SALAS: Array<{ key: SalaKey | "todos"; label: string; emoji: string }> = [
  { key: "todos", label: "Todos", emoji: "📥" },
  { key: "whatsapp", label: "WhatsApp", emoji: "💬" },
  { key: "waiter", label: "Garçom", emoji: "🍽️" },
  { key: "crm", label: "CRM", emoji: "📣" },
  { key: "analytics", label: "Analytics", emoji: "📊" },
  { key: "brain", label: "Brain", emoji: "🧠" },
  { key: "conhecimento", label: "Conhecimento", emoji: "📚" },
];

/** Deriva a "sala" (agente) a partir do source + agentSlug do item. */
function deriveSala(item: InboxItem): SalaKey {
  if (item.source === "BRAIN_CHANGE_REQUEST") return "brain";
  if (item.source === "KNOWLEDGE_ITEM") return "conhecimento";
  if (item.source === "WHATSAPP_LEARNING") return "whatsapp";
  const slug = (item.agentSlug ?? "").toUpperCase();
  if (slug.includes("WAITER") || slug.includes("GARC")) return "waiter";
  if (slug.includes("CRM")) return "crm";
  if (slug.includes("ANALY")) return "analytics";
  if (slug.includes("WHATS") || slug.includes("RECEPTION") || slug.startsWith("WA")) return "whatsapp";
  if (
    item.source === "WAITER_TRAINING" ||
    item.source === "SIMULATION_EXAMPLE" ||
    item.source === "SIMULATION_OPPORTUNITY"
  ) {
    return "waiter";
  }
  return "outro";
}

const SALA_LABELS: Record<SalaKey, string> = {
  whatsapp: "WhatsApp",
  waiter: "Garçom",
  crm: "CRM",
  analytics: "Analytics",
  brain: "Brain",
  conhecimento: "Conhecimento",
  outro: "Outro",
};

const SOURCE_LABELS: Record<InboxSource, string> = {
  BRAIN_CHANGE_REQUEST: "Mudança do Brain",
  WHATSAPP_LEARNING: "Aprendizado WhatsApp",
  WAITER_TRAINING: "Sugestão de treino",
  AGENT_IMPROVEMENT_PROPOSAL: "Proposta de melhoria",
  SIMULATION_EXAMPLE: "Exemplo (simulação)",
  SIMULATION_OPPORTUNITY: "Oportunidade (simulação)",
  KNOWLEDGE_ITEM: "Base de conhecimento",
};

/** Colapsa os vocabulários de risco/severidade (CRITICAL, P0, INFO…) em 3 tons. */
function normalizeRisk(raw: string | null | undefined): "HIGH" | "MEDIUM" | "LOW" {
  const u = (raw ?? "").toUpperCase();
  if (u === "HIGH" || u === "CRITICAL" || u === "P0") return "HIGH";
  if (u === "MEDIUM" || u === "P1" || u === "WARN") return "MEDIUM";
  return "LOW";
}

const RISK_TONE: Record<string, string> = {
  HIGH: "bg-red-900/40 text-red-300 border-red-700/40",
  MEDIUM: "bg-amber-900/40 text-amber-300 border-amber-700/40",
  LOW: "bg-gray-800 text-gray-400 border-gray-700",
};
const RISK_LABEL: Record<string, string> = { HIGH: "Alta prioridade", MEDIUM: "Média", LOW: "Baixa" };

export function UnifiedInboxTab() {
  const [sala, setSala] = useState<SalaKey | "todos">("todos");
  const [data, setData] = useState<InboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [msg, setMsg] = useState("");

  // Identidade real do revisor — persistida em localStorage entre visitas.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REVIEWER_STORAGE_KEY);
      if (saved) setReviewer(saved);
    } catch { /* localStorage indisponível — segue sem persistência */ }
  }, []);

  const onReviewerChange = useCallback((value: string) => {
    setReviewer(value);
    try { window.localStorage.setItem(REVIEWER_STORAGE_KEY, value); } catch { /* non-fatal */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/brain/inbox");
      if (res.ok) setData((await res.json()) as InboxData);
    } catch { /* mantém o estado anterior */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (item: InboxItem, decision: "APPROVE" | "REJECT") => {
    const name = reviewer.trim();
    if (!name) {
      setMsg("Informe seu nome antes de decidir — cada decisão registra quem foi o revisor humano.");
      return;
    }
    setMsg("");
    setActing(`${item.source}:${item.id}`);
    try {
      const res = await fetch("/api/admin/brain/inbox/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: item.source, id: item.id, decision, reviewedBy: name }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) setMsg(json.error ?? "Falha ao registrar a decisão.");
    } catch {
      setMsg("Falha de rede ao registrar a decisão.");
    }
    setActing(null);
    void load();
  };

  const items = data?.items ?? [];
  const salaCounts: Record<SalaKey, number> = {
    whatsapp: 0, waiter: 0, crm: 0, analytics: 0, brain: 0, conhecimento: 0, outro: 0,
  };
  for (const it of items) salaCounts[deriveSala(it)] += 1;
  const visible = sala === "todos" ? items : items.filter((it) => deriveSala(it) === sala);

  return (
    <div className="space-y-4 p-6">
      {/* Intro */}
      <div className="rounded-xl border border-violet-800/40 bg-violet-950/30 px-4 py-3">
        <p className="text-sm font-semibold text-violet-200">📥 Caixa Única de Aprovação</p>
        <p className="mt-0.5 text-xs text-violet-300/70">
          Todas as filas de aprovação do ecossistema (Brain, treinadores, simulações, conhecimento), num
          lugar só. Aprove ou descarte — nada vai para produção sem você.
          {typeof data?.totalPending === "number" && (
            <> <b className="text-violet-200">{data.totalPending}</b> pendente(s) no total.</>
          )}
        </p>
      </div>

      {/* Revisor humano */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-2.5">
        <label className="text-[11px] font-semibold text-gray-400" htmlFor="inbox-reviewed-by">Seu nome</label>
        <input
          id="inbox-reviewed-by"
          type="text"
          value={reviewer}
          onChange={(e) => onReviewerChange(e.target.value)}
          placeholder="Seu nome"
          className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200"
        />
        <span className="text-[10px] text-gray-500">
          Cada decisão registra o revisor humano — nomes genéricos (admin/bot) são recusados.
        </span>
      </div>
      {msg && <p className="text-[11px] text-red-400">{msg}</p>}

      {/* Salas (per-agent filter) */}
      <div className="flex flex-wrap gap-2">
        {SALAS.map((s) => {
          const n = s.key === "todos" ? items.length : salaCounts[s.key] ?? 0;
          const active = sala === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSala(s.key)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-violet-500 bg-violet-600 text-white"
                  : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>{s.emoji}</span>
              {s.label}
              <span className={`ml-1 rounded-full px-1.5 ${active ? "bg-violet-800" : "bg-gray-800"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <p className="py-8 text-center text-sm text-gray-500">Carregando…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-10 text-center">
          <p className="text-2xl">✅</p>
          <p className="mt-1 text-sm text-gray-400">Nada para aprovar aqui. Tudo em dia!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((it) => {
            const key = `${it.source}:${it.id}`;
            const risk = normalizeRisk(it.riskLevel);
            const salaKey = deriveSala(it);
            return (
              <div key={key} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                {/* Badges */}
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-gray-300">
                    {SALA_LABELS[salaKey]}
                  </span>
                  <span className="rounded-full bg-violet-900/40 px-2 py-0.5 text-[11px] font-semibold text-violet-300">
                    {SOURCE_LABELS[it.source] ?? it.source}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RISK_TONE[risk]}`}>
                    {RISK_LABEL[risk]}
                  </span>
                  <span className="rounded-full bg-gray-800/60 px-2 py-0.5 text-[11px] text-gray-500">
                    {new Date(it.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>

                {/* Headline */}
                <p className="text-base font-bold text-white">{it.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-300">{it.summary}</p>
                {it.conversationId && (
                  <p className="mt-1 text-[10px] text-gray-500">💬 Conversa de origem: {it.conversationId}</p>
                )}

                {/* CTA */}
                <div className="mt-4 border-t border-gray-800 pt-3">
                  <p className="mb-2 text-[11px] text-gray-500">
                    👉 Ao <b className="text-green-400">aprovar</b>, a sugestão entra na fila governada (nada vai
                    direto para produção). <b className="text-gray-400">Descartar</b> arquiva a sugestão.
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={acting === key}
                      onClick={() => decide(it, "APPROVE")}
                      className="rounded-lg bg-green-700 px-4 py-2 text-xs font-bold text-white hover:bg-green-600 disabled:opacity-50"
                    >
                      {acting === key ? "…" : "✓ Aprovar"}
                    </button>
                    <button
                      disabled={acting === key}
                      onClick={() => decide(it, "REJECT")}
                      className="rounded-lg border border-gray-700 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                    >
                      ✕ Descartar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
