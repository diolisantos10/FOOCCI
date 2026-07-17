/**
 * activeProvider — routes outbound WhatsApp sends through the restaurant's ACTIVE
 * provider (Restaurant.whatsappProvider): Meta Cloud API or Evolution.
 *
 * WHY: transactional senders (order notifications, ordering runtime, review requests,
 * cart recovery, AI replies) were hardcoded to EvolutionClient. After a restaurant
 * migrates its number to the official Meta Cloud API, Evolution is dead for that
 * number — every hardcoded send fails (seen live: HTTP 400 / silent bot). Routing by
 * the active provider keeps Evolution-only restaurants untouched and makes migrated
 * restaurants send through Meta.
 *
 * Both providers implement the same WhatsAppProvider interface and normalize/validate
 * the recipient themselves.
 */

import { prisma } from "@/lib/prisma";
import type { WhatsAppProvider, SendResult } from "./providers/types";
import { EvolutionWhatsAppProvider } from "./providers/EvolutionWhatsAppProvider";
import { MetaWhatsAppCloudProvider } from "./providers/MetaWhatsAppCloudProvider";

/** Resolve the provider selected for this restaurant (defaults to Evolution). */
export async function activeWhatsAppProvider(restaurantId: string): Promise<WhatsAppProvider> {
  const r = await prisma.restaurant
    .findUnique({ where: { id: restaurantId }, select: { whatsappProvider: true } })
    .catch(() => null);
  return r?.whatsappProvider === "META_CLOUD_API"
    ? new MetaWhatsAppCloudProvider()
    : new EvolutionWhatsAppProvider();
}

/** One-call text send through the active provider. */
export async function sendWhatsAppText(
  restaurantId: string,
  to: string,
  text: string,
): Promise<SendResult> {
  const provider = await activeWhatsAppProvider(restaurantId);
  return provider.sendText({ restaurantId, to, text });
}
