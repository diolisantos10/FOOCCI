"use client";

import { useState } from "react";
import type { OverviewStats } from "@/services/crm/CRMService";
import { KPICard } from "./OverviewTab";

/**
 * Saúde da base de contatos — lives in the Clientes tab.
 *
 * Shows who is reachable (WhatsApp / e-mail) and how many customers Foocci
 * actually won. Uncontactable "useless" leads are pruned perpetually by the
 * runner's auto-cleanup, so no manual card/button is shown here.
 *
 * "Ativar base": customers that HAVE a phone + haven't opted out but are sitting
 * off (crmContactable=false — the imported base) can be turned on for WhatsApp in
 * one action. That is what gives a "avisar 100% da base" campaign an audience.
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
    | "activatableCustomers"
  >;
  loading?: boolean;
}) {
  const activatable = stats.activatableCustomers ?? 0;

  type Phase = "idle" | "working" | "done" | "error";
  const [phase, setPhase]       = useState<Phase>("idle");
  const [activated, setActivated] = useState(0);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  async function handleActivate() {
    if (activatable <= 0) return;
    const okConfirm = window.confirm(
      `Ativar ${activatable.toLocaleString("pt-BR")} cliente(s) para WhatsApp?\n\n` +
      `Isso liga apenas quem TEM telefone e NÃO pediu opt-out. Nenhuma mensagem é ` +
      `enviada agora — os clientes passam a entrar nas campanhas, respeitando todas ` +
      `as regras de segurança (horário, limites, 1x por campanha).`,
    );
    if (!okConfirm) return;
    setPhase("working");
    setErrorMsg(null);
    try {
      const res  = await fetch("/api/crm/customers/activate-contactable", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ dryRun: false }),
      });
      const json = await res.json() as { data?: { activated: number }; error?: string };
      if (!res.ok || !json.data) {
        setErrorMsg("Não foi possível ativar agora. Tente novamente.");
        setPhase("error");
        return;
      }
      setActivated(json.data.activated);
      setPhase("done");
    } catch {
      setErrorMsg("Falha de rede. Tente novamente.");
      setPhase("error");
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

      {/* Ativar base — só aparece quando há quem ativar */}
      {!loading && activatable > 0 && phase !== "done" && (
        <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">
                {activatable.toLocaleString("pt-BR")} cliente{activatable !== 1 ? "s" : ""} com telefone,
                mas desligado{activatable !== 1 ? "s" : ""} para WhatsApp
              </p>
              <p className="mt-0.5 text-xs text-ink2">
                É a base importada que ainda não entra em campanha. Ative para que passe
                a receber (ex.: o aviso do almoço). Nenhuma mensagem sai agora — os envios
                seguem respeitando horário, limites e 1× por campanha.
              </p>
              <p className="mt-1 text-[11px] text-amber-700">
                ⚠️ Avise apenas quem consentiu. Ativar contatos importados sem opt-in pode
                gerar bloqueio no WhatsApp / questões de LGPD — a responsabilidade é sua.
              </p>
            </div>
            <button
              onClick={handleActivate}
              disabled={phase === "working"}
              className="shrink-0 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {phase === "working" ? "Ativando…" : `Ativar ${activatable.toLocaleString("pt-BR")} para WhatsApp`}
            </button>
          </div>
          {phase === "error" && errorMsg && (
            <p className="mt-2 text-xs font-semibold text-red-600">{errorMsg}</p>
          )}
        </div>
      )}

      {phase === "done" && (
        <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">
            ✓ {activated.toLocaleString("pt-BR")} cliente{activated !== 1 ? "s" : ""} ativado{activated !== 1 ? "s" : ""} para WhatsApp.
          </p>
          <p className="mt-0.5 text-xs text-green-700">
            Recarregue a página para atualizar os números. A campanha já passa a
            enxergar essa audiência no próximo ciclo.
          </p>
        </div>
      )}
    </div>
  );
}
