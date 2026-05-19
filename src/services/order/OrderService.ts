/**
 * OrderService
 *
 * Read and lifecycle management for confirmed Orders.
 * Orders are immutable after creation – only status and payment change.
 *
 * Valid status transitions:
 *   PENDING → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED
 *   Any non-DELIVERED/CANCELLED → CANCELLED
 */

import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult, PaginatedResult } from "@/types";
import type { UpdateOrderStatusInput, OrderListQuery } from "@/validators/order";
import type { Order, OrderItem, Payment, OrderStatus } from "@prisma/client";
import { SaiposIntegrationService } from "@/services/integrations/SaiposIntegrationService";
import { OrderNotificationService } from "@/services/order/OrderNotificationService";

export type OrderWithDetails = Order & {
  items: OrderItem[];
  payment: Payment | null;
  customer: { name: string; phone: string; totalOrders: number; totalSpend: unknown; lastOrderAt: Date | null };
  deliveryAddress: {
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
  } | null;
  orderDraft: { conversationId: string | null } | null;
};

// Legal forward transitions only
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["AWAITING_PAYMENT", "CONFIRMED", "CANCELLED"],
  AWAITING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export class OrderService {
  static async list(
    restaurantId: string,
    query: OrderListQuery
  ): Promise<ServiceResult<PaginatedResult<OrderWithDetails>>> {
    const { page, limit, status, customerId, from, to } = query;
    const skip = (page - 1) * limit;

    const where = {
      restaurantId,
      ...(status && { status }),
      ...(customerId && { customerId }),
      ...(from || to
        ? {
            createdAt: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: true,
          payment: true,
          customer: { select: { name: true, phone: true, totalOrders: true, totalSpend: true, lastOrderAt: true } },
          deliveryAddress: {
            select: {
              street: true,
              number: true,
              complement: true,
              neighborhood: true,
              city: true,
              state: true,
            },
          },
          orderDraft: { select: { conversationId: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return serviceOk({
      data: data as OrderWithDetails[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  static async getById(
    restaurantId: string,
    orderId: string
  ): Promise<ServiceResult<OrderWithDetails>> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payment: true,
        customer: { select: { name: true, phone: true } },
        deliveryAddress: {
          select: {
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
          },
        },
      },
    });

    if (!order || order.restaurantId !== restaurantId) {
      return serviceFail("Order not found", 404);
    }

    return serviceOk(order as OrderWithDetails);
  }

  static async updateStatus(
    restaurantId: string,
    orderId: string,
    input: UpdateOrderStatusInput
  ): Promise<ServiceResult<Order>> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, restaurantId: true, status: true },
    });

    if (!order || order.restaurantId !== restaurantId) {
      return serviceFail("Order not found", 404);
    }

    const allowed = TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(input.status as OrderStatus)) {
      return serviceFail(
        `Cannot transition order from ${order.status} to ${input.status}`,
        400
      );
    }

    const now = new Date();
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: input.status,
        ...(input.estimatedAt && { estimatedAt: new Date(input.estimatedAt) }),
        ...(input.status === "DELIVERED" && { completedAt: now }),
        ...(input.status === "CANCELLED" && { cancelledAt: now }),
      },
    });

    // Fire-and-forget: send to Saipos when order is confirmed.
    // maybeSendOrder checks integration enabled + idempotency guard internally.
    if (input.status === "CONFIRMED") {
      SaiposIntegrationService.maybeSendOrder(restaurantId, orderId).catch((e) =>
        console.error("[saipos] updateStatus send failed:", e)
      );
    }

    // Fire-and-forget: notify customer via WhatsApp on key status changes.
    OrderNotificationService.notifyCustomerOnStatusChange(
      restaurantId,
      orderId,
      input.status,
      input.cancelReason ? { cancelReason: input.cancelReason } : undefined
    ).catch((e) => console.error("[OrderNotification] fire-and-forget failed:", e));

    return serviceOk(updated);
  }
}
