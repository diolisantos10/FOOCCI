/**
 * WaiterReasoningContextService — gathers SAFE, read-only restaurant context for
 * the reasoning layer: configured payment methods, delivery/pickup, brand tone.
 *
 * Never invents. If a context piece is unavailable it is reported in
 * `missingContext` so the reasoning answers safely ("preciso confirmar") instead
 * of hallucinating (e.g. claiming it accepts a meal-voucher that isn't configured).
 */

import { prisma } from "@/lib/prisma";
import type { AgentReasoningContext } from "./AgentReasoningTypes";

export async function getWaiterReasoningContext(restaurantId?: string | null): Promise<AgentReasoningContext> {
  const availableContextUsed: string[] = [];
  const missingContext: string[] = [];

  if (!restaurantId) {
    return {
      paymentMethods: [],
      knowsMealVoucher: false,
      availableContextUsed: [],
      missingContext: ["formas de pagamento", "perfil do restaurante", "delivery/retirada"],
    };
  }

  const restaurant = await prisma.restaurant
    .findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        paymentSettings: { select: { acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: true } },
        deliveryConfig: { select: { enabled: true, pickupEnabled: true } },
        brandConfig: { select: { tone: true } },
      },
    })
    .catch(() => null);

  if (!restaurant) {
    return {
      paymentMethods: [],
      knowsMealVoucher: false,
      availableContextUsed: [],
      missingContext: ["formas de pagamento", "perfil do restaurante", "delivery/retirada"],
    };
  }

  availableContextUsed.push("perfil do restaurante");

  const paymentMethods: string[] = [];
  if (restaurant.paymentSettings) {
    if (restaurant.paymentSettings.acceptPix) paymentMethods.push("PIX");
    if (restaurant.paymentSettings.acceptCard) paymentMethods.push("Cartão");
    if (restaurant.paymentSettings.acceptCash) paymentMethods.push("Dinheiro");
    if (restaurant.paymentSettings.acceptLink) paymentMethods.push("Link de pagamento");
    availableContextUsed.push("formas de pagamento");
  } else {
    missingContext.push("formas de pagamento");
  }

  // The schema has NO meal-voucher (Alelo/VR/Sodexo) configuration → the Waiter
  // must never claim it accepts one. This is reported as missing context.
  const knowsMealVoucher = false;
  missingContext.push("benefício refeição (Alelo/VR/Sodexo) — não cadastrado");

  let acceptsDelivery: boolean | null = null;
  let acceptsPickup: boolean | null = null;
  if (restaurant.deliveryConfig) {
    acceptsDelivery = restaurant.deliveryConfig.enabled;
    acceptsPickup = restaurant.deliveryConfig.pickupEnabled;
    availableContextUsed.push("delivery/retirada");
  } else {
    missingContext.push("delivery/retirada");
  }

  return {
    restaurantName: restaurant.name,
    paymentMethods,
    knowsMealVoucher,
    acceptsDelivery,
    acceptsPickup,
    tone: restaurant.brandConfig?.tone ?? null,
    availableContextUsed,
    missingContext,
  };
}
