/**
 * WhatsAppOrderKnowledge — loads the restaurant's TRUTH for the order brain's host
 * answers (hours, payment, delivery). Read-only, server-side, never invents:
 * anything missing is left null and the brain says it will confirm.
 *
 * Mirrors the same sources the rest of Foocci reads (PaymentSettings, deliveryConfig,
 * businessHours). The live MENU (items + prices, incl. any "Rodízio" item) is passed
 * separately to the brain, so item-level questions are answered from real data.
 */

import { prisma } from "@/lib/prisma";
import type { WaOrderKnowledge } from "./WhatsAppOrderBrain";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export async function loadOrderKnowledge(restaurantId: string): Promise<WaOrderKnowledge> {
  const [restaurant, hours] = await Promise.all([
    prisma.restaurant
      .findUnique({
        where: { id: restaurantId },
        select: {
          name: true,
          paymentSettings: { select: { acceptPix: true, acceptCard: true, acceptCash: true } },
          deliveryConfig: { select: { enabled: true, pickupEnabled: true } },
        },
      })
      .catch(() => null),
    prisma.businessHours
      .findMany({
        where: { restaurantId },
        select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true },
        orderBy: { dayOfWeek: "asc" },
      })
      .catch(() => [] as Array<{ dayOfWeek: number; isOpen: boolean; openTime: string | null; closeTime: string | null }>),
  ]);

  const pay = restaurant?.paymentSettings;
  const payments = pay
    ? [pay.acceptPix && "Pix", pay.acceptCard && "Cartão", pay.acceptCash && "Dinheiro"].filter(Boolean).join(", ") || null
    : null;

  const del = restaurant?.deliveryConfig;
  const delivery = del
    ? [del.enabled && "entrega", del.pickupEnabled && "retirada"].filter(Boolean).join(" e ") || null
    : null;

  const hoursStr =
    hours
      .filter((h) => h.isOpen && h.openTime && h.closeTime)
      .map((h) => `${DAYS[h.dayOfWeek] ?? h.dayOfWeek}: ${h.openTime}–${h.closeTime}`)
      .join("; ") || null;

  return {
    restaurantName: restaurant?.name ?? null,
    hours: hoursStr,
    payments,
    delivery,
    rodizio: null, // no dedicated field yet — any "Rodízio" item comes via the menu
    general: null,
  };
}
