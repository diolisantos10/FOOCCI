/**
 * OrderDraftService
 *
 * Manages mutable order drafts (cart) before they become confirmed Orders.
 *
 * Key invariants:
 *   - One OPEN draft per customer per restaurant (enforced in getOrCreate)
 *   - All monetary totals are recomputed server-side on every mutation
 *   - confirm() is atomic: marks draft CONFIRMED + creates Order in one tx
 *   - Draft is NEVER deleted – kept for traceability and AI training (Phase 3)
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type {
  CreateDraftInput,
  UpdateDraftInput,
  AddDraftItemInput,
  UpdateDraftItemInput,
  ConfirmDraftInput,
} from "@/validators/order";
import type { Order, OrderDraft, OrderDraftItem } from "@prisma/client";

export type OrderDraftWithItems = OrderDraft & {
  items: (OrderDraftItem & { menuItem: { name: string; isActive: boolean } })[];
  customer: { name: string; phone: string };
  deliveryAddress: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
  } | null;
};

export class OrderDraftService {
  // ─── Private helpers ─────────────────────────────────────────

  private static async recomputeTotals(
    draftId: string,
    deliveryFee?: Decimal
  ): Promise<void> {
    const items = await prisma.orderDraftItem.findMany({
      where: { orderDraftId: draftId },
      select: { quantity: true, unitPrice: true },
    });

    const subtotal = items.reduce(
      (acc, item) =>
        acc.plus(new Decimal(item.unitPrice).times(item.quantity)),
      new Decimal(0)
    );

    const draft = await prisma.orderDraft.findUnique({
      where: { id: draftId },
      select: { deliveryFee: true },
    });

    const fee = deliveryFee ?? draft?.deliveryFee ?? new Decimal(0);
    const totalAmount = subtotal.plus(fee);

    await prisma.orderDraft.update({
      where: { id: draftId },
      data: {
        subtotal,
        deliveryFee: fee,
        totalAmount,
      },
    });
  }

  private static async assertDraftOwnership(
    restaurantId: string,
    draftId: string
  ): Promise<OrderDraft | null> {
    const draft = await prisma.orderDraft.findUnique({
      where: { id: draftId },
    });
    if (!draft || draft.restaurantId !== restaurantId) return null;
    return draft;
  }

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Get the OPEN draft for a customer, or create one if none exists.
   */
  static async getOrCreate(
    restaurantId: string,
    input: CreateDraftInput
  ): Promise<ServiceResult<OrderDraftWithItems>> {
    // Verify customer belongs to tenant
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { restaurantId: true, isActive: true },
    });

    if (!customer || customer.restaurantId !== restaurantId) {
      return serviceFail("Customer not found", 404);
    }

    if (!customer.isActive) {
      return serviceFail("Customer is inactive", 400);
    }

    // Verify delivery address belongs to customer (if provided)
    if (input.deliveryAddressId) {
      const addr = await prisma.address.findUnique({
        where: { id: input.deliveryAddressId },
        select: { customerId: true },
      });
      if (!addr || addr.customerId !== input.customerId) {
        return serviceFail("Delivery address not found for this customer", 404);
      }
    }

    let draft = await prisma.orderDraft.findFirst({
      where: { restaurantId, customerId: input.customerId, status: "OPEN" },
      include: {
        items: { include: { menuItem: { select: { name: true, isActive: true } } } },
        customer: { select: { name: true, phone: true } },
        deliveryAddress: {
          select: { street: true, number: true, neighborhood: true, city: true, state: true },
        },
      },
    });

    if (!draft) {
      draft = await prisma.orderDraft.create({
        data: {
          restaurantId,
          customerId: input.customerId,
          fulfillmentType: input.fulfillmentType,
          deliveryAddressId: input.deliveryAddressId ?? null,
          notes: input.notes ?? null,
          subtotal: new Decimal(0),
          deliveryFee: new Decimal(0),
          totalAmount: new Decimal(0),
        },
        include: {
          items: { include: { menuItem: { select: { name: true, isActive: true } } } },
          customer: { select: { name: true, phone: true } },
          deliveryAddress: {
            select: { street: true, number: true, neighborhood: true, city: true, state: true },
          },
        },
      });
    }

    return serviceOk(draft as OrderDraftWithItems);
  }

  static async getById(
    restaurantId: string,
    draftId: string
  ): Promise<ServiceResult<OrderDraftWithItems>> {
    const draft = await prisma.orderDraft.findUnique({
      where: { id: draftId },
      include: {
        items: { include: { menuItem: { select: { name: true, isActive: true } } } },
        customer: { select: { name: true, phone: true } },
        deliveryAddress: {
          select: { street: true, number: true, neighborhood: true, city: true, state: true },
        },
      },
    });

    if (!draft || draft.restaurantId !== restaurantId) {
      return serviceFail("Draft not found", 404);
    }

    return serviceOk(draft as OrderDraftWithItems);
  }

  static async update(
    restaurantId: string,
    draftId: string,
    input: UpdateDraftInput
  ): Promise<ServiceResult<OrderDraftWithItems>> {
    const draft = await this.assertDraftOwnership(restaurantId, draftId);
    if (!draft) return serviceFail("Draft not found", 404);
    if (draft.status !== "OPEN") return serviceFail("Draft is no longer open", 400);

    if (input.deliveryAddressId !== undefined) {
      const addr = await prisma.address.findUnique({
        where: { id: input.deliveryAddressId ?? "" },
        select: { customerId: true },
      });
      if (input.deliveryAddressId && (!addr || addr.customerId !== draft.customerId)) {
        return serviceFail("Delivery address not found for this customer", 404);
      }
    }

    const deliveryFee =
      input.deliveryFee !== undefined ? new Decimal(input.deliveryFee) : undefined;

    await prisma.orderDraft.update({
      where: { id: draftId },
      data: {
        ...(input.fulfillmentType !== undefined && { fulfillmentType: input.fulfillmentType }),
        ...(input.deliveryAddressId !== undefined && {
          deliveryAddressId: input.deliveryAddressId ?? null,
        }),
        ...(input.notes !== undefined && { notes: input.notes ?? null }),
      },
    });

    await this.recomputeTotals(draftId, deliveryFee);

    return this.getById(restaurantId, draftId);
  }

  static async addItem(
    restaurantId: string,
    draftId: string,
    input: AddDraftItemInput
  ): Promise<ServiceResult<OrderDraftWithItems>> {
    const draft = await this.assertDraftOwnership(restaurantId, draftId);
    if (!draft) return serviceFail("Draft not found", 404);
    if (draft.status !== "OPEN") return serviceFail("Draft is no longer open", 400);

    const menuItem = await prisma.menuItem.findUnique({
      where: { id: input.menuItemId },
      include: { category: { select: { restaurantId: true } } },
    });

    if (!menuItem || menuItem.category.restaurantId !== restaurantId) {
      return serviceFail("Menu item not found", 404);
    }

    if (!menuItem.isActive) {
      return serviceFail("Menu item is not available", 400);
    }

    // If same item already in draft, increment quantity instead of duplicating
    const existing = await prisma.orderDraftItem.findFirst({
      where: { orderDraftId: draftId, menuItemId: input.menuItemId },
    });

    if (existing) {
      await prisma.orderDraftItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + input.quantity },
      });
    } else {
      await prisma.orderDraftItem.create({
        data: {
          orderDraftId: draftId,
          menuItemId: input.menuItemId,
          quantity: input.quantity,
          unitPrice: menuItem.price, // snapshot at time of add
          isUpsell: input.isUpsell,
          notes: input.notes ?? null,
        },
      });
    }

    await this.recomputeTotals(draftId);
    return this.getById(restaurantId, draftId);
  }

  static async updateItem(
    restaurantId: string,
    draftId: string,
    itemId: string,
    input: UpdateDraftItemInput
  ): Promise<ServiceResult<OrderDraftWithItems>> {
    const draft = await this.assertDraftOwnership(restaurantId, draftId);
    if (!draft) return serviceFail("Draft not found", 404);
    if (draft.status !== "OPEN") return serviceFail("Draft is no longer open", 400);

    const item = await prisma.orderDraftItem.findUnique({
      where: { id: itemId },
      select: { id: true, orderDraftId: true },
    });

    if (!item || item.orderDraftId !== draftId) {
      return serviceFail("Item not found in draft", 404);
    }

    await prisma.orderDraftItem.update({
      where: { id: itemId },
      data: {
        ...(input.quantity !== undefined && { quantity: input.quantity }),
        ...(input.notes !== undefined && { notes: input.notes ?? null }),
      },
    });

    await this.recomputeTotals(draftId);
    return this.getById(restaurantId, draftId);
  }

  static async removeItem(
    restaurantId: string,
    draftId: string,
    itemId: string
  ): Promise<ServiceResult<OrderDraftWithItems>> {
    const draft = await this.assertDraftOwnership(restaurantId, draftId);
    if (!draft) return serviceFail("Draft not found", 404);
    if (draft.status !== "OPEN") return serviceFail("Draft is no longer open", 400);

    const item = await prisma.orderDraftItem.findUnique({
      where: { id: itemId },
      select: { id: true, orderDraftId: true },
    });

    if (!item || item.orderDraftId !== draftId) {
      return serviceFail("Item not found in draft", 404);
    }

    await prisma.orderDraftItem.delete({ where: { id: itemId } });
    await this.recomputeTotals(draftId);
    return this.getById(restaurantId, draftId);
  }

  static async clearItems(
    restaurantId: string,
    draftId: string
  ): Promise<ServiceResult<OrderDraftWithItems>> {
    const draft = await this.assertDraftOwnership(restaurantId, draftId);
    if (!draft) return serviceFail("Draft not found", 404);
    if (draft.status !== "OPEN") return serviceFail("Draft is no longer open", 400);

    await prisma.orderDraftItem.deleteMany({ where: { orderDraftId: draftId } });
    await this.recomputeTotals(draftId);
    return this.getById(restaurantId, draftId);
  }

  /**
   * Confirm a draft.
   * Transaction:
   *   1. Re-read draft + items for consistent snapshot
   *   2. Validate: draft is OPEN, has items, has delivery address if DELIVERY
   *   3. Create Order + OrderItems
   *   4. Mark draft as CONFIRMED + set confirmedAt
   *   5. Update Customer.totalOrders + totalSpend + lastOrderAt
   *
   * Draft is NEVER deleted.
   */
  static async confirm(
    restaurantId: string,
    draftId: string,
    input: ConfirmDraftInput
  ): Promise<ServiceResult<Order>> {
    const draft = await prisma.orderDraft.findUnique({
      where: { id: draftId },
      include: {
        items: { include: { menuItem: { select: { name: true } } } },
      },
    });

    if (!draft || draft.restaurantId !== restaurantId) {
      return serviceFail("Draft not found", 404);
    }

    if (draft.status !== "OPEN") {
      return serviceFail(`Draft is already ${draft.status.toLowerCase()}`, 400);
    }

    if (draft.items.length === 0) {
      return serviceFail("Cannot confirm an empty draft", 400);
    }

    if (draft.fulfillmentType === "DELIVERY" && !draft.deliveryAddressId) {
      return serviceFail(
        "Delivery address is required for DELIVERY orders",
        400
      );
    }

    const deliveryFee =
      input.deliveryFee !== undefined
        ? new Decimal(input.deliveryFee)
        : draft.deliveryFee;

    const discount = new Decimal(input.discount);

    // Recompute subtotal from items (never trust stored value at confirmation)
    const subtotal = draft.items.reduce(
      (acc, item) => acc.plus(new Decimal(item.unitPrice).times(item.quantity)),
      new Decimal(0)
    );
    const total = subtotal.plus(deliveryFee).minus(discount);

    const order = await prisma.$transaction(async (tx) => {
      // Create confirmed order
      const newOrder = await tx.order.create({
        data: {
          restaurantId,
          customerId: draft.customerId,
          orderDraftId: draftId,
          type: draft.fulfillmentType as "DELIVERY" | "PICKUP" | "DINE_IN",
          subtotal,
          deliveryFee,
          discount,
          total,
          notes: input.notes ?? draft.notes ?? null,
          deliveryAddressId: draft.deliveryAddressId ?? null,
          items: {
            create: draft.items.map((item) => ({
              menuItemId: item.menuItemId,
              name: item.menuItem.name, // snapshot
              price: item.unitPrice,    // snapshot
              quantity: item.quantity,
              notes: item.notes ?? null,
              total: new Decimal(item.unitPrice).times(item.quantity),
            })),
          },
        },
      });

      // Mark draft as CONFIRMED (never delete)
      await tx.orderDraft.update({
        where: { id: draftId },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          subtotal,
          deliveryFee,
          totalAmount: total,
        },
      });

      // Denormalize customer stats
      await tx.customer.update({
        where: { id: draft.customerId },
        data: {
          totalOrders: { increment: 1 },
          totalSpend: { increment: total },
          lastOrderAt: new Date(),
        },
      });

      return newOrder;
    });

    return serviceOk(order);
  }

  static async abandon(
    restaurantId: string,
    draftId: string
  ): Promise<ServiceResult<{ message: string }>> {
    const draft = await this.assertDraftOwnership(restaurantId, draftId);
    if (!draft) return serviceFail("Draft not found", 404);
    if (draft.status !== "OPEN") return serviceFail("Draft is no longer open", 400);

    await prisma.orderDraft.update({
      where: { id: draftId },
      data: { status: "ABANDONED", abandonedAt: new Date() },
    });

    return serviceOk({ message: "Draft abandoned" });
  }
}
