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
const PAY_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"] as const;

export function renderPaymentQuestion(order: WaPaymentOptionMethod[]): string {
  const lines = order.map((m, i) => `${PAY_EMOJI[i] ?? `${i + 1}.`} ${LABELS[m]}`);
  return `Como você quer pagar?\n${lines.join("\n")}`;
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

// ── Runtime metadata enrichment (called by WhatsAppTextOrderingRuntimeService) ──

export interface EnrichInput {
  restaurantId: string;
  customerId?: string | null;
  currentMetadata: Record<string, unknown> | null;
  /** Skip the saved-address lookup when the session already has an address. */
  hasAddress?: boolean;
}

export interface EnrichDeps {
  getPaymentOptions?: (restaurantId: string) => Promise<ConfiguredPaymentOptions>;
  getSavedAddress?: (customerId: string) => Promise<SavedAddress | null>;
}

export interface EnrichResult {
  metadata: Record<string, unknown>;
  changed: boolean;
  paymentInjected: boolean;
  savedAddressLoaded: boolean;
}

/**
 * Injects the Fute-parity metadata into an ordering session, exactly once:
 *  • paymentQuestion / paymentOptionOrder / paymentOptions ← PaymentSettings;
 *  • savedAddress ← customer's last delivery address (only with a safe customerId
 *    and only while the session has no address yet).
 * NEVER throws (a failure falls back to the machine's safe defaults) and never
 * overwrites values that are already present.
 */
export async function enrichSessionMetadata(input: EnrichInput, deps: EnrichDeps = {}): Promise<EnrichResult> {
  const meta: Record<string, unknown> = { ...(input.currentMetadata ?? {}) };
  let paymentInjected = false;
  let savedAddressLoaded = false;

  // Payment options (stable order, straight from PaymentSettings — never invented).
  if (!Array.isArray(meta.paymentOptionOrder)) {
    try {
      const fetchOptions = deps.getPaymentOptions ?? getConfiguredPaymentOptions;
      const options = await fetchOptions(input.restaurantId);
      meta.paymentOptionOrder = options.order;
      meta.paymentQuestion = options.question;
      meta.paymentOptions = options.order.map((m, i) => ({ n: i + 1, method: m }));
      paymentInjected = true;
    } catch {
      // fall back to the machine's default question — never block the turn
    }
  }

  // Saved address (only with a safe customer, only before any address exists).
  if (!input.hasAddress && input.customerId && meta.savedAddress === undefined) {
    try {
      const fetchAddress = deps.getSavedAddress ?? getSavedAddressForCustomer;
      const saved = await fetchAddress(input.customerId);
      if (saved) {
        meta.savedAddress = saved;
        savedAddressLoaded = true;
      }
    } catch {
      // no saved address — the machine simply asks for one
    }
  }

  const changed = paymentInjected || savedAddressLoaded;
  if (changed) meta.bridgeInjectedAt = new Date().toISOString();
  return { metadata: meta, changed, paymentInjected, savedAddressLoaded };
}
