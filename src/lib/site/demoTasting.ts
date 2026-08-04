/**
 * A degustação do site comercial — o estado da padaria de vitrine, lido do banco.
 *
 * A página `/site/experimente` manda o visitante para DENTRO do produto rodando
 * (`/qr/foocci-bakery` e `/pedido/foocci-bakery`). Numa página com campanha paga em
 * cima, mandar o visitante para um link que dá 404 é pior do que não ter a página:
 * por isso a aba não confia no slug — ela CONFERE que a vitrine existe e tem
 * cardápio antes de acender os botões.
 *
 * Os três estados que a página precisa distinguir (DESIGN.md §6.1):
 *   • `ok`      — a padaria existe e tem itens; degustação liberada.
 *   • `empty`   — o tenant não foi semeado (ou está sem item visível). A página diz
 *                 isso e oferece a demonstração com gente, em vez de link morto.
 *   • `error`   — a consulta falhou. NÃO viramos isso em "está tudo bem" nem em
 *                 "está tudo quebrado": ausência de informação não é informação
 *                 (guardrail 1). A página mostra os links (são endereços públicos
 *                 estáveis) com a nota honesta de que não deu para conferir agora.
 *
 * O HORÁRIO vem daqui pelo mesmo motivo: a padaria abre 6h e fecha 20h/21h (13h no
 * domingo), e quem visitar o site às 22h encontra a loja com o envio de pedido
 * pausado. A página avisa antes de o visitante descobrir sozinho — e o cálculo usa
 * as MESMAS funções de `@/lib/business-hours` que a loja usa, para o aviso nunca
 * divergir do que a loja mostra. Nada aqui escreve no restaurante.
 */

import { prisma } from "@/lib/prisma";
import { DEMO_BAKERY_SLUG } from "@/lib/demo-restaurant";
import {
  getPeriodsForRow,
  getNextOpenAt,
  buildClosedMessage,
  isOpenFromRow,
  type TimePeriod,
} from "@/lib/business-hours";

/** Uma linha do horário já agrupada para leitura humana. */
export interface ScheduleLine {
  /** "Segunda a quinta", "Sexta e sábado", "Domingo". */
  days: string;
  /** "06:00–20:00" ou "06:00–10:00 e 15:00–20:00". Vazio = fechado. */
  hours: string;
  /** Verdadeiro na linha que contém o dia de hoje — a página destaca essa. */
  isToday: boolean;
}

export interface HoursRow {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  periodsJson: unknown;
}

export type TastingState =
  | {
      status: "ok";
      /** Itens visíveis no cardápio — é o número que a página anuncia. */
      itemCount: number;
      /** Quantos já têm foto. 0 enquanto o CEO não gerar as imagens. */
      photoCount: number;
      isOpen: boolean;
      /** Só quando fechada: a MESMA frase que a loja mostra. */
      closedMessage: string | null;
      schedule: ScheduleLine[];
    }
  | { status: "empty" }
  | { status: "error" };

const DAY_NAMES = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/** A semana começa na segunda: é como um humano lê um horário de loja. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

function periodsToText(periods: TimePeriod[]): string {
  if (periods.length === 0) return "";
  return periods.map((p) => `${p.open}–${p.close}`).join(" e ");
}

/** "Segunda a quinta", "Sexta e sábado", "Domingo" — só o primeiro dia leva maiúscula. */
function joinDays(names: string[]): string {
  const tail = (n: string) => n.toLocaleLowerCase("pt-BR");
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} e ${tail(names[1]!)}`;
  return `${names[0]} a ${tail(names[names.length - 1]!)}`;
}

/**
 * Agrupa os sete dias em poucas linhas legíveis, juntando dias CONSECUTIVOS com o
 * mesmo horário. Sete linhas iguais é tabela de banco impressa na cara do visitante;
 * "Segunda a quinta · 06:00–20:00" é horário de padaria.
 *
 * Pura de propósito — é o pedaço que dá para testar sem banco.
 */
export function summarizeWeek(rows: HoursRow[], todayDow: number): ScheduleLine[] {
  const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));

  const perDay = WEEK_ORDER.map((dow) => {
    const row = byDay.get(dow);
    return {
      dow,
      name: DAY_NAMES[dow]!,
      hours: row ? periodsToText(getPeriodsForRow(row)) : "",
    };
  });

  const groups: { hours: string; names: string[]; dows: number[] }[] = [];
  for (const day of perDay) {
    const last = groups[groups.length - 1];
    if (last && last.hours === day.hours) {
      last.names.push(day.name);
      last.dows.push(day.dow);
    } else {
      groups.push({ hours: day.hours, names: [day.name], dows: [day.dow] });
    }
  }

  return groups.map((g) => ({
    days: joinDays(g.names),
    hours: g.hours,
    isToday: g.dows.includes(todayDow),
  }));
}

/**
 * Lê o estado da vitrine. Nunca lança: a página de vendas não pode cair porque o
 * banco piscou — ela degrada para `error` e continua vendendo.
 */
export async function getTastingState(now: Date = new Date()): Promise<TastingState> {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: DEMO_BAKERY_SLUG },
      select: { id: true, timezone: true, isDemo: true },
    });

    // Sem tenant não há degustação. Também recusamos um tenant que NÃO esteja
    // marcado como demonstração: a página promete "nada é cobrado, nada é
    // entregue", e essa promessa só é verdadeira sobre uma vitrine de verdade.
    if (!restaurant || !restaurant.isDemo) return { status: "empty" };

    const [itemCount, photoCount, hoursRows] = await Promise.all([
      // MenuItem não guarda restaurantId — ele pende da categoria. Contar pelo
      // caminho da categoria é o que garante que a conta é DESTA vitrine.
      prisma.menuItem.count({
        where: { category: { restaurantId: restaurant.id }, isActive: true, isAvailable: true },
      }),
      prisma.menuItem.count({
        where: {
          category: { restaurantId: restaurant.id },
          isActive: true,
          isAvailable: true,
          imageUrl: { not: null },
        },
      }),
      prisma.businessHours.findMany({
        where: { restaurantId: restaurant.id },
        orderBy: { dayOfWeek: "asc" },
        select: {
          dayOfWeek: true,
          isOpen: true,
          openTime: true,
          closeTime: true,
          periodsJson: true,
        },
      }),
    ]);

    if (itemCount === 0) return { status: "empty" };

    const tz = restaurant.timezone ?? "America/Sao_Paulo";
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const todayDow = localNow.getDay();
    const localMin = localNow.getHours() * 60 + localNow.getMinutes();

    const todayRow = hoursRows.find((r) => r.dayOfWeek === todayDow) ?? null;
    const isOpen = isOpenFromRow(todayRow, tz, now);
    const todayPeriods = todayRow ? getPeriodsForRow(todayRow) : [];
    const nextOpenAt = isOpen ? null : getNextOpenAt(hoursRows, todayDow, localMin);

    return {
      status: "ok",
      itemCount,
      photoCount,
      isOpen,
      closedMessage: isOpen ? null : buildClosedMessage(todayPeriods, nextOpenAt),
      schedule: summarizeWeek(hoursRows, todayDow),
    };
  } catch (err) {
    // O alerta carrega a evidência (guardrail 6) — sem isso o log vira ruído.
    console.error("[site/experimente] falha ao ler a padaria de demonstração", {
      slug: DEMO_BAKERY_SLUG,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "error" };
  }
}
