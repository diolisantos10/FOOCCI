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
 * The alarm stops when staff move the order forward (PREPARING/READY/… leave the
 * ring-set) or the recency window lapses (safety net so a forgotten order doesn't
 * ring forever; the primary stop is staff acting on it).
 */

export interface AlertOrderLike {
  status: string;
  /** ISO string or Date — used only for the recency safety-net. */
  createdAt?: string | Date | null;
  paymentProviderName?: string | null;
  paymentStatus?: string | null;
}

/** Statuses that mean "just arrived, not yet being prepared". */
const NEW_ORDER_STATUSES = new Set(["PENDING", "CONFIRMED"]);

/** Recency safety-net: a new order stops ringing on its own after this long even
 *  if nobody advanced it. The primary stop is staff moving it to PREPARING. */
export const ORDER_ALARM_MAX_AGE_MS = 15 * 60 * 1000; // 15 min

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
 * (PENDING or CONFIRMED), not an online payment still pending, and — when a
 * recency window is given — created within it.
 */
export function pendingActionOrderIds<T extends AlertOrderLike & { id: string }>(
  orders: T[],
  opts?: { now?: number; maxAgeMs?: number },
): string[] {
  const now = opts?.now ?? Date.now();
  const maxAgeMs = opts?.maxAgeMs;
  return orders
    .filter((o) => NEW_ORDER_STATUSES.has(o.status) && !isPaymentPendingOrder(o))
    .filter((o) => {
      if (!maxAgeMs) return true;
      const t = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
      // No/invalid timestamp → don't suppress (fail toward ringing, not silence).
      if (!Number.isFinite(t)) return true;
      return now - t <= maxAgeMs;
    })
    .map((o) => o.id);
}
