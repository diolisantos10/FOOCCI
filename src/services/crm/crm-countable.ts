/**
 * CRM-countable order definition — pure, no DB imports.
 *
 * An order counts toward Customer.totalOrders / totalSpend when:
 *   - pay_on_delivery / pay_on_pickup : Order.status is CONFIRMED or beyond (not CANCELLED/PENDING/AWAITING_PAYMENT)
 *   - pay_now (online)               : Payment.status === "PAID"
 *   - no payment record              : Order.status is CONFIRMED or beyond (dashboard draft-confirm path)
 *   - CANCELLED orders               : NEVER countable regardless of payment state
 *
 * Exported separately so scripts and tests can import without pulling in prisma.
 */

export type CountableCheckOrder = {
  status: string;
  payment: { paymentMode: string; status: string } | null;
};

const CONFIRMED_STATUSES = new Set([
  "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED",
]);

export function isCrmCountable(order: CountableCheckOrder): boolean {
  if (order.status === "CANCELLED") return false;
  if (order.status === "PENDING" || order.status === "AWAITING_PAYMENT") return false;

  if (!order.payment) {
    return CONFIRMED_STATUSES.has(order.status);
  }

  const { paymentMode, status: paymentStatus } = order.payment;

  if (paymentMode === "PAY_NOW") {
    return paymentStatus === "PAID";
  }

  if (paymentMode === "PAY_ON_DELIVERY" || paymentMode === "PAY_ON_PICKUP") {
    return CONFIRMED_STATUSES.has(order.status);
  }

  return false;
}
