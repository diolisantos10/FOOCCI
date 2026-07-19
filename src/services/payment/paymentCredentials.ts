/**
 * Server-only loader for per-restaurant payment credentials.
 *
 * Reads the encrypted IntegrationConfig blob and returns decrypted secrets.
 * NEVER expose the accessToken to the client — the publicKey is the only value
 * safe to send to the browser (it's what the MP SDK uses to tokenize a card).
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export interface MercadoPagoCredentials {
  accessToken: string;        // server-only — charges the card / creates the Pix
  publicKey?: string;         // client-safe — used by the MP SDK to tokenize
  environment?: string;       // "sandbox" | "production"
}

/**
 * Returns MP credentials only when the integration is ACTIVE and has a token.
 * null means "MP not usable for this restaurant" (unconfigured / disabled / corrupt).
 */
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
    return {
      accessToken: raw.accessToken,
      publicKey:   raw.publicKey,
      environment: raw.environment,
    };
  } catch {
    return null;
  }
}
