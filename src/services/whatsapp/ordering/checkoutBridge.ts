/**
 * checkoutBridge — reuses the SAME sources of truth as the Fute (web) checkout for
 * the WhatsApp text-order flow. No parallel rules:
 *
 *  • payment options come from the restaurant's PaymentSettings (the same table
 *    the Fute checkout reads) → rendered as a numbered question + option order
 *    that the state machine maps a bare number against;
 *  • the saved address comes from the customer's most recent delivery order
 *    (read-only) so a returning customer doesn't retype it.
 *
 * Order creation / Pix themselves already go through the shared Fute backend
 * (WhatsAppOrderCreationService → createOrderRecord, WhatsAppPaymentService →
 * createPixPayment). This bridge only feeds session.metadata — it never creates
 * an order, never generates Pix, never sends anything.
 */

import { prisma } from "@/lib/prisma";

export type WaPaymentOptionMethod = "PIX" | "CARD" | "CASH";

export interface ConfiguredPaymentOptions {
  /** Official option order — a bare numeric answer maps against this. */
  order: WaPaymentOptionMethod[];
  /** Numbered question rendered from the configured options. */
  question: string;
}

const LABELS: Record<WaPaymentOptionMethod, string> = {
  PIX: "Pix",
  CARD: "Cartão na entrega",
  CASH: "Dinheiro na entrega",
};

/** Pure renderer (testable without DB). */
export function renderPaymentQuestion(order: WaPaymentOptionMethod[]): string {
  const lines = order.map((m, i) => `${i + 1}. ${LABELS[m]}`);
  return `Escolha a forma de pagamento:\n${lines.join("\n")}`;
}

/**
 * Reads the restaurant's configured payment options (same PaymentSettings the
 * Fute checkout uses). Falls back to all three when settings are absent —
 * identical to today's default behavior, never inventing a new method.
 */
export async function getConfiguredPaymentOptions(restaurantId: string): Promise<ConfiguredPaymentOptions> {
  const settings = await prisma.paymentSettings
    .findUnique({ where: { restaurantId }, select: { acceptPix: true, acceptCard: true, acceptCash: true } })
    .catch(() => null);

  const order: WaPaymentOptionMethod[] = [];
  if (!settings || settings.acceptPix) order.push("PIX");
  if (!settings || settings.acceptCard) order.push("CARD");
  if (!settings || settings.acceptCash) order.push("CASH");
  if (order.length === 0) order.push("PIX", "CARD", "CASH"); // never a dead end

  return { order, question: renderPaymentQuestion(order) };
}

export interface SavedAddress {
  street: string;
  number: string;
  neighborhood?: string;
  formatted: string;
}

/**
 * The customer's most recent delivery address (read-only) — same Address records
 * the Fute checkout snapshots on orders.
 */
export async function getSavedAddressForCustomer(customerId: string): Promise<SavedAddress | null> {
  const order = await prisma.order
    .findFirst({
      where: { customerId, deliveryAddressId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { deliveryAddress: { select: { street: true, number: true, neighborhood: true, city: true } } },
    })
    .catch(() => null);

  const a = order?.deliveryAddress;
  if (!a?.street || !a?.number) return null;
  const formatted = [`${a.street}, ${a.number}`, a.neighborhood, a.city].filter(Boolean).join(" — ");
  return { street: a.street, number: a.number, neighborhood: a.neighborhood ?? undefined, formatted };
}
