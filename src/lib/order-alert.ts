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
 * The primary stop is staff acting on the order (accept/advance → leaves the
 * ring-set or lands in the engine's resolved memory).
 */

export interface AlertOrderLike {
  status: string;
  /** ISO string or Date — used for the per-status sound windows. */
  createdAt?: string | Date | null;
  paymentProviderName?: string | null;
  paymentStatus?: string | null;
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

/**
 * IDs of orders that should currently ring the new-order alarm: newly-arrived
 * (PENDING or CONFIRMED), not an online payment still pending, and inside that
 * status's sound window. A missing/invalid createdAt fails toward ringing —
 * a silent alarm is worse than a redundant beep.
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
      const t = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
      if (!Number.isFinite(t)) return true; // no timestamp → don't suppress
      return now - t <= windowMs;
    })
    .map((o) => o.id);
}
