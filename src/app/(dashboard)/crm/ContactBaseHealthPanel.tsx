"use client";

import type { OverviewStats } from "@/services/crm/CRMService";
import { KPICard } from "./OverviewTab";

/**
 * Saúde da base de contatos — lives in the Clientes tab.
 *
 * Shows who is reachable (WhatsApp / e-mail) and how many customers Foocci
 * actually won. Uncontactable "useless" leads are pruned perpetually by the
 * runner's auto-cleanup, so no manual card/button is shown here.
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

  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">Saúde da base de contatos</h3>
        <span className="text-[11px] text-ink2">
          Base total: {stats.totalCustomers.toLocaleString("pt-BR")}
        </span>
      </div>
      {/* "Sem contato (inúteis)" removido: a limpeza automática já apaga leads sem
          telefone válido perpetuamente, então o card + botão só eram ruído. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          label="Conquistados pelo Foocci"
          value={stats.foocciAcquiredCustomers.toLocaleString("pt-BR")}
          sub="Fizeram pedido real pelo app/cardápio (fora da base importada)"
          accent="brand"
          loading={loading}
        />
      </div>
    </div>
  );
}
