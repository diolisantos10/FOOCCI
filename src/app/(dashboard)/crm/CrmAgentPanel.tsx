"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * CrmAgentPanel — a casa do Agente de CRM no painel do lojista.
 * Mostra o agente aprendendo (campeãs, ganho projetado) e dá os controles
 * (ativar por campanha + botão de pânico). Segue o DESIGN.md (laranja + tokens).
 */

interface Champion { campaignId: string; campaignName: string; phrase: string; liftVsAvg: number; sent: number }
interface ShadowCampaign { campaignId: string; name: string; mode: "EXPLORING" | "OPTIMIZING"; projectedLiftPct: number | null; phrases: number }
interface Activation { campaignId: string; name: string; agentActive: boolean }
interface BriefingNote { kind: "WIN" | "OPPORTUNITY"; emoji: string; title: string; detail: string }
interface WeeklyRecap {
  hasActivity: boolean;
  sent: number;
  converted: number;
  conversionRatePct: number | null;
  revenue: number;
  campaigns: number;
  trend: "UP" | "DOWN" | "FLAT" | "NEW" | null;
  headline: string;
  subline: string | null;
}
interface DailyCohort { sent: number; converted: number; revenue: number; campaigns: number }
interface DailyOverview {
  agentName: string;
  yesterday: DailyCohort;
  weekToDate: DailyCohort;
  rescues: number;
  retrospective: string[];
  nextActions: string[];
}
interface AgentData {
  ok: boolean;
  globallyEnabled: boolean;
  daily: DailyOverview | null;
  recap: WeeklyRecap | null;
  briefing: BriefingNote[];
  status: { mode: "ATIVO" | "APRENDIZ" | "DESLIGADO"; activeCampaigns: number; totalCampaigns: number; championsFound: number };
  champions: Champion[];
  shadow: { optimizing: number; exploring: number; avgProjectedLiftPct: number | null };
  shadowCampaigns: ShadowCampaign[];
  activation: Activation[];
}

function Stat({ n, label }: { n: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums text-ink">{n}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

function Toggle({ on, onClick, busy }: { on: boolean; onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onClick}
      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 ${on ? "bg-brand-500" : "bg-line2"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-paper shadow transition-transform ${on ? "translate-x-3" : "translate-x-0"}`} />
    </button>
  );
}

export default function CrmAgentPanel() {
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/crm/agent", { cache: "no-store" });
      const j = (await r.json()) as AgentData;
      if (!r.ok || !j.ok) throw new Error("falha ao carregar");
      setData(j);
    } catch {
      setErr("Não foi possível carregar o agente agora.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (campaignId: string, active: boolean) => {
    setBusyId(campaignId);
    try {
      await fetch("/api/crm/agent/activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, active }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const setMaster = async (enabled: boolean) => {
    setBusyId("master");
    try {
      await fetch("/api/crm/agent/activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterEnabled: enabled }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const panic = async () => {
    setBusyId("panic");
    try {
      await fetch("/api/crm/agent/activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panic: true }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-line bg-paper p-5 text-sm text-muted">Carregando o agente…</div>;
  }
  if (err || !data) {
    return <div className="rounded-2xl border border-line bg-paper p-5 text-sm text-muted">{err ?? "Agente indisponível."}</div>;
  }

  const off = !data.globallyEnabled;
  const learning = data.status.mode === "APRENDIZ";
  const liftByCampaign = new Map(data.shadowCampaigns.map((s) => [s.campaignId, s]));
  const statusPill = off
    ? { cls: "bg-[#F4F4F2] text-ink2", label: "Desligado" }
    : learning
      ? { cls: "bg-amber-50 text-amber-700", label: "Aprendendo" }
      : { cls: "bg-green-50 text-green-700", label: "Ativo" };

  return (
    <div className="flex flex-col gap-4">
      {/* 1º módulo: o diário do agente — retrospecto de ontem/semana + próximas
          ações. Sempre visível (o resultado das campanhas existe com a IA on ou off). */}
      {data.daily && (
        <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-brand-600">
              🗞️ {data.daily.agentName} — seu diário
            </p>
            <span className="text-[11px] text-muted">ontem · semana</span>
          </div>

          <div className="mt-3 rounded-xl border border-line bg-paper px-3.5 py-3">
            <ul className="flex flex-col gap-1.5">
              {data.daily.retrospective.map((l, i) => (
                <li key={i} className="text-[13px] leading-snug text-ink">• {l}</li>
              ))}
            </ul>

            {data.daily.nextActions.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[.04em] text-ink2">🎯 Próximas ações</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {data.daily.nextActions.map((a, i) => (
                    <li key={i} className="text-[12.5px] leading-snug text-ink2">→ {a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cabeçalho + status + master switch */}
      <div className="rounded-2xl border border-line bg-paper p-5 shadow-[0_1px_2px_rgba(11,11,11,.03)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg">🤖</span>
            <div>
              <p className="text-sm font-semibold text-ink">Agente de CRM</p>
              <p className="mt-0.5 text-xs text-muted">
                Ele aprende sozinho quais mensagens convertem e propõe novas — sempre aprovadas pela Meta antes de ir ao cliente.
              </p>
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${statusPill.cls}`}>
            {statusPill.label}
          </span>
        </div>

        {/* Master switch: liga/desliga a IA toda (rodar o CRM na mão) */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-[#FAFAF8] px-3 py-2.5">
          <div>
            <p className="text-xs font-semibold text-ink">Inteligência do CRM</p>
            <p className="mt-0.5 text-[11px] text-muted">{off ? "Desligada — você está rodando o CRM na mão." : "Ligada — o agente trabalha nos bastidores."}</p>
          </div>
          <Toggle on={data.globallyEnabled} busy={busyId === "master"} onClick={() => setMaster(off)} />
        </div>

        {!off && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat n={learning ? "Aprendiz" : "Ativo"} label="Modo agora" />
            <Stat n={`${data.status.activeCampaigns}/${data.status.totalCampaigns}`} label="Campanhas ativadas" />
            <Stat n={data.status.championsFound} label="Frases campeãs achadas" />
          </div>
        )}

        {!off && learning && (
          <p className="mt-3 rounded-xl border border-line bg-[#FAFAF8] px-3 py-2.5 text-xs text-ink2">
            🌱 <span className="font-semibold">Modo aprendiz:</span> o agente está observando suas campanhas e acumulando dados.
            Nada que ele criou vai ao cliente ainda — você liga campanha por campanha quando quiser.
          </p>
        )}
      </div>

      {/* O recado do agente — o RESUMO da semana aparece sempre; os DESTAQUES
          (campeã/oportunidade) só quando há algo notável. */}
      {!off && (data.recap || data.briefing.length > 0) && (
        <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5">
          <p className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-brand-600">📣 Recado do agente</p>

          {data.recap && (
            <div className="mt-3 rounded-xl border border-line bg-paper px-3.5 py-3">
              <p className="text-[13px] font-semibold text-ink">{data.recap.headline}</p>
              {data.recap.subline && <p className="mt-1 text-[11.5px] text-ink2">{data.recap.subline}</p>}
              {data.recap.hasActivity && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Stat n={data.recap.sent} label="Enviadas (7d)" />
                  <Stat n={data.recap.converted} label="Converteram" />
                  <Stat n={data.recap.conversionRatePct != null ? `${data.recap.conversionRatePct}%` : "—"} label="Conversão" />
                </div>
              )}
            </div>
          )}

          {data.briefing.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {data.briefing.map((n, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-xl border border-line bg-paper px-3 py-2.5">
                  <span className="mt-0.5 text-base">{n.emoji}</span>
                  <div>
                    <p className="text-xs font-semibold text-ink">{n.title}</p>
                    <p className="mt-0.5 text-[11px] text-ink2">{n.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Frases campeãs */}
      {!off && data.champions.length > 0 && (
        <div className="rounded-2xl border border-line bg-paper p-5 shadow-[0_1px_2px_rgba(11,11,11,.03)]">
          <p className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-ink2">🏆 Frases campeãs</p>
          <p className="mt-0.5 text-xs text-muted">As que mais convertem — o agente aprende com elas pra criar novas parecidas.</p>
          <div className="mt-3 flex flex-col gap-2">
            {data.champions.slice(0, 5).map((c) => (
              <div key={c.campaignId} className="rounded-xl border border-line bg-[#FAFAF8] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">{c.campaignName}</span>
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    {c.liftVsAvg}× a média
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink2">“{c.phrase}”</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campanhas: ganho projetado + interruptor */}
      {!off && (
      <div className="rounded-2xl border border-line bg-paper p-5 shadow-[0_1px_2px_rgba(11,11,11,.03)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-ink2">Campanhas</p>
            <p className="mt-0.5 text-xs text-muted">Ligue o agente por campanha. Desligado = ele só observa.</p>
          </div>
          {data.status.activeCampaigns > 0 && (
            <button
              type="button"
              onClick={panic}
              disabled={busyId === "panic"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              🛑 Voltar tudo ao seguro
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-col divide-y divide-line">
          {data.activation.length === 0 && (
            <p className="py-3 text-xs text-muted">Nenhuma campanha ainda.</p>
          )}
          {data.activation.map((a) => {
            const s = liftByCampaign.get(a.campaignId);
            const lift = s?.projectedLiftPct;
            return (
              <div key={a.campaignId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-ink">{a.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {lift != null
                      ? `ganho projetado do agente: +${lift}%`
                      : s?.mode === "EXPLORING"
                        ? "coletando dados…"
                        : "sem dados ainda"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold ${a.agentActive ? "text-brand-600" : "text-muted"}`}>
                    {a.agentActive ? "Ativo" : "Aprendiz"}
                  </span>
                  <Toggle on={a.agentActive} busy={busyId === a.campaignId} onClick={() => toggle(a.campaignId, !a.agentActive)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
