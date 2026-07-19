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

/** Which operators are wired per method (for diagnostics/UI). */
export function knownPaymentProviders(): { pix: string[]; card: string[] } {
  return { pix: ["mercadopago"], card: ["sumup"] };
}
