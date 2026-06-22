"use client";

/**
 * Admin → Agentes → CRM → Autonomia.
 *
 * Operator control panel for the Weekly Strategist: per restaurant, set the
 * autonomy mode (co-piloto / autopilot) and the guardrails, see the latest plan
 * status, and trigger a plan on demand. Cross-tenant; ADMIN_SECRET-gated by the
 * (area) layout + the /api/admin/crm/autonomy route.
 */

import { useCallback, useEffect, useState } from "react";

type Mode = "COPILOT" | "AUTOPILOT";
type Priority = "HIGH" | "MEDIUM" | "LOW";

interface Config {
  autoApproveMinPriority: Priority;
  weeklySendBudget: number;
  maxAudiencePerCampaign: number;
}

interface Row {
  restaurantId: string;
  name: string;
  slug: string;
  mode: Mode;
  config: Config;
  latestPlan: { weekStart: string; status: string; summary: { totalItems?: number; autoApproved?: number } | null } | null;
}

const PLAN_STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Aguardando aprovação",
  PARTIALLY_APPROVED: "Parcialmente aprovado",
  APPROVED: "Aprovado",
  EXECUTED: "Executado",
  REJECTED: "Rejeitado",
  EXPIRED: "Expirado",
};

export default function CrmAutonomyAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/crm/autonomy");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Falha ao carregar.");
      setRows(json.restaurants);
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patchRow(id: string, patch: Partial<Row> | { config: Partial<Config> }) {
    setRows((rs) =>
      rs.map((r) =>
        r.restaurantId === id
          ? { ...r, ...patch, config: { ...r.config, ...("config" in patch ? patch.config : {}) } }
          : r,
      ),
    );
  }

  async function save(row: Row) {
    setBusyId(row.restaurantId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/crm/autonomy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: row.restaurantId, mode: row.mode, config: row.config }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Falha ao salvar.");
      setMsg(`✓ ${row.name}: configuração salva.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusyId(null);
    }
  }

  async function generate(row: Row) {
    setBusyId(row.restaurantId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/crm/autonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: row.restaurantId, action: "generate", force: true }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Falha ao gerar.");
      setMsg(`✓ ${row.name}: plano gerado (${json.totalItems} item(ns), ${json.autoExecuted} executado(s)).`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 text-gray-200">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">CRM · Autonomia do Estrategista Semanal</h1>
        <button onClick={() => void load()} className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs hover:bg-gray-800">
          Recarregar
        </button>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-gray-400">
        Defina, por restaurante, como o agente decide o plano semanal. <b>Co-piloto</b> propõe e espera aprovação;
        <b> Autopilot</b> aprova e dispara sozinho dentro dos limites. Orçamento/teto = 0 significa sem limite extra.
      </p>

      {msg && <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-2 text-sm">{msg}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">Carregando…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-800/60 text-[11px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-3 py-2">Restaurante</th>
                <th className="px-3 py-2">Modo</th>
                <th className="px-3 py-2">Auto-aprova ≥</th>
                <th className="px-3 py-2">Orçam./sem.</th>
                <th className="px-3 py-2">Teto/camp.</th>
                <th className="px-3 py-2">Último plano</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((row) => (
                <tr key={row.restaurantId} className="hover:bg-gray-800/30">
                  <td className="px-3 py-2 font-medium text-white">{row.name}</td>
                  <td className="px-3 py-2">
                    <select
                      value={row.mode}
                      onChange={(e) => patchRow(row.restaurantId, { mode: e.target.value as Mode })}
                      className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-xs"
                    >
                      <option value="COPILOT">🧑‍✈️ Co-piloto</option>
                      <option value="AUTOPILOT">🤖 Autopilot</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.config.autoApproveMinPriority}
                      onChange={(e) => patchRow(row.restaurantId, { config: { autoApproveMinPriority: e.target.value as Priority } })}
                      className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-xs disabled:opacity-40"
                      disabled={row.mode !== "AUTOPILOT"}
                    >
                      <option value="HIGH">Alta</option>
                      <option value="MEDIUM">Média</option>
                      <option value="LOW">Baixa</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={row.config.weeklySendBudget}
                      onChange={(e) => patchRow(row.restaurantId, { config: { weeklySendBudget: Math.max(0, Number(e.target.value)) } })}
                      className="w-20 rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={row.config.maxAudiencePerCampaign}
                      onChange={(e) => patchRow(row.restaurantId, { config: { maxAudiencePerCampaign: Math.max(0, Number(e.target.value)) } })}
                      className="w-20 rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">
                    {row.latestPlan
                      ? `${PLAN_STATUS_LABEL[row.latestPlan.status] ?? row.latestPlan.status}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <button
                        disabled={busyId === row.restaurantId}
                        onClick={() => void save(row)}
                        className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
                      >
                        Salvar
                      </button>
                      <button
                        disabled={busyId === row.restaurantId}
                        onClick={() => void generate(row)}
                        className="rounded-md border border-gray-600 px-2.5 py-1 text-xs hover:bg-gray-800 disabled:opacity-40"
                      >
                        Gerar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500">Nenhum restaurante.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
