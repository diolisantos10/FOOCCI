/**
 * Validators for the Integrations Center.
 * One schema per provider for incoming PUT (upsert) requests.
 *
 * Secret fields (apiKey, clientSecret, accessToken) accept either:
 *   - A non-empty string  → new value, will be encrypted + stored
 *   - An empty string ""  → keep existing encrypted value unchanged
 *
 * Non-secret fields (baseUrl, clientId, environment, accountId) are always
 * updated to whatever value is provided.
 */

import { z } from "zod";

export const VALID_PROVIDERS = ["stone", "mercadopago", "openai", "saipos"] as const;
export type IntegrationProvider = (typeof VALID_PROVIDERS)[number];

export function isValidProvider(v: string): v is IntegrationProvider {
  return (VALID_PROVIDERS as readonly string[]).includes(v);
}

// ── Stone ─────────────────────────────────────────────────────────────────────

export const stoneConfigSchema = z.object({
  environment:  z.enum(["sandbox", "production"]),
  clientId:     z.string().min(1, "Client ID obrigatório"),
  clientSecret: z.string(), // empty = keep existing
});

export type StoneConfigInput = z.infer<typeof stoneConfigSchema>;

// ── Mercado Pago ──────────────────────────────────────────────────────────────

export const mercadopagoConfigSchema = z.object({
  environment:  z.enum(["test", "production"]),
  accessToken:  z.string(), // secret — empty = keep existing
  // Public Key: client-safe key the browser SDK uses to tokenize the card for
  // the transparent checkout. Not a secret, but optional so existing Pix-only
  // setups keep working without it. Empty = keep existing.
  publicKey:    z.string().optional().default(""),
});

export type MercadoPagoConfigInput = z.infer<typeof mercadopagoConfigSchema>;

// ── OpenAI ────────────────────────────────────────────────────────────────────

export const openaiConfigSchema = z.object({
  apiKey: z.string(), // empty = keep existing
});

export type OpenAIConfigInput = z.infer<typeof openaiConfigSchema>;

// ── Saipos ────────────────────────────────────────────────────────────────────

export const saiposConfigSchema = z.object({
  environment:     z.enum(["HOMOLOGATION", "PRODUCTION"]),
  apiKey:          z.string(),                             // empty = keep existing
  idPartner:       z.string().min(1, "ID do parceiro obrigatório"),
  codStore:        z.string().min(1, "Código do estabelecimento obrigatório"),
  autoSendOrders:  z.union([z.boolean(), z.string().transform((v) => v === "true")]),
  syncCatalog:     z.union([z.boolean(), z.string().transform((v) => v === "true")]),
  paymentMappings: z.string().optional(), // JSON string: { "CASH": 1, "PIX": 2, ... }
  isActive:        z.union([z.boolean(), z.string().transform((v) => v === "true")]).optional(),
});

export type SaiposConfigInput = z.infer<typeof saiposConfigSchema>;

// ── Union dispatcher ──────────────────────────────────────────────────────────

export function parseProviderConfig(provider: IntegrationProvider, body: unknown) {
  switch (provider) {
    case "stone":       return stoneConfigSchema.safeParse(body);
    case "mercadopago": return mercadopagoConfigSchema.safeParse(body);
    case "openai":      return openaiConfigSchema.safeParse(body);
    case "saipos":      return saiposConfigSchema.safeParse(body);
  }
}
