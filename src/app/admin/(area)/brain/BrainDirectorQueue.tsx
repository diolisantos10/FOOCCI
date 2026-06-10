"use client";

/**
 * BrainDirectorQueue — the operational queue of the Brain Director.
 * Lists pending change requests with risk/impact and human decision buttons.
 * Approving NEVER applies a change — the fixed note makes that explicit.
 */

import { useCallback, useEffect, useState } from "react";

const BASE = "/api/admin/brain/change-requests";

interface RequestRow {
  id: string; requestedByType: string; target: string; summary: string; rationale: string;
  riskLevel: string; status: string; requiresQualityGate: boolean; runtimeImpact: string;
  reviewedBy: string | null; decisionReason: string | null; createdAt: string;
}
interface QueueData {
  pendingCount: number; highRiskCount: number; productionImpactCount: number; decidedCount: number;
  latestRequests: RequestRow[];
}

const TARGET_LABELS: Record<string, string> = {
  REASONING_RULE: "Regra de raciocínio", KNOWLEDGE_SCHEMA: "Esquema de conhecimento",
  AGENT_POLICY: "Política de agente", QUALITY_GATE: "Quality Gate", TRAINING_RULE: "Regra de treinamento",
  AI_ENGINE_ROUTING: "Roteamento de motor de IA", KNOWLEDGE_BASE: "Base de conhecimento",
  SIMULATION_RULE: "Regra de simulação", EVIDENCE_RULE: "Regra de evidência",
};
const RISK_LABELS: Record<string, string> = { LOW: "Baixo", MEDIUM: "Médio", HIGH: "Alto", CRITICAL: "Crítico" };
const IMPACT_LABELS: Record<string, string> = { NONE: "Sem impacto em produção", TEST_VERSION_ONLY: "Só versão de teste", PRODUCTION: "Produção" };
const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: "Aguardando decisão", APPROVED: "Aprovada", REJECTED: "Rejeitada",
  BACKLOG: "Guardada", APPLIED: "Aplicada", ROLLED_BACK: "Revertida", DRAFT: "Rascunho",
};

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const map: Record<string, string> = {
    green: "bg-green-100 text-green-800", gray: "bg-gray-100 text-gray-700",
    amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${map[tone] ?? map.gray}`}>{children}</span>;
}
const riskTone = (r: string) => (r === "CRITICAL" ? "red" : r === "HIGH" ? "red" : r === "MEDIUM" ? "amber" : "gray");
const statusTone = (s: string) => (s === "APPROVED" || s === "APPLIED" ? "green" : s === "REJECTED" || s === "ROLLED_BACK" ? "red" : s === "BACKLOG" ? "violet" : "amber");

export function BrainDirectorQueue() {
  const [data, setData] = useState<QueueData | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(BASE).then((r) => r.json()).catch(() => ({ ok: false }));
    if (res.ok) setData(res);
    else if (res.error) setMsg(res.error);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = useCallback(async (id: string, action: string) => {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reviewedBy: "admin" }),
    }).then((r) => r.json()).catch(() => ({ ok: false }));
    if (!res.ok) setMsg(res.error ?? "Falha.");
    await load();
  }, [load]);

  const pending = data?.latestRequests.filter((r) => r.status === "PENDING_APPROVAL") ?? [];
  const decided = data?.latestRequests.filter((r) => r.status !== "PENDING_APPROVAL").slice(0, 6) ?? [];

  return (
    <section className="rounded-xl border-2 border-indigo-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">🛡️ Brain Director — Solicitações de mudança</h2>
      <p className="mt-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[11px] text-blue-800">
        ℹ️ Aprovar uma mudança no Brain <strong>não altera produção automaticamente</strong>. Mudanças reais precisam de
        versão de teste, Quality Gate e ativação humana.
      </p>
      {data && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Pendentes", value: data.pendingCount, tone: data.pendingCount > 0 ? "amber" : "gray" },
            { label: "Alto risco", value: data.highRiskCount, tone: data.highRiskCount > 0 ? "red" : "gray" },
            { label: "Impacto produção", value: data.productionImpactCount, tone: data.productionImpactCount > 0 ? "red" : "gray" },
            { label: "Decididas", value: data.decidedCount, tone: "green" },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-gray-100 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">{k.label}</p>
              <p className="mt-0.5"><Pill tone={k.tone}>{String(k.value)}</Pill></p>
            </div>
          ))}
        </div>
      )}
      {msg && <p className="mt-2 text-[11px] text-red-600">{msg}</p>}

      <div className="mt-3 space-y-2">
        {pending.length === 0 && <p className="text-[12px] text-gray-500">Nenhuma solicitação pendente. O Brain está estável.</p>}
        {pending.map((r) => (
          <div key={r.id} className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-gray-900">{r.summary}</span>
              <Pill tone="blue">{TARGET_LABELS[r.target] ?? r.target}</Pill>
              <Pill tone={riskTone(r.riskLevel)}>Risco: {RISK_LABELS[r.riskLevel] ?? r.riskLevel}</Pill>
              <Pill tone={r.runtimeImpact === "PRODUCTION" ? "red" : "gray"}>{IMPACT_LABELS[r.runtimeImpact] ?? r.runtimeImpact}</Pill>
              {r.requiresQualityGate && <Pill tone="violet">Exige Quality Gate</Pill>}
            </div>
            <p className="mt-1 text-[11px] text-gray-600">{r.rationale}</p>
            <p className="mt-0.5 text-[10px] text-gray-400">Solicitado por: {r.requestedByType} · {new Date(r.createdAt).toLocaleString("pt-BR")}</p>
            <div className="mt-2 flex gap-1.5">
              <button type="button" onClick={() => void decide(r.id, "approve")}
                className="rounded border border-green-300 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-50">Aprovar</button>
              <button type="button" onClick={() => void decide(r.id, "reject")}
                className="rounded border border-red-300 px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50">Rejeitar</button>
              <button type="button" onClick={() => void decide(r.id, "backlog")}
                className="rounded border border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-100">Backlog</button>
            </div>
          </div>
        ))}
      </div>

      {decided.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-semibold text-gray-400">Últimas decisões</summary>
          <div className="mt-1.5 space-y-1">
            {decided.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded border border-gray-100 px-2 py-1 text-[11px]">
                <Pill tone={statusTone(r.status)}>{STATUS_LABELS[r.status] ?? r.status}</Pill>
                <span className="text-gray-700">{r.summary}</span>
                {r.reviewedBy && <span className="text-gray-400">por {r.reviewedBy}</span>}
                {r.decisionReason && <span className="text-gray-400">— {r.decisionReason}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
