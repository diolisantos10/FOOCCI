/**
 * PaymentRouter — picks which operadora processes a given method for a restaurant.
 *
 * The "invisible routing" layer: the customer never knows which acquirer ran the
 * charge. Pix and card resolve independently, so you can point each method at a
 * different operator:
 *
 *   Pix  → Mercado Pago   (charge model — see MercadoPagoProvider)
 *   Card → SumUp          (checkout model — see SumUpProvider)
 *
 * Adding an operator = add a builder here (and, later, a per-restaurant priority
 * map so a method can be pointed at a specific operator with fallback).
 */

import type { PixProvider, CardProvider } from "./providers/types";
import { MercadoPagoProvider } from "./providers/MercadoPagoProvider";
import { SumUpProvider } from "./providers/SumUpProvider";
import { getMercadoPagoCredentials, getSumUpCredentials } from "./paymentCredentials";

/** Resolve the operator that handles Pix for this restaurant, or null. */
export async function resolvePixProvider(
  restaurantId: string
): Promise<PixProvider | null> {
  const creds = await getMercadoPagoCredentials(restaurantId);
  return creds ? new MercadoPagoProvider(creds.accessToken) : null;
}

/** Resolve the operator that handles card for this restaurant, or null. */
export async function resolveCardProvider(
  restaurantId: string
): Promise<CardProvider | null> {
  const creds = await getSumUpCredentials(restaurantId);
  if (!creds) return null;
  return new SumUpProvider(
    { apiKey: creds.apiKey, merchantCode: creds.merchantCode },
    { maxInstallments: creds.maxInstallments }
  );
}

/**
 * Which card operator handles this restaurant, plus the client-safe config the
 * browser needs. Mercado Pago transparent card is preferred when it has a Public
 * Key configured; SumUp is the fallback. null = card not available.
 *
 * The two operators use different client flows:
 *   mercadopago → token model (MP SDK tokenizes the card → server charges)
 *   sumup       → checkout model (server creates a checkout → SumUp widget)
 */
export type CardOperatorInfo =
  | { provider: "mercadopago"; publicKey: string }
  | { provider: "sumup"; merchantCode: string; maxInstallments: number };

export async function resolveCardOperator(
  restaurantId: string
): Promise<CardOperatorInfo | null> {
  // Card runs on SumUp in this operation. Mercado Pago is Pix-only. (The MP card
  // token flow stays in the codebase, dormant, in case card is repointed to MP.)
  const su = await getSumUpCredentials(restaurantId);
  if (su) return { provider: "sumup", merchantCode: su.merchantCode, maxInstallments: su.maxInstallments ?? 1 };
  return null;
}

/** True when card payment is usable for this restaurant (MP transparent OR SumUp). */
export async function isCardEnabled(restaurantId: string): Promise<boolean> {
  return (await resolveCardOperator(restaurantId)) !== null;
}

/** Which operators are wired per method (for diagnostics/UI). */
export function knownPaymentProviders(): { pix: string[]; card: string[] } {
  return { pix: ["mercadopago"], card: ["mercadopago", "sumup"] };
}
