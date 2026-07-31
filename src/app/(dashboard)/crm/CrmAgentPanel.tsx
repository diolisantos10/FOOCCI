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
    return <div className="rounded-2xl border border-line bg-paper p-5 text-sm text-muted">Carregando o recado do agente…</div>;
  }
  // Sem dados, agente desligado ou sem nada a dizer: não polui o overview.
  const off = !data?.globallyEnabled;
  if (err || !data || off || (!data.recap && data.briefing.length === 0)) return null;

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5">
      <div className="flex items-center gap-2">
        <span className="text-base">🤖</span>
        <p className="text-[12.5px] font-semibold uppercase tracking-[.04em] text-brand-600">Recado do agente</p>
      </div>

      {data.recap && (
        <div className="mt-3 rounded-xl border border-line bg-paper px-3.5 py-3">
          <p className="text-[13px] font-semibold text-ink">{data.recap.headline}</p>
          {data.recap.subline && <p className="mt-1 text-[11.5px] text-ink2">{data.recap.subline}</p>}
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
  );
}
