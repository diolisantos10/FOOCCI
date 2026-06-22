"use client";

/**
 * WeeklyPlanTab — the lojista's view of the Weekly Strategist.
 *
 * Shows the plan the CRM agent built for the week (one card per proposed
 * campaign), lets the lojista approve/reject the whole plan or item by item, and
 * switches between COPILOT (propose & wait) and AUTOPILOT (auto-run within limits).
 *
 * Self-contained: fetches /api/crm/weekly-plan and drives all actions itself.
 */

import { useCallback, useEffect, useState } from "react";

// ─── types (mirror the API payload) ──────────────────────────────────────────

interface PlanItem {
  id: string;
  actionType: string;
  title: string;
  rationale: string;
  targetSegment: string;
  messageTemplate: string;
  estimatedAudience: number;
  estimatedRevenue: string | number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "PROPOSED" | "APPROVED" | "EXECUTED" | "REJECTED" | "FAILED" | "SKIPPED";
  campaignId: string | null;
  executionError: string | null;
}

interface Plan {
  id: string;
  weekStart: string;
  status: string;
  autonomyMode: string;
  summary: {
    totalItems?: number;
    totalAudience?: number;
    totalEstimatedRevenue?: number;
    highPriority?: number;
    autoApproved?: number;
  } | null;
  warnings: string[];
  items: PlanItem[];
}

interface Autonomy {
  mode: "COPILOT" | "AUTOPILOT";
  config: { autoApproveMinPriority: string; weeklySendBudget: number; maxAudiencePerCampaign: number };
}

// ─── small helpers ───────────────────────────────────────────────────────────

const BRL = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const SEGMENT_LABEL: Record<string, string> = {
  FRIO: "Clientes frios",
  MORNO: "Clientes mornos",
  VIP: "Clientes VIP",
  ANIVERSARIANTES: "Aniversariantes",
  RECENTE_AVALIACAO: "Pedido recente",
};

const PRIORITY: Record<PlanItem["priority"], { label: string; cls: string }> = {
  HIGH: { label: "Alta", cls: "bg-red-100 text-red-700" },
  MEDIUM: { label: "Média", cls: "bg-amber-100 text-amber-700" },
  LOW: { label: "Baixa", cls: "bg-gray-100 text-gray-600" },
};

const STATUS: Record<PlanItem["status"], { label: string; cls: string }> = {
  PROPOSED: { label: "Proposto", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: { label: "Aprovado", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  EXECUTED: { label: "Campanha ativa", cls: "bg-green-50 text-green-700 border-green-200" },
  REJECTED: { label: "Rejeitado", cls: "bg-gray-50 text-gray-500 border-gray-200" },
  FAILED: { label: "Falhou", cls: "bg-red-50 text-red-700 border-red-200" },
  SKIPPED: { label: "Ignorado", cls: "bg-gray-50 text-gray-500 border-gray-200" },
};

// ─── component ───────────────────────────────────────────────────────────────

export function WeeklyPlanTab() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [autonomy, setAutonomy] = useState<Autonomy | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/weekly-plan");
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Falha ao carregar o plano.");
      setPlan(json.data.plan);
      setAutonomy(json.data.autonomy);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(url: string, init?: RequestInit) {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Ação falhou.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na ação.");
    } finally {
      setBusy(false);
    }
  }

  const generate = (force: boolean) =>
    call("/api/crm/weekly-plan/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });

  const setMode = (mode: "COPILOT" | "AUTOPILOT") =>
    call("/api/crm/weekly-plan/autonomy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });

  const approvePlan = () =>
    plan && call(`/api/crm/weekly-plan/${plan.id}/approve`, { method: "POST" });
  const rejectPlan = () =>
    plan && call(`/api/crm/weekly-plan/${plan.id}/reject`, { method: "POST" });
  const itemAction = (itemId: string, action: "approve" | "reject") =>
    call(`/api/crm/weekly-plan/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Carregando o plano…</div>;

  const proposedCount = plan?.items.filter((i) => i.status === "PROPOSED").length ?? 0;

  return (
    <div className="space-y-5">
      {/* ── Header + autonomy switch ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">🧭 Plano da Semana</h2>
            <p className="mt-1 max-w-xl text-sm text-gray-500">
              Toda semana o agente analisa sua base e monta um plano de campanhas. Você decide
              o que vai ao ar — ou deixa o piloto automático cuidar disso dentro dos seus limites.
            </p>
          </div>

          {autonomy && (
            <div className="flex rounded-xl bg-gray-100 p-1 text-xs font-semibold">
              <button
                disabled={busy}
                onClick={() => setMode("COPILOT")}
                className={`rounded-lg px-3 py-2 transition ${
                  autonomy.mode === "COPILOT" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                }`}
              >
                🧑‍✈️ Co-piloto
              </button>
              <button
                disabled={busy}
                onClick={() => setMode("AUTOPILOT")}
                className={`rounded-lg px-3 py-2 transition ${
                  autonomy.mode === "AUTOPILOT" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                }`}
              >
                🤖 Autopilot
              </button>
            </div>
          )}
        </div>

        {autonomy && (
          <p className="mt-3 text-xs text-gray-400">
            {autonomy.mode === "COPILOT"
              ? "Co-piloto: o agente propõe e espera sua aprovação antes de disparar qualquer campanha."
              : `Autopilot: o agente aprova e dispara sozinho campanhas de prioridade ${
                  autonomy.config.autoApproveMinPriority === "HIGH" ? "alta" : "alta e média"
                }, dentro dos limites — o resto fica para sua aprovação.`}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!plan && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <p className="text-sm text-gray-500">Nenhum plano gerado ainda para esta semana.</p>
          <button
            disabled={busy}
            onClick={() => generate(false)}
            className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Gerando…" : "Gerar plano agora"}
          </button>
        </div>
      )}

      {/* ── Plan ──────────────────────────────────────────────────────────── */}
      {plan && (
        <>
          {/* summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Campanhas propostas" value={String(plan.summary?.totalItems ?? plan.items.length)} />
            <SummaryCard label="Clientes alcançáveis" value={String(plan.summary?.totalAudience ?? 0)} />
            <SummaryCard label="Receita estimada" value={BRL(plan.summary?.totalEstimatedRevenue ?? 0)} />
            <SummaryCard label="Auto-aprovadas" value={String(plan.summary?.autoApproved ?? 0)} />
          </div>

          {plan.warnings?.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <ul className="list-disc space-y-1 pl-4">
                {plan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* plan-level actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-500">
              {proposedCount > 0
                ? `${proposedCount} campanha(s) aguardando sua decisão.`
                : "Tudo decidido para esta semana. ✅"}
            </div>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => generate(true)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Regerar
              </button>
              {proposedCount > 0 && (
                <>
                  <button
                    disabled={busy}
                    onClick={rejectPlan}
                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Rejeitar tudo
                  </button>
                  <button
                    disabled={busy}
                    onClick={approvePlan}
                    className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    Aprovar tudo e ativar
                  </button>
                </>
              )}
            </div>
          </div>

          {/* items */}
          <div className="space-y-3">
            {plan.items.map((item) => (
              <ItemCard key={item.id} item={item} busy={busy} onAction={itemAction} />
            ))}
            {plan.items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                O agente não encontrou oportunidades acionáveis esta semana. Sua base está bem cuidada! 👏
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}

function ItemCard({
  item,
  busy,
  onAction,
}: {
  item: PlanItem;
  busy: boolean;
  onAction: (id: string, action: "approve" | "reject") => void;
}) {
  const status = STATUS[item.status];
  const priority = PRIORITY[item.priority];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">{item.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${priority.cls}`}>{priority.label}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{item.rationale}</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-gray-900">{BRL(item.estimatedRevenue)}</div>
          <div className="text-[11px] text-gray-400">receita estimada</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
        <span>🎯 {SEGMENT_LABEL[item.targetSegment] ?? item.targetSegment}</span>
        <span>👥 {item.estimatedAudience} cliente(s)</span>
      </div>

      <div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-600 whitespace-pre-wrap">
        {item.messageTemplate}
      </div>

      {item.status === "FAILED" && item.executionError && (
        <p className="mt-2 text-xs text-red-600">Erro ao criar campanha: {item.executionError}</p>
      )}

      {item.status === "PROPOSED" && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            disabled={busy}
            onClick={() => onAction(item.id, "reject")}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Dispensar
          </button>
          <button
            disabled={busy}
            onClick={() => onAction(item.id, "approve")}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Aprovar e ativar
          </button>
        </div>
      )}
    </div>
  );
}
