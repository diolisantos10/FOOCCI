"use client";

import { useState } from "react";
import type { OverviewStats } from "@/services/crm/CRMService";
import { KPICard } from "./OverviewTab";

/**
 * Saúde da base de contatos — lives in the Clientes tab.
 *
 * Shows who is reachable (WhatsApp / e-mail), who is "useless" (no contact at all),
 * and how many customers Foocci actually won. Includes the permanent cleanup of
 * uncontactable contacts (server preserves any that have order history).
 */
export function ContactBaseHealthPanel({
  stats,
  loading,
}: {
  stats: Pick<
    OverviewStats,
    | "totalCustomers"
    | "contactableCustomers"
    | "withEmailCustomers"
    | "uncontactableCustomers"
    | "foocciAcquiredCustomers"
  >;
  loading?: boolean;
}) {
  const [cleanupBusy, setCleanupBusy] = useState(false);

  async function handleCleanupUncontactable() {
    const n = stats.uncontactableCustomers;
    if (n <= 0 || cleanupBusy) return;
    const confirmed = window.confirm(
      `Apagar permanentemente ${n.toLocaleString("pt-BR")} contato(s) sem telefone e sem e-mail?\n\n` +
        `Esta ação NÃO pode ser desfeita. Contatos que tenham algum pedido no histórico são preservados automaticamente.`,
    );
    if (!confirmed) return;
    setCleanupBusy(true);
    try {
      const res = await fetch("/api/crm/cleanup-uncontactable", { method: "POST" });
      const json = (await res.json()) as {
        data?: { deleted: number; skippedWithHistory: number };
        error?: string;
      };
      if (!res.ok || !json.data) {
        window.alert(json.error ?? "Não foi possível remover os contatos agora. Tente novamente.");
        return;
      }
      const { deleted, skippedWithHistory } = json.data;
      window.alert(
        `${deleted.toLocaleString("pt-BR")} contato(s) removido(s).` +
          (skippedWithHistory > 0
            ? `\n${skippedWithHistory.toLocaleString("pt-BR")} preservado(s) por terem histórico de pedido.`
            : ""),
      );
      window.location.reload();
    } catch {
      window.alert("Erro de conexão. Tente novamente.");
    } finally {
      setCleanupBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">Saúde da base de contatos</h3>
        <span className="text-[11px] text-ink2">
          Base total: {stats.totalCustomers.toLocaleString("pt-BR")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard
          label="Contactáveis (WhatsApp)"
          value={stats.contactableCustomers.toLocaleString("pt-BR")}
          pct={stats.totalCustomers > 0 ? Math.round((stats.contactableCustomers / stats.totalCustomers) * 100) : 0}
          sub="Têm telefone válido para campanha"
          accent="green"
          loading={loading}
        />
        <KPICard
          label="Com e-mail"
          value={stats.withEmailCustomers.toLocaleString("pt-BR")}
          sub="Canal alternativo de contato"
          accent="blue"
          loading={loading}
        />
        <KPICard
          label="Sem contato (inúteis)"
          value={stats.uncontactableCustomers.toLocaleString("pt-BR")}
          pct={stats.totalCustomers > 0 ? Math.round((stats.uncontactableCustomers / stats.totalCustomers) * 100) : 0}
          sub="Sem telefone e sem e-mail — vindos de marketplace"
          accent="gray"
          loading={loading}
        />
        <KPICard
          label="Conquistados pelo Foocci"
          value={stats.foocciAcquiredCustomers.toLocaleString("pt-BR")}
          sub="Fizeram pedido real pelo app/cardápio (fora da base importada)"
          accent="brand"
          loading={loading}
        />
      </div>
      {!loading && stats.uncontactableCustomers > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <span className="text-[11px] text-ink2">
            {stats.uncontactableCustomers.toLocaleString("pt-BR")} contato(s) sem telefone e sem e-mail — não dá pra trabalhar no CRM.
          </span>
          <button
            onClick={handleCleanupUncontactable}
            disabled={cleanupBusy}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {cleanupBusy ? "Removendo…" : "Apagar inúteis"}
          </button>
        </div>
      )}
    </div>
  );
}
