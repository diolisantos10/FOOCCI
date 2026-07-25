/**
 * CrmDailyOverview — o "diário" do Agente de CRM (1º módulo do dashboard).
 *
 * Um relatório curto e HONESTO do que aconteceu, em dia CIVIL do restaurante:
 *   • Ontem: mensagens/campanhas → receita atribuída.
 *   • Semana (segunda → ontem): o acumulado.
 *   • Resgates: clientes que voltaram a pedir depois de um disparo, na semana.
 *   • Próximas ações: o que o agente vai atacar hoje pra aumentar receita —
 *     derivado de DADO REAL (campeãs descobertas, campanhas otimizando), nunca
 *     inventado.
 *
 * Tudo read-only, vindo de CampaignExecution já medido. Corte de dia por fuso
 * (default America/Sao_Paulo). `now` injetável para testes.
 */

import { prisma } from "@/lib/prisma";

const TZ_DEFAULT = "America/Sao_Paulo";

export interface OverviewCohort {
  sent: number;
  converted: number;
  revenue: number;
  campaigns: number;
}

export interface DailyOverview {
  agentName: string;
  timezone: string;
  yesterday: OverviewCohort;
  weekToDate: OverviewCohort;
  /** Clientes distintos que converteram na semana (voltaram após um disparo). */
  rescues: number;
  /** As ~4 frases do retrospecto (sempre preenchido, honesto quando sem envio). */
  retrospective: string[];
  /** As próximas ações/estratégias do dia (derivadas de dado real). */
  nextActions: string[];
}

// ─── Helpers de fuso (dia civil) ──────────────────────────────────────────────

/** Deslocamento (ms) do fuso no instante dado. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUTC = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return asUTC - date.getTime();
}

/** UTC da meia-noite local de (hoje + dayOffset) no fuso. */
function startOfLocalDayUTC(now: Date, tz: string, dayOffset: number): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now).split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d! + dayOffset, 0, 0, 0);
  return new Date(guess - tzOffsetMs(new Date(guess), tz));
}

/** Weekday local: 0=domingo … 6=sábado. */
function localWeekday(now: Date, tz: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[wd] ?? 0;
}

// ─── Coorte ───────────────────────────────────────────────────────────────────

async function cohort(restaurantId: string, from: Date, to: Date): Promise<OverviewCohort> {
  const where = { campaign: { restaurantId }, sentAt: { gte: from, lt: to } } as const;
  const [sent, convRows, campGroups] = await Promise.all([
    prisma.campaignExecution.count({ where }).catch(() => 0),
    prisma.campaignExecution.findMany({ where: { ...where, converted: true }, select: { revenue: true } }).catch(() => [] as Array<{ revenue: unknown }>),
    prisma.campaignExecution.groupBy({ by: ["campaignId"], where, _count: { _all: true } }).catch(() => [] as Array<{ campaignId: string }>),
  ]);
  const revenue = convRows.reduce((s, e) => s + (e.revenue != null ? Number(e.revenue) : 0), 0);
  return { sent, converted: convRows.length, revenue, campaigns: campGroups.length };
}

async function distinctRescues(restaurantId: string, from: Date, to: Date): Promise<number> {
  const rows = await prisma.campaignExecution
    .groupBy({ by: ["customerId"], where: { campaign: { restaurantId }, sentAt: { gte: from, lt: to }, converted: true } })
    .catch(() => [] as Array<{ customerId: string }>);
  return rows.length;
}

// ─── Texto ────────────────────────────────────────────────────────────────────

function money(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function retrospectiveLines(yesterday: OverviewCohort, week: OverviewCohort, rescues: number): string[] {
  const lines: string[] = [];

  lines.push(
    yesterday.sent > 0
      ? `Ontem saíram ${yesterday.sent} ${yesterday.sent === 1 ? "mensagem" : "mensagens"} em ${yesterday.campaigns} ${yesterday.campaigns === 1 ? "campanha" : "campanhas"} — ${yesterday.converted} ${yesterday.converted === 1 ? "converteu" : "converteram"}${yesterday.revenue > 0 ? `, ${money(yesterday.revenue)} de receita` : ""}.`
      : "Ontem não saiu nenhuma campanha.",
  );

  lines.push(
    week.sent > 0
      ? `Na semana (seg→ontem): ${week.sent} mensagens, ${week.converted} conversões${week.revenue > 0 ? ` e ${money(week.revenue)} atribuídos` : ""}.`
      : "Na semana ainda não houve envios.",
  );

  if (rescues > 0) {
    lines.push(`${rescues} ${rescues === 1 ? "cliente voltou" : "clientes voltaram"} a pedir depois de um disparo nesta semana.`);
  }

  return lines;
}

export interface NextActionInputs {
  champions: unknown[];
  shadow: { optimizing?: number; exploring?: number; avgProjectedLiftPct?: number | null };
  activeCount: number;
  totalCampaigns: number;
}

/** Próximas ações do dia — só a partir de dado real; nunca promete o que não sabe. */
export function planNextActions(input: NextActionInputs): string[] {
  const actions: string[] = [];
  const champs = input.champions?.length ?? 0;
  const optimizing = input.shadow?.optimizing ?? 0;
  const exploring = input.shadow?.exploring ?? 0;

  if (champs > 0) {
    actions.push(`Priorizar ${champs === 1 ? "a frase campeã" : `as ${champs} frases campeãs`} que mais convertem nos próximos disparos.`);
  }
  if (optimizing > 0) {
    const lift = input.shadow?.avgProjectedLiftPct;
    actions.push(`Favorecer as frases vencedoras em ${optimizing} ${optimizing === 1 ? "campanha" : "campanhas"}${lift ? ` (ganho projetado ~${lift}%)` : ""}.`);
  }
  if (exploring > 0) {
    actions.push(`Coletar mais dados em ${exploring} ${exploring === 1 ? "campanha" : "campanhas"} antes de decidir a vencedora.`);
  }
  if (input.activeCount === 0 && input.totalCampaigns > 0) {
    actions.push("Deixar o agente pronto pra assumir — é só ligar numa campanha quando você quiser.");
  }
  if (actions.length === 0) {
    actions.push("Seguir medindo o que converte pra apostar nas melhores frases.");
  }
  return actions.slice(0, 3);
}

/** Monta o diário completo. now/timezone/agentName injetáveis. */
export async function buildDailyOverview(
  restaurantId: string,
  opts: {
    now?: Date;
    timezone?: string;
    agentName?: string;
    nextActions?: NextActionInputs;
  } = {},
): Promise<DailyOverview> {
  const now = opts.now ?? new Date();
  const tz = opts.timezone ?? TZ_DEFAULT;
  const agentName = opts.agentName ?? "Recado";

  const todayStart = startOfLocalDayUTC(now, tz, 0);
  const yesterdayStart = startOfLocalDayUTC(now, tz, -1);
  const daysSinceMon = (localWeekday(now, tz) + 6) % 7;
  const weekStart = startOfLocalDayUTC(now, tz, -daysSinceMon);

  const [yesterday, weekToDate, rescues] = await Promise.all([
    cohort(restaurantId, yesterdayStart, todayStart),
    cohort(restaurantId, weekStart, todayStart),
    distinctRescues(restaurantId, weekStart, todayStart),
  ]);

  return {
    agentName,
    timezone: tz,
    yesterday,
    weekToDate,
    rescues,
    retrospective: retrospectiveLines(yesterday, weekToDate, rescues),
    nextActions: opts.nextActions ? planNextActions(opts.nextActions) : [],
  };
}
