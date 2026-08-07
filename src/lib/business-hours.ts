/**
 * Business hours utilities — shared across all channels (ordering UI, finalize API,
 * WhatsApp agent, future admin triggers).
 *
 * Supports both legacy single-period rows (openTime + closeTime) and the newer
 * periodsJson format ([{ open, close }, ...]) for split shifts like lunch 11–15
 * and dinner 18–23.
 *
 * All callers should use `isRestaurantOpenNow` (async, DB lookup) or
 * `isOpenFromRow` (sync, row already in memory).
 */

import { prisma } from "@/lib/prisma";

export interface TimePeriod {
  open:  string; // "HH:MM"
  close: string; // "HH:MM"
}

const DAY_LABELS_PT = [
  "domingo", "segunda-feira", "terça-feira",
  "quarta-feira", "quinta-feira", "sexta-feira", "sábado",
];

export function toMinutes(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

export function isInPeriod(nowMin: number, period: TimePeriod): boolean {
  const open  = toMinutes(period.open);
  const close = toMinutes(period.close);
  // Midnight-crossing: close ≤ open means the period wraps past midnight (e.g. 22:00–01:00)
  if (close <= open) return nowMin >= open || nowMin < close;
  return nowMin >= open && nowMin < close;
}

/**
 * Returns the effective time periods for a BusinessHours row.
 * - If `periodsJson` is set and non-empty, it takes precedence over openTime/closeTime.
 * - Otherwise falls back to a single period from openTime/closeTime.
 * - Returns [] when `isOpen` is false.
 */
export function getPeriodsForRow(row: {
  isOpen:      boolean;
  openTime:    string;
  closeTime:   string;
  periodsJson: unknown;
}): TimePeriod[] {
  if (!row.isOpen) return [];
  if (row.periodsJson) {
    const parsed = row.periodsJson as TimePeriod[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  }
  return [{ open: row.openTime, close: row.closeTime }];
}

/**
 * A LOJA ABRE 24 HORAS, TODOS OS DIAS?
 *
 * Ordem do CEO em 07/08/2026, olhando a padaria de vitrine: *"quero que tire a
 * informação do horário."*
 *
 * Ele está certo, e a regra é de produto, não de vitrine: **loja que nunca fecha
 * não tem o que dizer sobre horário.** "Aberto agora" só informa alguma coisa
 * quando existe a possibilidade de estar fechado. Sem essa possibilidade, a
 * linha ocupa espaço no topo e não responde a pergunta nenhuma.
 *
 * O que ela NÃO faz, de propósito: esconder o estado de um restaurante com
 * horário de verdade. Para esse, "Aberto agora" e "Fechado agora" é a
 * informação mais útil da tela — é o que decide se a pessoa perde tempo
 * montando um carrinho.
 *
 * Reconhece as duas formas legítimas de "nunca fecha":
 *   • as duas pontas iguais (`00:00`–`00:00`), que `isInPeriod` já trata como
 *     período que atravessa a meia-noite e cobre o dia inteiro;
 *   • períodos que somados cobrem os 1.440 minutos do dia.
 *
 * Dia sem linha cadastrada NÃO conta como 24h. `isOpenFromRow(null)` devolve
 * `true` por conveniência, mas "ninguém cadastrou" é ausência de informação —
 * e ausência de informação não é informação (guardrail 1). Um restaurante que
 * nunca preencheu horário continua vendo "Aberto agora", que é o comportamento
 * de hoje e não deve mudar por tabela.
 */
export function abre24hTodosOsDias(
  rows: ReadonlyArray<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string; periodsJson: unknown }>,
): boolean {
  if (rows.length < 7) return false;

  for (let dia = 0; dia < 7; dia++) {
    const row = rows.find((r) => r.dayOfWeek === dia);
    if (!row || !row.isOpen) return false;

    const periods = getPeriodsForRow(row);
    if (periods.length === 0) return false;

    // Cobre o dia inteiro? Ou uma ponta atravessa a meia-noite fechando o ciclo,
    // ou a soma dos períodos alcança os 1.440 minutos.
    const cobreTudo = periods.some((p) => {
      const open = toMinutes(p.open);
      const close = toMinutes(p.close);
      return close === open; // 00:00–00:00, 08:00–08:00 … dá a volta completa
    });
    if (cobreTudo) continue;

    const minutosCobertos = new Set<number>();
    for (const p of periods) {
      const open = toMinutes(p.open);
      const close = toMinutes(p.close);
      const fim = close > open ? close : close + 1440;
      for (let m = open; m < fim; m++) minutosCobertos.add(m % 1440);
    }
    if (minutosCobertos.size < 1440) return false;
  }

  return true;
}

/**
 * Finds the next future opening time given all rows, current day, and current minute.
 * Returns `{ dayLabel: "hoje"|"amanhã"|"<day name>", time: "HH:MM" }` or null if no
 * scheduled opening is found in the next 7 days.
 */
export function getNextOpenAt(
  rows: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string; periodsJson: unknown }>,
  todayDow: number,
  nowMin: number,
): { dayLabel: string; time: string } | null {
  // Remaining periods today
  const todayRow = rows.find((r) => r.dayOfWeek === todayDow);
  if (todayRow) {
    const todayPeriods = getPeriodsForRow(todayRow);
    const next = todayPeriods.find((p) => toMinutes(p.open) > nowMin);
    if (next) return { dayLabel: "hoje", time: next.open };
  }
  // Next 6 days
  for (let i = 1; i <= 6; i++) {
    const nextDow  = (todayDow + i) % 7;
    const row      = rows.find((r) => r.dayOfWeek === nextDow);
    if (!row) continue;
    const periods  = getPeriodsForRow(row);
    if (periods.length > 0) {
      const dayLabel = i === 1 ? "amanhã" : (DAY_LABELS_PT[nextDow] ?? `dia ${nextDow}`);
      return { dayLabel, time: periods[0]!.open };
    }
  }
  return null;
}

/**
 * Builds a human-readable Portuguese closed message.
 * Examples:
 *   "Estamos fechados no momento. Hoje funcionamos das 11:00–15:00 e das 18:00–23:00. Voltamos hoje às 18:00."
 *   "Estamos fechados no momento. Hoje funcionamos das 11:00–22:00. Voltamos amanhã às 11:00."
 *   "Hoje estamos fechados. Voltamos segunda-feira às 11:00."
 */
export function buildClosedMessage(
  todayPeriods: TimePeriod[],
  nextOpenAt: { dayLabel: string; time: string } | null,
): string {
  const nextStr = nextOpenAt
    ? ` Voltamos ${
        nextOpenAt.dayLabel === "hoje"   ? "hoje às" :
        nextOpenAt.dayLabel === "amanhã" ? "amanhã às" :
        `${nextOpenAt.dayLabel} às`
      } ${nextOpenAt.time}.`
    : "";

  if (todayPeriods.length > 0) {
    const hoursStr = todayPeriods.map((p) => `${p.open}–${p.close}`).join(" e ");
    return `Estamos fechados no momento. Hoje funcionamos das ${hoursStr}.${nextStr}`;
  }
  if (nextOpenAt) {
    const prefix =
      nextOpenAt.dayLabel === "hoje"   ? "Voltamos hoje às" :
      nextOpenAt.dayLabel === "amanhã" ? "Voltamos amanhã às" :
      `Voltamos ${nextOpenAt.dayLabel} às`;
    return `Hoje estamos fechados. ${prefix} ${nextOpenAt.time}.`;
  }
  return "Estamos fechados no momento.";
}

/**
 * Sync open-check for when the row is already in memory (e.g. page.tsx).
 * Returns true (open) when no row exists — no config means no restriction.
 */
export function isOpenFromRow(
  row: { isOpen: boolean; openTime: string; closeTime: string; periodsJson: unknown } | null | undefined,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!row) return true;
  const local  = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const nowMin = local.getHours() * 60 + local.getMinutes();
  return getPeriodsForRow(row).some((p) => isInPeriod(nowMin, p));
}

/**
 * Async open-check that fetches from DB.
 * Uses restaurant.timezone. Falls back to "America/Sao_Paulo".
 * Returns true (open) when no BusinessHours row is configured for today.
 */
export async function isRestaurantOpenNow(
  restaurantId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const restaurant = await prisma.restaurant.findUnique({
    where:  { id: restaurantId },
    select: { timezone: true },
  });
  const tz    = restaurant?.timezone ?? "America/Sao_Paulo";
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const dow   = local.getDay();

  const row = await prisma.businessHours.findUnique({
    where:  { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: dow } },
    select: { isOpen: true, openTime: true, closeTime: true, periodsJson: true },
  });

  if (!row) return true;
  const nowMin = local.getHours() * 60 + local.getMinutes();
  return getPeriodsForRow(row).some((p) => isInPeriod(nowMin, p));
}
