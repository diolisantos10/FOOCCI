/**
 * Selector for the new-order alarm (mirrors handoff-alert.ts's pattern).
 *
 * A new order needs the alarm while it has just arrived and nobody has started
 * handling it yet. That means status PENDING **or CONFIRMED**:
 *   - Pay-on-delivery / pickup orders are created PENDING and immediately set to
 *     CONFIRMED by the checkout (they never sit in PENDING), so a PENDING-only
 *     alarm never caught them — the #1 reason "o som do pedido não toca".
 *   - Online (Pix) orders that are still awaiting payment are NEVER rung (that is
 *     a payment concern, not a kitchen one) — see isPaymentPendingOrder.
 *
 * The SOUND is bounded per status (raio-x 2, 2026-07-14 — "apita em página
 * aleatória" was partly orders beeping app-wide for 15 min each):
 *   - PENDING  rings up to 15 min — it BLOCKS the customer (needs explicit accept).
 *   - CONFIRMED rings up to 3 min — it's a heads-up (ticket already auto-printed);
 *     after that it stays visible on the Pedidos screen without app-wide noise.
 * The primary stop is staff acting on the order — and WHO KNOWS that is the
 * SERVER (Order.alarmAckAt), not one browser tab (2026-08-08, "o pedido já foi
 * aceito mas o som continua"). Accepting moves PENDING→CONFIRMED, which is still
 * inside the ring-set, so the only thing that used to silence it was a Set living
 * inside the tab where the click happened — fed by a window event that never
 * reaches another tab, another device, or the same tab after a reload, while the
 * tab that actually rings is elected across tabs (Web Locks). The stamp below is
 * the durable answer; the tab-local memory stays only as an instant shortcut.
 * Mirrors what Conversation.handoffAlarmAckAt already did for the chat alarm.
 */

export interface AlertOrderLike {
  status: string;
  /** ISO string or Date — used for the per-status sound windows. */
  createdAt?: string | Date | null;
  paymentProviderName?: string | null;
  paymentStatus?: string | null;
  /** Server-side "someone at the store already acted on this order" stamp
   *  (Order.alarmAckAt). Set when the owner accepts / advances / rejects it, or
   *  confirms its payment by hand. Silences the alarm in EVERY tab and EVERY
   *  device, and survives a page reload — see the note below. */
  alarmAckAt?: string | Date | null;
}

/** SOUND window for a PENDING order (customer blocked on explicit accept). */
export const PENDING_ORDER_SOUND_MAX_AGE_MS = 15 * 60 * 1000; // 15 min

/** SOUND window for a CONFIRMED arrival (heads-up; ticket already printed). */
export const CONFIRMED_ORDER_SOUND_MAX_AGE_MS = 3 * 60 * 1000; // 3 min

const SOUND_WINDOW_BY_STATUS: Record<string, number> = {
  PENDING:   PENDING_ORDER_SOUND_MAX_AGE_MS,
  CONFIRMED: CONFIRMED_ORDER_SOUND_MAX_AGE_MS,
};

export function isPaymentPendingOrder(order: AlertOrderLike): boolean {
  if (order.status === "AWAITING_PAYMENT") return true;
  if (
    order.paymentProviderName === "mercadopago" &&
    (order.paymentStatus === "LINK_SENT" || order.paymentStatus === "PENDING")
  ) return true;
  return false;
}

/** Epoch ms of a timestamp, or null when absent/unreadable. */
function toMs(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * IDs of orders that should currently ring the new-order alarm: newly-arrived
 * (PENDING or CONFIRMED), **nobody at the store has acted on it yet**
 * (alarmAckAt), not an online payment still pending, and inside that status's
 * sound window.
 *
 * Every "I don't know" fails toward RINGING: a missing/invalid createdAt rings,
 * and an unreadable alarmAckAt does NOT silence. A silent alarm is worse than a
 * redundant beep — do not invert this.
 */
export function pendingActionOrderIds<T extends AlertOrderLike & { id: string }>(
  orders: T[],
  opts?: { now?: number },
): string[] {
  const now = opts?.now ?? Date.now();
  return orders
    .filter((o) => {
      const windowMs = SOUND_WINDOW_BY_STATUS[o.status];
      if (windowMs === undefined || isPaymentPendingOrder(o)) return false;
      // Alguém da loja já agiu neste pedido (em QUALQUER aba/aparelho) → silêncio.
      if (toMs(o.alarmAckAt) !== null) return false;
      const t = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
      if (!Number.isFinite(t)) return true; // no timestamp → don't suppress
      return now - t <= windowMs;
    })
    .map((o) => o.id);
}

/** One row of GET /api/orders, with only the fields the alarm reads. */
export interface OrdersApiRow {
  id: string;
  status: string;
  createdAt?: string | Date | null;
  /** Carimbo do servidor de "alguém já agiu" — precisa vir do payload até aqui.
   *  Campo que o servidor manda e o mapeamento esquece de copiar é mudança de
   *  comportamento silenciosa: por isso o mapeamento mora aqui, sob teste. */
  alarmAckAt?: string | Date | null;
  payment?: { providerName?: string | null; status?: string | null } | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * The ring-set for ONE poll cycle, taken straight from the GET /api/orders body.
 *
 * Lives here — and not inline in the polling component — because the mapping is
 * part of the alarm's decision: a field the server sends and the mapping forgets
 * to copy is a silent behaviour change with no error anywhere.
 *
 * Returns **null** when the payload is unusable (server down, error body, shape
 * change). Null means "não sei", and the caller must KEEP its current alarm
 * state instead of syncing an empty set — a silent alarm is worse than a
 * redundant beep, so uncertainty never silences.
 */
export function ringIdsFromOrdersResponse(
  payload: unknown,
  opts?: { now?: number },
): string[] | null {
  if (!isRecord(payload)) return null;
  const data = payload.data;
  if (!isRecord(data)) return null;
  const rows = data.data;
  if (!Array.isArray(rows)) return null;

  const mapped: (AlertOrderLike & { id: string })[] = rows
    .filter((r): r is OrdersApiRow => isRecord(r) && typeof r.id === "string")
    .map((o) => ({
      id:                  o.id,
      status:              typeof o.status === "string" ? o.status : "",
      createdAt:           o.createdAt ?? null,
      alarmAckAt:          o.alarmAckAt ?? null,
      paymentProviderName: o.payment?.providerName ?? null,
      paymentStatus:       o.payment?.status ?? null,
    }));

  return pendingActionOrderIds(mapped, opts);
}
