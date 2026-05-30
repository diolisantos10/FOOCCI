/**
 * Human-friendly per-restaurant sequential order numbers.
 *
 * Each restaurant carries a monotonic `lastOrderNumber` counter. New orders
 * claim the next value by atomically incrementing that counter INSIDE the
 * same transaction that creates the order. The row-level lock on the
 * restaurant row serialises concurrent order creation for that restaurant,
 * so numbers are gap-tolerant-but-unique and never collide. A
 * `@@unique([restaurantId, orderNumber])` constraint is the final guard.
 *
 * Legacy orders created before this feature have `orderNumber = null` and
 * fall back to the cuid suffix for display (see `formatOrderNumber`).
 */

import type { Prisma } from "@prisma/client";

/**
 * Claim the next sequential order number for a restaurant.
 * MUST be called inside the same transaction that creates the order.
 */
export async function assignOrderNumber(
  tx: Prisma.TransactionClient,
  restaurantId: string,
): Promise<number> {
  const updated = await tx.restaurant.update({
    where:  { id: restaurantId },
    data:   { lastOrderNumber: { increment: 1 } },
    select: { lastOrderNumber: true },
  });
  return updated.lastOrderNumber;
}

/**
 * Render an order's display number.
 * - Sequential when available: `#001`, `#042`, `#1234`.
 * - Falls back to the cuid suffix for legacy orders: `#A1B2C3`.
 */
export function formatOrderNumber(
  orderNumber: number | null | undefined,
  id: string,
): string {
  if (orderNumber != null) {
    return `#${String(orderNumber).padStart(3, "0")}`;
  }
  return `#${id.slice(-6).toUpperCase()}`;
}
