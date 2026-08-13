/**
 * orders-panel-period.ts — o período do painel de Pedidos e o número que o KPI mostra.
 *
 * Existe por causa de dois defeitos reais achados em 05/08 (docs/pendencias.md):
 *
 *   1. O KPI "Total hoje" contava `orders.length` — os pedidos CARREGADOS na
 *      página (teto de 100), não os do dia. Com 137 pedidos no dia, o dono lia
 *      100. Número errado numa tela de dinheiro.
 *   2. Os campos de data ao lado de "Filtrar" eram decorativos: o botão não
 *      tinha ação e o período nunca chegava ao servidor.
 *
 * A trava contra o defeito 1 é estrutural, não um comentário pedindo cuidado:
 * o total EXIBIDO só pode sair de `periodTotalFromResponse()`, que lê o `total`
 * contado pelo Postgres com o MESMO `where` que produziu a lista. O componente
 * não recebe nenhum caminho alternativo para derivar esse número da página.
 *
 * A trava contra o defeito 2 é a mesma peça: o período escolhido vira `from`/`to`
 * na URL da lista (`ordersListUrl`), então filtrar muda a consulta no banco — e,
 * como o KPI lê o `total` DESSA resposta, filtro e número não têm como divergir.
 *
 * Corte de dia: meia-noite de Brasília (03:00 UTC), o mesmo de
 * `dashboard-periods.ts`. Assim "Total hoje" no painel de Pedidos bate com
 * "Hoje" no dashboard, em vez de seguir o fuso do navegador.
 *
 * Tudo puro: sem I/O, sem React. `now` é injetável para teste determinístico.
 */

const DAY_MS      = 86_400_000;
const BRT_OFFSET  = 3 * 3_600_000; // BRT = UTC-3

/**
 * Tamanho da página da lista — o teto do que a tela carrega de uma vez, e o
 * mesmo número que a nota de rodapé anuncia ao lojista. Um só lugar: se ele
 * mudar e o aviso continuar dizendo 100, a tela volta a mentir.
 * (É também o máximo aceito por `orderListQuerySchema`.)
 */
export const ORDERS_PAGE_LIMIT = 100;

/** Período fechado, pronto para virar query — `to` é INCLUSIVO (a API usa `lte`). */
export interface OrdersPeriod {
  from:  Date;
  to:    Date;
  /** "05/08" para um dia, "01/08 – 04/08" para faixa. Vai para a tela. */
  label: string;
}

export interface PeriodInputs {
  /** "YYYY-MM-DD" vindo do <input type="date">, ou "" quando vazio. */
  from: string;
  to:   string;
}

export type ApplyPeriodResult =
  | { ok: true;  period: OrdersPeriod | null }
  | { ok: false; error: string };

/** Resposta paginada de GET /api/orders, na forma em que o painel a consome. */
export interface OrdersListResponse<T = unknown> {
  data:  T[];
  total: number;
  page:  number;
  limit: number;
}

// ─── Dia civil de Brasília ────────────────────────────────────────────────────

/** Meia-noite BRT (03:00 UTC) de hoje + offsetDays. */
export function brazilDayStart(now: Date, offsetDays = 0): Date {
  const brt = new Date(now.getTime() - BRT_OFFSET);
  return new Date(Date.UTC(
    brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + offsetDays,
    3, 0, 0, 0,
  ));
}

/** "YYYY-MM-DD" → meia-noite BRT daquele dia. `null` se o formato não bater. */
export function parseDayInput(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T03:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** "2026-08-05" → "05/08". */
export function formatDayLabel(s: string): string {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
}

/** O dia de hoje inteiro, em dia civil de Brasília. */
export function todayPeriod(now: Date): OrdersPeriod {
  const from = brazilDayStart(now, 0);
  const to   = new Date(from.getTime() + DAY_MS - 1);
  const iso  = new Date(from.getTime() - BRT_OFFSET).toISOString().slice(0, 10);
  return { from, to, label: formatDayLabel(iso) };
}

// ─── O que o botão "Filtrar" faz ──────────────────────────────────────────────

/**
 * Traduz o que está nos dois campos de data no período que vai ao servidor.
 *
 * - Ambos vazios            → `period: null` (sem filtro: a lista operacional).
 * - Só um lado preenchido   → filtro aberto daquele lado.
 * - Data final < inicial    → ERRO VISÍVEL. Nunca devolver lista vazia em
 *                             silêncio: lista vazia parece "não teve pedido".
 * - Data ilegível           → ERRO VISÍVEL, pelo mesmo motivo.
 *
 * O dia final é INCLUSIVO: quem digita 04/08 quer o dia 04 inteiro, não até a
 * meia-noite do 04.
 */
export function applyDateInputs(inputs: PeriodInputs): ApplyPeriodResult {
  const rawFrom = inputs.from.trim();
  const rawTo   = inputs.to.trim();

  if (!rawFrom && !rawTo) return { ok: true, period: null };

  const fromDay = rawFrom ? parseDayInput(rawFrom) : null;
  const toDay   = rawTo   ? parseDayInput(rawTo)   : null;

  if (rawFrom && !fromDay) return { ok: false, error: "Data inicial inválida." };
  if (rawTo   && !toDay)   return { ok: false, error: "Data final inválida." };

  if (fromDay && toDay && toDay.getTime() < fromDay.getTime()) {
    return { ok: false, error: "A data final é anterior à inicial." };
  }

  // `to` inclusivo: fim do dia escolhido.
  const from = fromDay ?? new Date(0);
  const to   = toDay ? new Date(toDay.getTime() + DAY_MS - 1) : new Date(8.64e15);

  const label =
    rawFrom && rawTo
      ? rawFrom === rawTo
        ? formatDayLabel(rawFrom)
        : `${formatDayLabel(rawFrom)} – ${formatDayLabel(rawTo)}`
      : rawFrom
        ? `a partir de ${formatDayLabel(rawFrom)}`
        : `até ${formatDayLabel(rawTo)}`;

  return { ok: true, period: { from, to, label } };
}

// ─── URLs (o filtro chega ao banco, não ao array do cliente) ──────────────────

function rangeParams(period: OrdersPeriod): string {
  const parts: string[] = [];
  // `new Date(0)` / `new Date(8.64e15)` são as bordas "aberto deste lado":
  // não viram parâmetro, senão a API receberia uma data sem sentido.
  if (period.from.getTime() > 0)     parts.push(`from=${encodeURIComponent(period.from.toISOString())}`);
  if (period.to.getTime()   < 8.64e15) parts.push(`to=${encodeURIComponent(period.to.toISOString())}`);
  return parts.join("&");
}

/**
 * URL da LISTA. Com período, o recorte é feito no banco — não no cliente.
 *
 * `status` existe por um motivo específico: `AWAITING_PAYMENT` é excluído da
 * lista operacional por padrão (não é trabalho de cozinha), e a ÚNICA forma de
 * alcançá-lo é pedindo por ele. É para cá que o alerta "N pagamentos pendentes"
 * aponta. Sem este parâmetro chegar ao servidor, o alerta abriria uma tela vazia
 * — que foi exatamente o defeito de 13/08/2026.
 */
export function ordersListUrl(
  period: OrdersPeriod | null,
  limit: number,
  status?: string | null,
): string {
  const parts: string[] = [`limit=${limit}`];
  if (period) {
    const r = rangeParams(period);
    if (r) parts.push(r);
  }
  if (status) parts.push(`status=${encodeURIComponent(status)}`);
  return `/api/orders?${parts.join("&")}`;
}

/**
 * URL da CONTAGEM do dia, usada só quando não há período aplicado (o KPI
 * "Total hoje" precisa do dia, enquanto a lista continua mostrando o fluxo
 * operacional recente). `limit=1` porque só interessa o `total`.
 */
export function todayCountUrl(now: Date): string {
  return ordersListUrl(todayPeriod(now), 1);
}

// ─── O número do KPI ──────────────────────────────────────────────────────────

/**
 * A ÚNICA origem permitida do total exibido: a contagem do servidor.
 *
 * `res.data.length` é o tamanho da PÁGINA (teto de 100) — foi exatamente ele que
 * mentia para o lojista. `res.total` é `prisma.order.count()` com o mesmo
 * `where` da lista. Devolve `null` quando ainda não há resposta (carregando) ou
 * quando a resposta não veio íntegra: nesses casos a tela mostra "—", nunca 0,
 * porque 0 é um número e um número errado é pior que a ausência dele.
 */
export function periodTotalFromResponse(res: OrdersListResponse | null | undefined): number | null {
  if (!res || typeof res.total !== "number" || !Number.isFinite(res.total)) return null;
  return res.total;
}

/** O que o KPI exibe. `null` (carregando/erro) vira "—", jamais 0. */
export function formatPeriodTotal(total: number | null): string {
  return total === null ? "—" : String(total);
}

/** O rótulo ao lado do número — precisa dizer o período que o número cobre. */
export function periodTotalLabel(period: OrdersPeriod | null): string {
  if (!period) return "Total hoje";
  return `Total · ${period.label}`;
}

/** Extrai lista + total da resposta da API, ou `null` se o formato não bater. */
export function parseOrdersListResponse<T>(
  json: unknown,
): OrdersListResponse<T> | null {
  const root = json as { success?: boolean; data?: OrdersListResponse<T> } | null;
  if (!root?.success) return null;
  const page = root.data;
  if (!page || !Array.isArray(page.data) || typeof page.total !== "number") return null;
  return page;
}
