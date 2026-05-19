/**
 * OrderNotificationService
 *
 * Sends WhatsApp messages to customers when their order status changes.
 * Always fire-and-forget — never throws, never blocks the status update.
 *
 * Guards:
 *  - Guest customers (isGuest=true) are never notified
 *  - Opted-out customers (hasOptedOut=true) are never notified
 *  - Missing/invalid phone → skip silently
 *  - Missing Evolution config → skip silently
 *  - Any send error → log and move on
 *
 * Deduplication: The order state machine only allows each status transition
 * once (CONFIRMED can only be reached once, CANCELLED is terminal), so
 * duplicate sends are not possible via normal flow.
 */

import { prisma } from "@/lib/prisma";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";

type NotifyStatus =
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

function buildMessage(
  status: NotifyStatus,
  firstName: string,
  orderNum: string,
  options?: { cancelReason?: string }
): string | null {
  switch (status) {
    case "CONFIRMED":
      return `Olá, ${firstName}! ✅ Seu pedido #${orderNum} foi aceito e já está sendo preparado. Obrigado por pedir com a gente!`;
    case "PREPARING":
      return `Seu pedido #${orderNum} está sendo preparado 👨‍🍳. Em breve ficará pronto!`;
    case "READY":
      return `Seu pedido #${orderNum} está pronto! 🎉 Pode retirar ou aguarde o entregador.`;
    case "OUT_FOR_DELIVERY":
      return `Seu pedido #${orderNum} saiu para entrega! 🛵 Fique de olho, ele está a caminho.`;
    case "DELIVERED":
      return `Pedido #${orderNum} entregue! 🎉 Obrigado por pedir com a gente. Até a próxima!`;
    case "CANCELLED": {
      const base = `Olá, ${firstName}. Infelizmente seu pedido #${orderNum} foi cancelado pelo restaurante.`;
      return options?.cancelReason
        ? `${base}\n\nMotivo: ${options.cancelReason}`
        : `${base} Se precisar de ajuda, entre em contato.`;
    }
    default:
      return null;
  }
}

export class OrderNotificationService {
  static async notifyCustomerOnStatusChange(
    restaurantId: string,
    orderId: string,
    newStatus: string,
    options?: { cancelReason?: string }
  ): Promise<void> {
    const message = buildMessage(newStatus as NotifyStatus, "", "", options);
    if (!message) return; // status has no notification template

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id:       true,
          customer: {
            select: {
              name:       true,
              phone:      true,
              isGuest:    true,
              hasOptedOut: true,
            },
          },
        },
      });

      if (!order) return;

      const { customer } = order;
      if (!customer.phone || customer.isGuest || customer.hasOptedOut) return;

      // Normalize to E.164 digits only (Evolution expects no leading +)
      const phone = customer.phone.replace(/^\+/, "").replace(/\D/g, "");
      if (!phone.match(/^\d{10,15}$/)) return;

      const orderNum   = orderId.slice(-6).toUpperCase();
      const firstName  = customer.name.trim().split(/\s+/)[0] ?? customer.name;
      const finalMsg   = buildMessage(newStatus as NotifyStatus, firstName, orderNum, options);
      if (!finalMsg) return;

      const cfgResult = await EvolutionConfigService.getSnapshot(restaurantId);
      if (!cfgResult.ok) return;

      await EvolutionClient.sendTextMessage(cfgResult.data, phone, finalMsg);
    } catch (err) {
      console.error("[OrderNotificationService] WhatsApp notification failed:", {
        restaurantId,
        orderId,
        newStatus,
        err,
      });
    }
  }
}
