/**
 * Selector for the new-order alarm (mirrors handoff-alert.ts's pattern).
 *
 * An order needs the alarm while it is PENDING (awaiting staff accept) and NOT
 * a Pix/online payment still waiting for confirmation (that state is a payment
 * concern, not a kitchen one — it never rings the "novo pedido" alarm).
 */

export interface AlertOrderLike {
  status: string;
  paymentProviderName?: string | null;
  paymentStatus?: string | null;
}

export function isPaymentPendingOrder(order: AlertOrderLike): boolean {
  if (order.status === "AWAITING_PAYMENT") return true;
  if (
    order.paymentProviderName === "mercadopago" &&
    (order.paymentStatus === "LINK_SENT" || order.paymentStatus === "PENDING")
  ) return true;
  return false;
}

/** IDs of orders currently awaiting staff accept — the base of the new-order alarm. */
export function pendingActionOrderIds<T extends AlertOrderLike & { id: string }>(orders: T[]): string[] {
  return orders.filter((o) => o.status === "PENDING" && !isPaymentPendingOrder(o)).map((o) => o.id);
}
