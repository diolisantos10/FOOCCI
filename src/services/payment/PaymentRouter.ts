/**
 * PaymentRouter — picks which operadora processes a given method for a restaurant.
 *
 * This is the "invisible routing" layer: the customer never knows which acquirer
 * ran the charge. Today Mercado Pago handles both Pix and card; as more operators
 * are added, extend PROVIDER_PRIORITY (and later a per-restaurant routing map) so
 * a method can be pointed at a specific operator with automatic fallback.
 *
 * Resolution: for the requested method, walk the priority list and return the
 * first ACTIVE, configured provider that supports it. null = nothing can charge.
 */

import type { PaymentProvider, PaymentMethodKind } from "./providers/types";
import { MercadoPagoProvider } from "./providers/MercadoPagoProvider";
import { getMercadoPagoCredentials } from "./paymentCredentials";

/**
 * Try-order per provider. First match wins. Adding an operator = add a builder
 * here (and, later, let a restaurant override the order per method).
 */
const PROVIDER_BUILDERS: Array<{
  name: string;
  supports: (kind: PaymentMethodKind) => boolean;
  build: (restaurantId: string) => Promise<PaymentProvider | null>;
}> = [
  {
    name: "mercadopago",
    supports: (kind) => kind === "pix" || kind === "card",
    build: async (restaurantId) => {
      const creds = await getMercadoPagoCredentials(restaurantId);
      return creds ? new MercadoPagoProvider(creds.accessToken) : null;
    },
  },
];

export interface ResolveOptions {
  /** Restrict resolution to a specific operator (e.g. retry on the same PSP). */
  only?: string;
}

/**
 * Resolves the operator that will handle `kind` for this restaurant, or null if
 * none is configured/active. The returned provider is ready to charge.
 */
export async function resolvePaymentProvider(
  restaurantId: string,
  kind: PaymentMethodKind,
  opts: ResolveOptions = {}
): Promise<PaymentProvider | null> {
  for (const entry of PROVIDER_BUILDERS) {
    if (opts.only && entry.name !== opts.only) continue;
    if (!entry.supports(kind)) continue;
    const provider = await entry.build(restaurantId);
    if (provider && provider.supports(kind)) return provider;
  }
  return null;
}

/** Names of operators wired into the router (for diagnostics/UI). */
export function knownPaymentProviders(): string[] {
  return PROVIDER_BUILDERS.map((p) => p.name);
}
