/**
 * CustomerMetricsSyncService
 *
 * Single source of truth for updating Customer.totalOrders, totalSpend, and
 * lastOrderAt from confirmed/paid orders.
 *
 * Design principles:
 *   - Idempotent: Order.crmSyncedAt guards against double-counting.
 *     Once set, no sync will increment counters for that order again.
 *   - Transactional: the customer update + crmSyncedAt stamp happen atomically.
 *   - Tenant-safe: all queries are scoped to restaurantId where applicable.
 *   - Rebuild-safe: rebuildCustomerMetrics() recalculates from source of truth
 *     and also stamps crmSyncedAt on every counted order.
 *
 * CRM-countable order definition:
 *   - pay_on_delivery / pay_on_pickup: Order.status is CONFIRMED or beyond (not CANCELLED/PENDING/AWAITING_PAYMENT)
 *   - pay_now (online):               Payment.status === "PAID"
 *   - no payment record (draft-confirmed via dashboard): Order.status is CONFIRMED or beyond
 *   - CANCELLED orders are NEVER countable, regardless of payment state
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { isCrmCountable } from "./crm-countable";
import { computeTier, computeSegment } from "./crm-helpers";
export { isCrmCountable } from "./crm-countable";

// ── Types ──────────────────────────────────────────────────────────────────────

type SyncResult = "synced" | "skipped_already_synced" | "skipped_not_countable" | "skipped_no_customer" | "skipped_guest";

// ── Service ────────────────────────────────────────────────────────────────────

export class CustomerMetricsSyncService {
  /**
   * Sync a single order's value into the owning customer's CRM metrics.
   *
   * Safe to call multiple times — crmSyncedAt is checked inside a transaction
   * so concurrent calls cannot both succeed.
   *
   * @param orderId  The Order.id to sync.
   * @param source   Optional label for log messages (e.g. "mp_webhook", "finalize").
   * @returns        A result string describing what happened.
   */
  static async syncOrderToCustomerMetrics(
    orderId: string,
    source = "direct"
  ): Promise<SyncResult> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id:           true,
        customerId:   true,
        status:       true,
        total:        true,
        crmSyncedAt:  true,
        payment: {
          select: { paymentMode: true, status: true },
        },
        customer: {
          select: { isGuest: true },
        },
      },
    });

    if (!order) {
      console.warn(`[CRMSync:${source}] Order ${orderId} not found — skipping`);
      return "skipped_not_countable";
    }

    if (order.crmSyncedAt) {
      return "skipped_already_synced";
    }

    if (!order.customerId) {
      return "skipped_no_customer";
    }

    if (order.customer?.isGuest) {
      return "skipped_guest";
    }

    if (!isCrmCountable(order)) {
      return "skipped_not_countable";
    }

    const amount = new Decimal(order.total);
    const now    = new Date();

    await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction to guard against concurrent syncs
      const fresh = await tx.order.findUnique({
        where:  { id: orderId },
        select: { crmSyncedAt: true },
      });
      if (fresh?.crmSyncedAt) return; // Another call won the race — do nothing

      // Read current totals so we can compute the new tier/segment atomically
      const current = await tx.customer.findUnique({
        where:  { id: order.customerId! },
        select: { totalSpend: true, totalOrders: true },
      });

      const newTotalSpend  = Number(current?.totalSpend  ?? 0) + Number(amount);
      const newTotalOrders = (current?.totalOrders ?? 0) + 1;
      const tier    = computeTier(newTotalSpend);
      const segment = computeSegment(now, newTotalOrders); // now = lastOrderAt after this sync

      await tx.customer.update({
        where: { id: order.customerId! },
        data: {
          totalOrders: newTotalOrders,
          totalSpend:  new Decimal(newTotalSpend),
          lastOrderAt: now,
          tier,
          segment,
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data:  { crmSyncedAt: now },
      });
    });

    console.info(
      `[CRMSync:${source}] Synced order ${orderId} → customer ${order.customerId} (+R$${Number(amount).toFixed(2)})`
    );
    return "synced";
  }

  /**
   * Rebuild CRM metrics for a single customer from source-of-truth orders.
   *
   * Recalculates totalOrders, totalSpend, lastOrderAt from scratch.
   * Also stamps crmSyncedAt on all counted orders so incremental syncs
   * do not double-count them afterward.
   *
   * Does NOT use crmSyncedAt as input — always recalculates from actual order data.
   */
  static async rebuildCustomerMetrics(customerId: string): Promise<{
    ordersFound:   number;
    ordersCounted: number;
    totalSpend:    number;
  }> {
    const orders = await prisma.order.findMany({
      where:  { customerId },
      select: {
        id:         true,
        status:     true,
        total:      true,
        createdAt:  true,
        importedAt: true,  // historical date for imported orders
        payment: { select: { paymentMode: true, status: true } },
      },
    });

    const countable = orders.filter(isCrmCountable);

    const totalOrders = countable.length;
    const totalSpend  = countable.reduce((s, o) => s + Number(o.total), 0);
    // For imported orders, importedAt holds the real historical date; fall back to createdAt.
    const lastOrderAt = countable.length > 0
      ? countable.reduce((latest, o) => {
          const orderDate = o.importedAt ?? o.createdAt;
          return orderDate > latest ? orderDate : latest;
        }, countable[0]!.importedAt ?? countable[0]!.createdAt)
      : null;

    const now = new Date();
    const tier    = computeTier(totalSpend);
    const segment = computeSegment(lastOrderAt, totalOrders);

    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          totalOrders,
          totalSpend: new Decimal(totalSpend),
          lastOrderAt,
          tier,
          segment,
        },
      });

      // Stamp crmSyncedAt on every countable order that lacks it
      const unsyncedIds = countable
        .filter((o) => {
          // orders fetched above don't include crmSyncedAt; we stamp all of them
          // (updateMany with crmSyncedAt: null guard prevents redundant writes)
          return true;
        })
        .map((o) => o.id);

      if (unsyncedIds.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: unsyncedIds }, crmSyncedAt: null },
          data:  { crmSyncedAt: now },
        });
      }
    });

    return { ordersFound: orders.length, ordersCounted: totalOrders, totalSpend };
  }

  /**
   * Rebuild CRM metrics for every customer in a restaurant.
   *
   * Returns a summary of what was processed.
   */
  static async rebuildRestaurantCustomerMetrics(restaurantId: string): Promise<{
    customersProcessed: number;
    customersUpdated:   number;
    totalOrdersCounted: number;
    errors:             number;
  }> {
    const customers = await prisma.customer.findMany({
      where:  { restaurantId },
      select: { id: true },
    });

    let customersUpdated   = 0;
    let totalOrdersCounted = 0;
    let errors             = 0;

    for (const { id } of customers) {
      try {
        const result = await this.rebuildCustomerMetrics(id);
        customersUpdated++;
        totalOrdersCounted += result.ordersCounted;
      } catch (err) {
        console.error(`[CRMSync:rebuild] Failed for customer ${id}:`, err);
        errors++;
      }
    }

    return {
      customersProcessed: customers.length,
      customersUpdated,
      totalOrdersCounted,
      errors,
    };
  }
}
