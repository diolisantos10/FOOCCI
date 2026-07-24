/**
 * CrmWeeklyRecap — a "fala da semana" do Agente de CRM.
 *
 * O recado do agente tem DUAS camadas:
 *   • DESTAQUES (WIN/OPPORTUNITY, em CrmAgentBriefing) — só aparecem quando há algo
 *     notável. "Se não tem o que falar, não fala" vale só para estes.
 *   • RESUMO-BASE (este arquivo) — SEMPRE aparece: o agente conta, em uma frase, o
 *     que aconteceu nos últimos 7 dias. Assim o painel nunca fica mudo.
 *
 * Tudo vem de dado JÁ MEDIDO (CampaignExecution): coorte de mensagens ENVIADAS na
 * janela, quantas converteram, receita atribuída e a comparação com os 7 dias
 * anteriores. Nada é inventado — quando não houve envio, ele diz isso com honestidade.
 * 100% read-only.
 */

import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;
/** Variação de volume (±) a partir da qual dizemos que subiu/caiu (senão: estável). */
const TREND_BAND = 0.1;

export interface WeeklyRecap {
  /** Houve pelo menos uma mensagem enviada na janela dos 7 dias. */
  hasActivity: boolean;
  windowDays: number;
  sent: number;
  converted: number;
  conversionRatePct: number | null;
  revenue: number;
  campaigns: number;
  trend: "UP" | "DOWN" | "FLAT" | "NEW" | null;
  /** A "fala" do agente, sempre preenchida. */
  headline: string;
  /** Complemento opcional (tendência / receita). */
  subline: string | null;
}

interface Cohort { sent: number; converted: number; revenue: number; campaigns: number }

/** Coorte por sentAt na janela [from, to), escopada ao restaurante via a campanha. */
async function cohort(restaurantId: string, from: Date, to: Date): Promise<Cohort> {
  const where = { campaign: { restaurantId }, sentAt: { gte: from, lt: to } } as const;
  const [sent, convRows, campGroups] = await Promise.all([
    prisma.campaignExecution.count({ where }).catch(() => 0),
    prisma.campaignExecution
      .findMany({ where: { ...where, converted: true }, select: { revenue: true } })
      .catch(() => [] as Array<{ revenue: unknown }>),
    prisma.campaignExecution
      .groupBy({ by: ["campaignId"], where, _count: { _all: true } })
      .catch(() => [] as Array<{ campaignId: string }>),
  ]);
  const revenue = convRows.reduce((s, e) => s + (e.revenue != null ? Number(e.revenue) : 0), 0);
  return { sent, converted: convRows.length, revenue, campaigns: campGroups.length };
}

function pct(n: number, d: number): number | null {
  return d > 0 ? Number(((n / d) * 100).toFixed(1)) : null;
}

function money(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

/** Monta o resumo dos últimos 7 dias. `now` é injetável para testes. */
export async function buildWeeklyRecap(restaurantId: string, now: Date = new Date()): Promise<WeeklyRecap> {
  const t = now.getTime();
  const cur = await cohort(restaurantId, new Date(t - WINDOW_DAYS * DAY_MS), new Date(t));
  const prev = await cohort(restaurantId, new Date(t - 2 * WINDOW_DAYS * DAY_MS), new Date(t - WINDOW_DAYS * DAY_MS));

  // Sem envios na semana — fala honesta, nunca em branco.
  if (cur.sent === 0) {
    return {
      hasActivity: false,
      windowDays: WINDOW_DAYS,
      sent: 0, converted: 0, conversionRatePct: null, revenue: 0, campaigns: 0,
      trend: null,
      headline: prev.sent > 0
        ? "Semana mais quieta — nenhuma campanha saiu nos últimos 7 dias."
        : "Ainda não saiu nenhuma campanha. Quando você enviar, eu começo a medir o que converte.",
      subline: prev.sent > 0 ? `Na semana anterior foram ${prev.sent} mensagens.` : null,
    };
  }

  const conversionRatePct = pct(cur.converted, cur.sent);

  let trend: WeeklyRecap["trend"];
  if (prev.sent === 0) {
    trend = "NEW";
  } else {
    const delta = (cur.sent - prev.sent) / prev.sent;
    trend = delta > TREND_BAND ? "UP" : delta < -TREND_BAND ? "DOWN" : "FLAT";
  }

  const camps = cur.campaigns === 1 ? "1 campanha" : `${cur.campaigns} campanhas`;
  const convClause = cur.converted > 0
    ? `${cur.converted} converteram${conversionRatePct != null ? ` (${conversionRatePct}%)` : ""}`
    : "nenhuma conversão ainda";
  const headline = `Nos últimos 7 dias saíram ${cur.sent} mensagens em ${camps} — ${convClause}.`;

  const parts: string[] = [];
  if (trend === "UP") parts.push(`Volume acima da semana anterior (${prev.sent} → ${cur.sent}).`);
  else if (trend === "DOWN") parts.push(`Volume abaixo da semana anterior (${prev.sent} → ${cur.sent}).`);
  else if (trend === "NEW") parts.push("Primeira semana com envios — a base de comparação começa agora.");
  if (cur.revenue > 0) parts.push(`Receita atribuída: ${money(cur.revenue)}.`);

  return {
    hasActivity: true,
    windowDays: WINDOW_DAYS,
    sent: cur.sent,
    converted: cur.converted,
    conversionRatePct,
    revenue: Number(cur.revenue.toFixed(2)),
    campaigns: cur.campaigns,
    trend,
    headline,
    subline: parts.length ? parts.join(" ") : null,
  };
}
