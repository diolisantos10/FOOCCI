/**
 * OrderDeleteService — permanent, destructive deletion of an order.
 *
 * Authorized callers: OWNER role only.
 *
 * Side-effects on delete:
 *  1. OrderItems   → deleted via Prisma cascade (onDelete: Cascade)
 *  2. Payment      → deleted via Prisma cascade (onDelete: Cascade)
 *  3. OrderDraft   → deleted explicitly (OrderDraftItems cascade from it)
 *  4. Coupon usage → Promotion.usedCount decremented if couponUsageCountedAt was set
 *  5. Customer metrics → rebuilt from remaining orders via CustomerMetricsSyncService
 *
 * What is NOT touched:
 *  - Customer record (never deleted here)
 *  - External payment provider transactions (Mercado Pago, Stone) — handled separately
 *  - Saipos POS records — Foocci removes its internal reference only
 *
 * TODO: When staff accounts and granular permissions are implemented,
 * destructive delete actions must remain restricted to MASTER_ADMIN / OWNER only.
 */

import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, type ServiceResult } from "@/types";
import { CustomerMetricsSyncService } from "@/services/crm/CustomerMetricsSyncService";
import { CustomerCouponService } from "@/services/crm/CustomerCouponService";

export class OrderDeleteService {
  static async deleteOrder(
    restaurantId: string,
    orderId: string,
  ): Promise<ServiceResult<{ deletedId: string; customerMetricsRebuilt: boolean }>> {

    const order = await prisma.order.findUnique({
      where:  { id: orderId },
      select: {
        id:                   true,
        restaurantId:         true,
        customerId:           true,
        orderDraftId:         true,
        promotionId:          true,
        couponUsageCountedAt: true,
        status:               true,
        total:                true,
      },
    });

    if (!order || order.restaurantId !== restaurantId) {
      return serviceFail("Pedido não encontrado", 404);
    }

    const { customerId, orderDraftId, promotionId, couponUsageCountedAt } = order;

    // Reverse coupon usage if it was counted (best-effort — never block delete)
    if (promotionId && couponUsageCountedAt) {
      await prisma.promotion.updateMany({
        where: { id: promotionId, usedCount: { gt: 0 } },
        data:  { usedCount: { decrement: 1 } },
      }).catch((err) =>
        console.error("[OrderDeleteService] Failed to decrement promotion usedCount:", err)
      );
    }

    // Return any wallet coupon consumed by this order back to the customer.
    await CustomerCouponService.restoreForOrder(orderId).catch((err) =>
      console.error("[OrderDeleteService] Failed to restore wallet coupon:", err)
    );

    // Delete the order — OrderItems and Payment cascade automatically
    await prisma.order.delete({ where: { id: orderId } });

    // Delete the linked OrderDraft if present (OrderDraftItems cascade from it)
    if (orderDraftId) {
      await prisma.orderDraft.delete({ where: { id: orderDraftId } }).catch(() => {
        // OrderDraft may have been unlinked or already deleted — silently ignore
      });
    }

    // Rebuild customer metrics from the remaining orders
    let customerMetricsRebuilt = false;
    try {
      await CustomerMetricsSyncService.rebuildCustomerMetrics(customerId);
      customerMetricsRebuilt = true;
    } catch (err) {
      console.error("[OrderDeleteService] Customer metrics rebuild failed after order delete:", err);
    }

    return serviceOk({ deletedId: orderId, customerMetricsRebuilt });
  }
}
