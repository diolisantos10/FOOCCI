"use client";

/**
 * Caixa Única de Aprovação — the unified approval inbox (Phase 1).
 * Reads /api/admin/training/inbox (all pending approvals across every source) and
 * lets the owner approve/reject in ONE place, with per-agent "salas" (filter).
 */

import { useState, useEffect, useCallback } from "react";

type AgentKey = "whatsapp" | "waiter" | "crm" | "analytics" | "outro";

interface ApprovalItem {
  id: string;
  sourceLabel: string;
  agentKey: AgentKey;
  agentLabel: string;
  title: string;
  problem: string;
  recommendation: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  createdAt: string;
}
interface InboxResult {
  items: ApprovalItem[];
  countsByAgent: Record<AgentKey, number>;
  total: number;
}

const SALAS: Array<{ key: AgentKey | "todos"; label: string; emoji: string }> = [
  { key: "todos", label: "Todos", emoji: "📥" },
  { key: "whatsapp", label: "WhatsApp", emoji: "💬" },
  { key: "waiter", label: "Garçom", emoji: "🍽️" },
  { key: "crm", label: "CRM", emoji: "📣" },
  { key: "analytics", label: "Analytics", emoji: "📊" },
];

const RISK_TONE: Record<string, string> = {
  HIGH: "bg-red-900/40 text-red-300 border-red-700/40",
  MEDIUM: "bg-amber-900/40 text-amber-300 border-amber-700/40",
  LOW: "bg-gray-800 text-gray-400 border-gray-700",
};

export function UnifiedInboxTab() {
  const [sala, setSala] = useState<AgentKey | "todos">("todos");
  const [data, setData] = useState<InboxResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = sala === "todos" ? "" : `?agent=${sala}`;
    const res = await fetch(`/api/admin/training/inbox${qs}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [sala]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: string, decision: "APPROVE" | "REJECT") => {
    setActing(id);
    await fetch("/api/admin/training/inbox/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision }),
    }).catch(() => {});
    setActing(null);
    void load();
  };

  const counts = data?.countsByAgent;

  return (
    <div className="space-y-4 p-6">
      {/* Intro */}
      <div className="rounded-xl border border-violet-800/40 bg-violet-950/30 px-4 py-3">
        <p className="text-sm font-semibold text-violet-200">📥 Caixa Única de Aprovação</p>
        <p className="mt-0.5 text-xs text-violet-300/70">
          Todas as melhorias sugeridas pelos treinadores, num lugar só. Aprove ou descarte — nada vai para
          produção sem você.
        </p>
      </div>

      {/* Salas (per-agent filter) */}
      <div className="flex flex-wrap gap-2">
        {SALAS.map((s) => {
          const n = s.key === "todos" ? data?.total ?? 0 : counts?.[s.key] ?? 0;
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
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-10 text-center">
          <p className="text-2xl">✅</p>
          <p className="mt-1 text-sm text-gray-400">Nada para aprovar aqui. Tudo em dia!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((it) => (
            <div key={it.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-gray-300">
                  {it.agentLabel}
                </span>
                <span className="rounded-full bg-gray-800/60 px-2 py-0.5 text-[11px] text-gray-400">
                  {it.sourceLabel}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RISK_TONE[it.riskLevel] ?? RISK_TONE.LOW}`}>
                  risco {it.riskLevel}
                </span>
              </div>
              <p className="text-sm font-semibold text-white">{it.title}</p>
              <p className="mt-1 text-xs text-gray-400">
                <b className="text-gray-300">Problema:</b> {it.problem}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                <b className="text-gray-300">Sugestão:</b> {it.recommendation}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={acting === it.id}
                  onClick={() => decide(it.id, "APPROVE")}
                  className="rounded-lg bg-green-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50"
                >
                  {acting === it.id ? "…" : "✓ Aprovar"}
                </button>
                <button
                  disabled={acting === it.id}
                  onClick={() => decide(it.id, "REJECT")}
                  className="rounded-lg border border-gray-700 px-4 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                >
                  ✕ Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
