"use client";

import { useEffect, useState } from "react";
import type { MigrationResult, BaseSegment } from "@/services/crm/CrmBaseMigrationService";

const SEG_LABEL: Record<BaseSegment, string> = {
  QUENTE: "Quentes",
  MORNO:  "Mornos",
  FRIO:   "Frios",
  PERDIDO: "Perdidos",
  SEM_PEDIDOS: "Sem pedido",
};

const SEG_STYLE: Record<BaseSegment, { dot: string; text: string; bg: string }> = {
  QUENTE:      { dot: "bg-red-500",    text: "text-red-700",    bg: "bg-red-50" },
  MORNO:       { dot: "bg-amber-500",  text: "text-amber-700",  bg: "bg-amber-50" },
  FRIO:        { dot: "bg-sky-500",    text: "text-sky-700",    bg: "bg-sky-50" },
  PERDIDO:     { dot: "bg-zinc-500",   text: "text-zinc-700",   bg: "bg-zinc-100" },
  SEM_PEDIDOS: { dot: "bg-violet-400", text: "text-violet-700", bg: "bg-violet-50" },
};

/** Recency ladder — higher = closer to buying. Used to tell climbs from drops. */
const RANK: Record<BaseSegment, number> = {
  QUENTE: 4, MORNO: 3, FRIO: 2, PERDIDO: 1, SEM_PEDIDOS: 0,
};

const PERIODS = [
  { days: 7,  label: "7 dias" },
  { days: 14, label: "14 dias" },
  { days: 30, label: "30 dias" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Migração — painel de movimentação da base.
 * Mostra como os clientes migraram entre as faixas (quente/morno/frio/perdido)
 * no período, quem reativou, quem entrou novo e quem saiu por falta de contato.
 * Números reconstruídos ao vivo a partir da data do último pedido de cada cliente.
 */
export function MigracaoTab() {
  const [days, setDays]       = useState(7);
  const [data, setData]       = useState<MigrationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/crm/migration?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json: { data?: MigrationResult }) => setData(json.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  const flows       = data?.flows ?? [];
  const transitions = data?.transitions ?? [];
  const exc         = data?.exclusions;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Migração de base</h2>
          <p className="mt-0.5 text-sm text-muted">
            Como seus clientes se movimentaram entre as faixas no período — quem esfriou, quem reativou e quem saiu da base.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                days === p.days ? "bg-brand-600 text-white" : "bg-[#F4F4F2] text-ink2 hover:bg-line2"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {data && !loading && (
        <p className="text-xs text-muted">
          Janela: <strong className="text-ink2">{fmtDate(data.from)} → {fmtDate(data.to)}</strong>
          {" · "}{data.totalTracked.toLocaleString("pt-BR")} clientes na base
        </p>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-emerald-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Reativações</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">
            {loading ? "…" : (data?.reactivations ?? 0).toLocaleString("pt-BR")}
          </p>
          <p className="text-[10px] text-muted">voltaram a pedir</p>
        </div>
        <div className="rounded-xl bg-violet-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">Novos ativos</p>
          <p className="mt-1 text-2xl font-extrabold text-violet-700">
            {loading ? "…" : (data?.newActive ?? 0).toLocaleString("pt-BR")}
          </p>
          <p className="text-[10px] text-muted">1º pedido no período</p>
        </div>
        <div className="rounded-xl bg-red-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600">Saíram da base</p>
          <p className="mt-1 text-2xl font-extrabold text-red-700">
            {loading ? "…" : (exc?.total ?? 0).toLocaleString("pt-BR")}
          </p>
          <p className="text-[10px] text-muted">excluídos por contato</p>
        </div>
        <div className="rounded-xl bg-sky-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600">Esfriaram</p>
          <p className="mt-1 text-2xl font-extrabold text-sky-700">
            {loading ? "…" : coolingCount(transitions).toLocaleString("pt-BR")}
          </p>
          <p className="text-[10px] text-muted">caíram de faixa</p>
        </div>
      </div>

      {/* Fluxo por faixa */}
      <div className="rounded-2xl border border-line bg-paper shadow-sm">
        <div className="border-b border-line px-4 py-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-brand-600">Saldo por faixa</h3>
          <p className="mt-0.5 text-xs text-muted">Quantos tinha no início vs. agora, e o movimento de entrada e saída.</p>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-[#FAFAF8]">
            <tr className="text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2.5 pl-4 pr-2 font-semibold">Faixa</th>
              <th className="py-2.5 px-2 font-semibold text-right">Início</th>
              <th className="py-2.5 px-2 font-semibold text-right">Agora</th>
              <th className="py-2.5 px-2 font-semibold text-right" title="Entraram nesta faixa vindos de outra">Entraram</th>
              <th className="py-2.5 px-2 font-semibold text-right" title="Saíram desta faixa para outra">Saíram</th>
              <th className="py-2.5 pl-2 pr-4 font-semibold text-right">Líquido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted">Carregando…</td></tr>
            ) : flows.map((f) => {
              const s = SEG_STYLE[f.segment];
              return (
                <tr key={f.segment} className="hover:bg-[#FAFAF8] transition-colors">
                  <td className="py-3 pl-4 pr-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                      {SEG_LABEL[f.segment]}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums text-ink2">{f.before.toLocaleString("pt-BR")}</td>
                  <td className="py-3 px-2 text-right tabular-nums font-semibold text-ink">{f.after.toLocaleString("pt-BR")}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-emerald-600">{f.movedIn > 0 ? `+${f.movedIn}` : "—"}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-red-500">{f.movedOut > 0 ? `−${f.movedOut}` : "—"}</td>
                  <td className="py-3 pl-2 pr-4 text-right tabular-nums font-bold">
                    {f.net === 0
                      ? <span className="text-muted">0</span>
                      : <span className={f.net > 0 ? "text-emerald-700" : "text-red-600"}>{f.net > 0 ? `+${f.net}` : f.net}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Subida × Descida — as duas visões que explicam a efetividade do CRM */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ⬆️ De onde vieram os quentes (recuperação por faixa) */}
        <div className="rounded-2xl border border-line bg-paper shadow-sm">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-600">⬆️ De onde vieram os quentes</h3>
            <p className="mt-0.5 text-xs text-muted">Quem voltou a comprar no período — participação de cada faixa de origem.</p>
          </div>
          <div className="p-4">
            {loading ? (
              <p className="py-4 text-center text-sm text-muted">Carregando…</p>
            ) : (() => {
              const arrivals = transitions
                .filter((t) => t.to === "QUENTE")
                .sort((a, b) => b.count - a.count);
              const totalArr = arrivals.reduce((a, t) => a + t.count, 0);
              if (totalArr === 0) {
                return <p className="py-4 text-center text-sm text-muted">Ninguém virou quente neste período.</p>;
              }
              return (
                <div className="space-y-3">
                  {arrivals.map((t) => {
                    const s      = SEG_STYLE[t.from];
                    const share  = Math.round((t.count / totalArr) * 100);
                    const base   = flows.find((f) => f.segment === t.from)?.before ?? 0;
                    const rate   = base > 0 ? Math.round((t.count / base) * 100) : null;
                    const isNew  = t.from === "SEM_PEDIDOS";
                    return (
                      <div key={t.from}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${s.text}`}>
                            <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                            {SEG_LABEL[t.from]}{isNew && " (1ª compra)"}
                          </span>
                          <span className="text-xs tabular-nums text-ink">
                            <strong>{t.count.toLocaleString("pt-BR")}</strong>
                            <span className="ml-1.5 font-semibold text-emerald-700">{share}%</span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#F4F4F2]">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.max(4, share)}%` }} />
                        </div>
                        {rate !== null && !isNew && (
                          <p className="mt-0.5 text-[10px] text-muted">
                            recuperou {rate}% dos {base.toLocaleString("pt-BR")} que estavam na faixa
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <p className="border-t border-line pt-2 text-[11px] text-muted">
                    <strong className="text-emerald-700">{totalArr.toLocaleString("pt-BR")}</strong> clientes viraram quentes no período
                  </p>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ⬇️ Quem desceu a escada (queda por faixa) */}
        <div className="rounded-2xl border border-line bg-paper shadow-sm">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-red-500">⬇️ Quem desceu a escada</h3>
            <p className="mt-0.5 text-xs text-muted">Quantos caíram de faixa no período — e o % da faixa que se distanciou.</p>
          </div>
          <div className="p-4">
            {loading ? (
              <p className="py-4 text-center text-sm text-muted">Carregando…</p>
            ) : (() => {
              const drops = transitions
                .filter((t) => RANK[t.to] < RANK[t.from] && t.from !== "SEM_PEDIDOS")
                .sort((a, b) => RANK[b.from] - RANK[a.from]);
              const totalDrops = drops.reduce((a, t) => a + t.count, 0);
              if (totalDrops === 0) {
                return <p className="py-4 text-center text-sm text-muted">Ninguém caiu de faixa neste período. 🎉</p>;
              }
              return (
                <div className="space-y-3">
                  {drops.map((t) => {
                    const from  = SEG_STYLE[t.from], to = SEG_STYLE[t.to];
                    const base  = flows.find((f) => f.segment === t.from)?.before ?? 0;
                    const rate  = base > 0 ? Math.round((t.count / base) * 100) : null;
                    const share = Math.round((t.count / totalDrops) * 100);
                    return (
                      <div key={`${t.from}-${t.to}`}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
                            <span className={`inline-flex items-center gap-1 ${from.text}`}>
                              <span className={`h-2 w-2 rounded-full ${from.dot}`} />{SEG_LABEL[t.from]}
                            </span>
                            <span className="text-muted">→</span>
                            <span className={`inline-flex items-center gap-1 ${to.text}`}>
                              <span className={`h-2 w-2 rounded-full ${to.dot}`} />{SEG_LABEL[t.to]}
                            </span>
                          </span>
                          <span className="text-xs tabular-nums text-ink">
                            <strong>{t.count.toLocaleString("pt-BR")}</strong>
                            {rate !== null && <span className="ml-1.5 font-semibold text-red-600">{rate}% da faixa</span>}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#F4F4F2]">
                          <div className="h-full rounded-full bg-red-400 transition-all" style={{ width: `${Math.max(4, share)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <p className="border-t border-line pt-2 text-[11px] text-muted">
                    <strong className="text-red-600">{totalDrops.toLocaleString("pt-BR")}</strong> clientes se distanciaram no período
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Movimentações detalhadas (setas) */}
      <div className="rounded-2xl border border-line bg-paper shadow-sm">
        <div className="border-b border-line px-4 py-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-brand-600">Movimentações</h3>
          <p className="mt-0.5 text-xs text-muted">Cada transição entre faixas no período.</p>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted">Carregando…</p>
          ) : transitions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Nenhuma movimentação entre faixas neste período.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {transitions.map((t) => {
                const from = SEG_STYLE[t.from], to = SEG_STYLE[t.to];
                const isUp = ["QUENTE", "MORNO", "FRIO", "PERDIDO", "SEM_PEDIDOS"].indexOf(t.to)
                           < ["QUENTE", "MORNO", "FRIO", "PERDIDO", "SEM_PEDIDOS"].indexOf(t.from);
                return (
                  <div key={`${t.from}-${t.to}`} className="flex items-center gap-2 rounded-xl border border-line bg-[#FAFAF8] px-3 py-2">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${from.text}`}>
                      <span className={`h-2 w-2 rounded-full ${from.dot}`} />{SEG_LABEL[t.from]}
                    </span>
                    <span className={isUp ? "text-emerald-500" : "text-muted"}>→</span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${to.text}`}>
                      <span className={`h-2 w-2 rounded-full ${to.dot}`} />{SEG_LABEL[t.to]}
                    </span>
                    <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular-nums text-ink shadow-sm">
                      {t.count.toLocaleString("pt-BR")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Exclusões */}
      <div className="rounded-2xl border border-line bg-paper shadow-sm">
        <div className="border-b border-line px-4 py-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-brand-600">Saídas da base (limpeza automática)</h3>
          <p className="mt-0.5 text-xs text-muted">
            Contatos removidos por número inválido / sem WhatsApp. Passou a ser registrado agora — o histórico acumula a partir daqui.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2">
          <div className="bg-paper p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600">Deletados (lead sem histórico)</p>
            <p className="mt-1 text-xl font-extrabold text-red-700">{loading ? "…" : (exc?.invalidPhoneDeleted ?? 0).toLocaleString("pt-BR")}</p>
            <p className="text-[10px] text-muted">número inválido e nenhum pedido — cadastro apagado</p>
          </div>
          <div className="bg-paper p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Aposentados (tinha histórico)</p>
            <p className="mt-1 text-xl font-extrabold text-amber-700">{loading ? "…" : (exc?.retiredNoContact ?? 0).toLocaleString("pt-BR")}</p>
            <p className="text-[10px] text-muted">sem contato, mas com pedidos — mantido, fora das campanhas</p>
          </div>
        </div>
        {exc && exc.total > 0 && (
          <div className="border-t border-line px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">De qual faixa saíram</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(exc.byPriorSegment).map(([seg, n]) => {
                const s = SEG_STYLE[(seg as BaseSegment)] ?? SEG_STYLE.SEM_PEDIDOS;
                return (
                  <span key={seg} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.bg} ${s.text}`}>
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                    {SEG_LABEL[(seg as BaseSegment)] ?? seg}: {n}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        As migrações entre faixas são reconstruídas ao vivo a partir da data do último pedido de cada cliente — número real, não estimado.
        As saídas da base só passam a contar a partir de agora (quando a limpeza automática começou a registrar).
      </p>
    </div>
  );
}

/** Total customers that dropped to a colder base (quente→morno, morno→frio, etc.). */
function coolingCount(transitions: { from: BaseSegment; to: BaseSegment; count: number }[]): number {
  return transitions
    .filter((t) => RANK[t.to] < RANK[t.from] && t.from !== "SEM_PEDIDOS")
    .reduce((a, t) => a + t.count, 0);
}
