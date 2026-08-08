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
import { PrintQueueService } from "@/services/print/PrintQueueService";
import { FiscalEmissionService } from "@/services/fiscal/FiscalEmissionService";

export type OrderWithDetails = Order & {
  items: OrderItem[];
  payment: Payment | null;
  customer: { id: string; name: string; phone: string; totalOrders: number; totalSpend: unknown; lastOrderAt: Date | null; tier: string };
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
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
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
      // AWAITING_PAYMENT orders are not operational — payment not confirmed.
      // Excluded regardless of provider. A future endpoint exposes them separately.
      NOT: { status: "AWAITING_PAYMENT" as const },
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
          customer: { select: { id: true, name: true, phone: true, totalOrders: true, totalSpend: true, lastOrderAt: true, tier: true } },
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
        customer: { select: { id: true, name: true, phone: true } },
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

  /**
   * Muda o status do pedido a pedido de ALGUÉM DA LOJA (é o único caminho que a
   * tela do painel usa — aceitar, avançar, recusar).
   *
   * `actorUserId` existe para carimbar `alarmAckAt`/`alarmAckByUserId`: a partir
   * daqui, "este pedido já foi tratado" é fato do BANCO e não memória de uma aba
   * de navegador. Sem isso, aceitar na cozinha não calava o alarme do painel,
   * aceitar numa aba não calava a outra, e recarregar a página fazia o som
   * voltar — PENDING→CONFIRMED continua dentro do conjunto que toca.
   *
   * Os caminhos automáticos (checkout, webhook de pagamento, WhatsApp) NÃO
   * passam por aqui e por isso NÃO carimbam: pedido que entra confirmado sozinho
   * ainda não foi visto por ninguém, e tem que tocar.
   */
  static async updateStatus(
    restaurantId: string,
    orderId: string,
    input: UpdateOrderStatusInput,
    actorUserId?: string | null,
  ): Promise<ServiceResult<Order>> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, restaurantId: true, status: true, alarmAckAt: true },
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
        // Alguém da loja agiu neste pedido → o alarme cala em toda aba e todo
        // aparelho. Só o primeiro carimbo vale (quem tratou de verdade).
        ...(order.alarmAckAt ? {} : { alarmAckAt: now, alarmAckByUserId: actorUserId ?? null }),
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
      // Enqueue station print jobs for the Carteiro (idempotent, internal guard).
      PrintQueueService.maybeEnqueueOrder(restaurantId, orderId).catch((e) =>
        console.error("[print] updateStatus enqueue failed:", e)
      );
      // Fire-and-forget: emit the NFC-e (no-op unless the restaurant enabled it).
      FiscalEmissionService.maybeEmitForOrder(restaurantId, orderId).catch((e) =>
        console.error("[fiscal] updateStatus emit failed:", e)
      );
    }

    // Fire-and-forget: notify customer via WhatsApp on key status changes.
    // Defense-in-depth: if advancing to CONFIRMED while payment is still LINK_SENT
    // (online Pix not yet paid), suppress the notification — a restaurant operator
    // should never be able to confirm an unpaid Pix order, but this guard prevents
    // a premature "pedido aceito" WhatsApp in any edge case.
    void (async () => {
      if (input.status === "CONFIRMED") {
        const pmt = await prisma.payment.findUnique({ where: { orderId }, select: { status: true } });
        if (pmt?.status === "LINK_SENT") {
          console.warn("[OrderNotification] blocked CONFIRMED notify — payment still LINK_SENT (Pix not paid)", { orderId });
          return;
        }
      }
      OrderNotificationService.notifyCustomerOnStatusChange(
        restaurantId,
        orderId,
        input.status,
        input.cancelReason ? { cancelReason: input.cancelReason } : undefined,
      ).catch((e) => console.error("[OrderNotification] fire-and-forget failed:", e));
    })();

    return serviceOk(updated);
  }
}
