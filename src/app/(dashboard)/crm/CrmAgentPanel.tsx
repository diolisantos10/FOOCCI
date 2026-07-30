"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * CrmAgentPanel — o que o Agente de CRM tem a dizer para o lojista.
 *
 * Só RESULTADO. Os interruptores — ligar a IA por campanha, master switch,
 * botão de pânico, automações — saíram daqui em 30/07 e foram para o admin
 * (`/admin/crm-agente`). O motivo é de produto: decidir se a IA escreve a
 * mensagem de uma campanha é operação do Foocci, não trabalho do dono do
 * restaurante. Ele quer saber se vendeu.
 *
 * O que sobrou tem uma coisa em comum: tudo aqui é leitura. Nenhum clique
 * nesta tela muda o que vai ao cliente. Segue o DESIGN.md (laranja + tokens).
 */

interface Champion { campaignId: string; campaignName: string; phrase: string; liftVsAvg: number; sent: number }
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
}

function Stat({ n, label }: { n: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums text-ink">{n}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

export default function CrmAgentPanel() {
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
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

  if (loading) {
    return <div className="rounded-2xl border border-line bg-paper p-5 text-sm text-muted">Carregando o agente…</div>;
  }
  if (err || !data) {
    return <div className="rounded-2xl border border-line bg-paper p-5 text-sm text-muted">{err ?? "Agente indisponível."}</div>;
  }

  const off = !data.globallyEnabled;
  const learning = data.status.mode === "APRENDIZ";
  const statusPill = off
    ? { cls: "bg-[#F4F4F2] text-ink2", label: "Desligado" }
    : learning
      ? { cls: "bg-amber-50 text-amber-700", label: "Aprendendo" }
      : { cls: "bg-green-50 text-green-700", label: "Ativo" };

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho + status (leitura) */}
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

        {off ? (
          <p className="mt-4 rounded-xl border border-line bg-[#FAFAF8] px-3 py-2.5 text-xs text-ink2">
            A inteligência do CRM está desligada — você está rodando o CRM na mão. Os resultados das
            campanhas continuam aparecendo normalmente aqui.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat n={learning ? "Aprendiz" : "Ativo"} label="Modo agora" />
            <Stat n={`${data.status.activeCampaigns}/${data.status.totalCampaigns}`} label="Campanhas ativadas" />
            <Stat n={data.status.championsFound} label="Frases campeãs achadas" />
          </div>
        )}

        {!off && learning && (
          <p className="mt-3 rounded-xl border border-line bg-[#FAFAF8] px-3 py-2.5 text-xs text-ink2">
            🌱 <span className="font-semibold">Modo aprendiz:</span> o agente está observando suas campanhas e
            acumulando dados. Nada que ele criou vai ao cliente ainda.
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

    </div>
  );
}
