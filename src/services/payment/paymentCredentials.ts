/**
 * Server-only loader for per-restaurant payment credentials.
 *
 * Reads the encrypted IntegrationConfig blob and returns decrypted secrets.
 * NEVER expose these to the client — they charge money. (The card widget needs
 * only the checkout id + merchant code, both produced server-side.)
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

// ── Mercado Pago (Pix) ─────────────────────────────────────────────────────────

export interface MercadoPagoCredentials {
  accessToken: string;
  environment?: string;   // "test" | "production"
}

/** MP creds only when the integration is ACTIVE and has a token. null otherwise. */
export async function getMercadoPagoCredentials(
  restaurantId: string
): Promise<MercadoPagoCredentials | null> {
  const row = await prisma.integrationConfig.findUnique({
    where:  { restaurantId_provider: { restaurantId, provider: "mercadopago" } },
    select: { configBlob: true, isActive: true },
  });
  if (!row?.isActive) return null;
  try {
    const raw = JSON.parse(decrypt(row.configBlob)) as MercadoPagoCredentials;
    if (!raw.accessToken) return null;
    return { accessToken: raw.accessToken, environment: raw.environment };
  } catch {
    return null;
  }
}

// ── SumUp (card) ───────────────────────────────────────────────────────────────

export interface SumUpCredentialsRecord {
  apiKey: string;
  merchantCode: string;
  environment?: string;
  maxInstallments?: number;
}

/** True when card payment (SumUp) is usable for this restaurant. Safe for the client. */
export async function isSumUpCardEnabled(restaurantId: string): Promise<boolean> {
  return (await getSumUpCredentials(restaurantId)) !== null;
}

/** SumUp creds only when the integration is ACTIVE and complete. null otherwise. */
export async function getSumUpCredentials(
  restaurantId: string
): Promise<SumUpCredentialsRecord | null> {
  const row = await prisma.integrationConfig.findUnique({
    where:  { restaurantId_provider: { restaurantId, provider: "sumup" } },
    select: { configBlob: true, isActive: true },
  });
  if (!row?.isActive) return null;
  try {
    const raw = JSON.parse(decrypt(row.configBlob)) as SumUpCredentialsRecord;
    if (!raw.apiKey || !raw.merchantCode) return null;
    return {
      apiKey:          raw.apiKey,
      merchantCode:    raw.merchantCode,
      environment:     raw.environment,
      maxInstallments: raw.maxInstallments,
    };
  } catch {
    return null;
  }
}
