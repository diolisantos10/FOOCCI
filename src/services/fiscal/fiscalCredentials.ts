/**
 * Server-only loader for per-restaurant fiscal config + secrets.
 *
 * Secrets (CSC token, gateway tokens) are stored ENCRYPTED on FiscalConfig using
 * the shared AES-256-GCM helper (@/lib/crypto, same as EvolutionConfig / payment
 * credentials). They are decrypted here and NEVER returned to the client — the
 * settings API only ever echoes masked previews.
 */

import { prisma } from "@/lib/prisma";
import { decrypt, encrypt, maskSecret } from "@/lib/crypto";
import type { FiscalConfig } from "@prisma/client";
import type { FiscalEnvironment } from "./providers/types";
import { getPlatformFiscalToken } from "./fiscalPlatform";

export { maskSecret };

/** Encrypt a fiscal secret for at-rest storage; null/empty → null (nothing stored). */
export function encryptFiscalSecret(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return encrypt(v);
}

/** Decrypt a fiscal secret; null on empty or tampered/undecryptable value. */
export function decryptFiscalSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

export interface FiscalConfigResolved {
  config: FiscalConfig; // raw row — secret columns still encrypted
  ambiente: FiscalEnvironment;
  providerToken: string | null; // decrypted token for the ACTIVE ambiente
  csc: { id: string; token: string } | null; // decrypted CSC
}

/** Load + decrypt the fiscal config for a restaurant. null when none exists. */
export async function getFiscalConfig(restaurantId: string): Promise<FiscalConfigResolved | null> {
  const config = await prisma.fiscalConfig.findUnique({ where: { restaurantId } });
  if (!config) return null;

  const ambiente: FiscalEnvironment = config.environment === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO";
  const encToken = ambiente === "PRODUCAO" ? config.providerTokenProducao : config.providerTokenHomologacao;
  // Conta-mãe: se o lojista não tem token próprio, usa o token-mestre da Foocci.
  const providerToken = decryptFiscalSecret(encToken) ?? getPlatformFiscalToken(config.provider, ambiente);

  const cscToken = decryptFiscalSecret(config.cscToken);
  const csc = config.cscId && cscToken ? { id: config.cscId, token: cscToken } : null;

  return { config, ambiente, providerToken, csc };
}

/** True when NFC-e emission is enabled AND minimally configured for this restaurant. */
export async function isFiscalEmissionEnabled(restaurantId: string): Promise<boolean> {
  const resolved = await getFiscalConfig(restaurantId);
  return Boolean(
    resolved && resolved.config.enabled && resolved.config.provider !== "DISABLED" && resolved.providerToken,
  );
}
