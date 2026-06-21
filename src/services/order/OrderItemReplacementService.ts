/**
 * OrderItemReplacementService
 *
 * Replaces a single OrderItem inside a confirmed order without touching the
 * external payment transaction (Stone, Pix, Mercado Pago).
 *
 * Side-effects:
 *   1. Removes old OrderItem, inserts new OrderItem (same transaction).
 *   2. Recalculates order subtotal + total from DB.
 *   3. Creates an OrderEditLog entry for audit trail.
 *   4. Rebuilds customer CRM metrics (totalSpend, totalOrders, lastOrderAt).
 *
 * What is NOT touched:
 *   - Payment.amount — staff must collect/refund the difference manually.
 *   - Saipos POS records — already sent; only internal Foocci data is changed.
 *   - Order status — stays as-is unless caller explicitly changes it.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, type ServiceResult } from "@/types";
import { CustomerMetricsSyncService } from "@/services/crm/CustomerMetricsSyncService";
import { resolveVariantPrice } from "@/services/menu/MenuPricingService";
import type { ReplaceOrderItemInput } from "@/validators/order";

// Orders in these statuses can be edited freely.
const EDITABLE_STATUSES = new Set([
  "PENDING",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "PREPARING",
]);

// Orders in these statuses can be edited but emit a warning.
const EDITABLE_WITH_WARNING_STATUSES = new Set(["READY", "OUT_FOR_DELIVERY"]);

export interface ReplacementResult {
  orderId:        string;
  editLogId:      string;
  previousTotal:  number;
  newTotal:       number;
  priceDiff:      number;
  warning?:       string; // set when editing a late-stage order
}

export class OrderItemReplacementService {
  static async replaceItem(
    restaurantId: string,
    orderId:      string,
    input:        ReplaceOrderItemInput,
    userId?:      string,
  ): Promise<ServiceResult<ReplacementResult>> {

    // ── 1. Load order ─────────────────────────────────────────────────────────
    const order = await prisma.order.findUnique({
      where:   { id: orderId },
      include: {
        items: true,
        payment: { select: { paymentMode: true, status: true } },
      },
    });

    if (!order || order.restaurantId !== restaurantId) {
      return serviceFail("Pedido não encontrado", 404);
    }

    // ── 2. Status guard ───────────────────────────────────────────────────────
    let warning: string | undefined;

    if (!EDITABLE_STATUSES.has(order.status) && !EDITABLE_WITH_WARNING_STATUSES.has(order.status)) {
      return serviceFail(
        `Pedidos com status "${order.status}" não podem ser alterados. Cancele ou reabra o pedido antes de editar.`,
        422,
      );
    }
    if (EDITABLE_WITH_WARNING_STATUSES.has(order.status)) {
      warning = `Atenção: o pedido já está em status "${order.status}". A alteração será aplicada, mas revise o impacto operacional.`;
    }

    // ── 3. Validate target item belongs to this order ─────────────────────────
    const oldItem = order.items.find((i) => i.id === input.orderItemId);
    if (!oldItem) {
      return serviceFail("Item não encontrado neste pedido", 404);
    }

    // ── 4. Validate new product belongs to this restaurant ────────────────────
    const newMenuItem = await prisma.menuItem.findUnique({
      where:   { id: input.newMenuItemId },
      include: {
        category: { select: { restaurantId: true, id: true, name: true } },
      },
    });

    if (!newMenuItem || newMenuItem.category.restaurantId !== restaurantId) {
      return serviceFail("Produto não encontrado", 404);
    }

    // ── 5. Server-side price calculation ─────────────────────────────────────
    // Never trust the client price. Recalculate from DB.
    let unitPrice = new Decimal(newMenuItem.price);

    // Variant — validate it exists and belongs to this item
    let resolvedVariantName: string | null = null;
    if (input.newVariantId) {
      const variant = await prisma.menuItemVariant.findUnique({
        where: { id: input.newVariantId },
      });
      if (!variant || variant.menuItemId !== newMenuItem.id) {
        return serviceFail("Variante inválida para este produto", 422);
      }
      // Variant price is optional — a blank price inherits the product's price.
      unitPrice = new Decimal(resolveVariantPrice(newMenuItem, variant, "DEFAULT"));
      resolvedVariantName = input.newVariantName ?? variant.name;
    } else if (input.newVariantName) {
      resolvedVariantName = input.newVariantName;
    }

    // Option groups — validate and add prices
    const resolvedOptions: { groupId: string; optionItemId: string; name: string; price: number }[] = [];
    for (const sel of input.newOptionSelections) {
      const optItem = await prisma.optionGroupItem.findUnique({
        where:   { id: sel.optionItemId },
        include: { group: { select: { menuItemId: true } } },
      });
      if (!optItem || optItem.group.menuItemId !== newMenuItem.id || optItem.groupId !== sel.groupId) {
        return serviceFail(`Opção inválida: ${sel.name}`, 422);
      }
      unitPrice = unitPrice.plus(new Decimal(optItem.price));
      resolvedOptions.push({ groupId: sel.groupId, optionItemId: sel.optionItemId, name: optItem.name, price: Number(optItem.price) });
    }

    // Extras — validate and add prices
    const resolvedExtras: { extraId: string; name: string; price: number; quantity: number }[] = [];
    for (const ext of input.newExtras) {
      const extra = await prisma.menuItemExtra.findUnique({
        where: { id: ext.extraId },
      });
      if (!extra || extra.menuItemId !== newMenuItem.id) {
        return serviceFail(`Extra inválido: ${ext.name}`, 422);
      }
      unitPrice = unitPrice.plus(new Decimal(extra.price).times(ext.quantity));
      resolvedExtras.push({ extraId: ext.extraId, name: extra.name, price: Number(extra.price), quantity: ext.quantity });
    }

    const newItemTotal = unitPrice.times(input.quantity);

    // ── 6. Build snapshots ────────────────────────────────────────────────────
    const addonsJson =
      resolvedOptions.length > 0 || resolvedExtras.length > 0
        ? { options: resolvedOptions, extras: resolvedExtras }
        : null;

    const previousItemData = {
      name:        oldItem.name,
      price:       Number(oldItem.price),
      quantity:    oldItem.quantity,
      variantName: oldItem.variantName,
      addonsJson:  oldItem.addonsJson,
      total:       Number(oldItem.total),
    };

    const newItemData = {
      name:        newMenuItem.name,
      price:       Number(unitPrice),
      quantity:    input.quantity,
      variantName: resolvedVariantName,
      addonsJson,
      total:       Number(newItemTotal),
    };

    const previousOrderTotal = new Decimal(order.total);

    // ── 7. Atomic transaction ─────────────────────────────────────────────────
    let editLogId: string;
    let newOrderTotal: Decimal;

    await prisma.$transaction(async (tx) => {
      // Remove old item
      await tx.orderItem.delete({ where: { id: oldItem.id } });

      // Create new item
      await tx.orderItem.create({
        data: {
          orderId:      orderId,
          menuItemId:   newMenuItem.id,
          name:         newMenuItem.name,
          price:        unitPrice,
          quantity:     input.quantity,
          notes:        input.notes ?? null,
          total:        newItemTotal,
          categoryId:   newMenuItem.categoryId,
          categoryName: newMenuItem.category.name,
          variantName:  resolvedVariantName,
          addonsJson:   addonsJson as object ?? undefined,
        },
      });

      // Recalculate order subtotal from remaining items (source of truth)
      const allItems = await tx.orderItem.findMany({
        where:  { orderId },
        select: { price: true, quantity: true },
      });
      const newSubtotal = allItems.reduce(
        (acc, item) => acc.plus(new Decimal(item.price).times(item.quantity)),
        new Decimal(0),
      );
      newOrderTotal = newSubtotal.plus(new Decimal(order.deliveryFee)).minus(new Decimal(order.discount));

      await tx.order.update({
        where: { id: orderId },
        data:  { subtotal: newSubtotal, total: newOrderTotal },
      });

      // Create audit log entry
      const priceDiff = newOrderTotal.minus(previousOrderTotal);
      const log = await tx.orderEditLog.create({
        data: {
          orderId,
          restaurantId,
          userId:           userId ?? null,
          previousItemId:   oldItem.id,
          previousItemName: oldItem.name,
          previousItemQty:  oldItem.quantity,
          previousItemData,
          newItemName:      newMenuItem.name,
          newItemQty:       input.quantity,
          newItemData,
          previousTotal:    previousOrderTotal,
          newTotal:         newOrderTotal,
          priceDiff,
          reason:           input.reason,
          reasonNote:       input.reasonNote ?? null,
        },
      });
      editLogId = log.id;
    });

    // ── 8. Rebuild customer metrics (outside transaction — best-effort) ────────
    try {
      await CustomerMetricsSyncService.rebuildCustomerMetrics(order.customerId);
    } catch (err) {
      console.error("[OrderItemReplacementService] Customer metrics rebuild failed:", err);
    }

    const priceDiffNum = Number(newOrderTotal!) - Number(previousOrderTotal);

    return serviceOk({
      orderId,
      editLogId:     editLogId!,
      previousTotal: Number(previousOrderTotal),
      newTotal:      Number(newOrderTotal!),
      priceDiff:     priceDiffNum,
      warning,
    });
  }
}
