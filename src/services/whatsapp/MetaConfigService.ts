/**
 * MetaConfigService — secure storage/lookup for per-restaurant Meta WhatsApp
 * credentials. accessToken + webhookVerifyToken are AES-256-GCM encrypted at rest
 * (lib/crypto). The raw token is NEVER returned to the client — only masked
 * previews via getPublic(). Evolution config is untouched.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskSecret } from "@/lib/crypto";

export interface MetaConfigInput {
  restaurantId:        string;
  wabaId:              string;
  phoneNumberId:       string;
  displayPhoneNumber?: string | null;
  businessId?:         string | null;
  configId?:           string | null;
  accessToken:         string;        // plaintext — encrypted here
  tokenExpiresAt?:     Date | null;
  webhookVerifyToken?: string;        // plaintext — generated if absent
}

/** Server-only resolved config with DECRYPTED secrets. Never send to a client. */
export interface MetaConfigResolved {
  restaurantId:       string;
  wabaId:             string;
  phoneNumberId:      string;
  displayPhoneNumber: string | null;
  businessId:         string | null;
  accessToken:        string;  // decrypted
  webhookVerifyToken: string;  // decrypted
  connectionStatus:   string;
}

/** Client-safe view — masked token, no decryptable secrets. */
export interface MetaConfigPublic {
  connected:          boolean;
  connectionStatus:   string;
  displayPhoneNumber: string | null;
  wabaId:             string | null;
  phoneNumberId:      string | null;
  businessId:         string | null;
  tokenPreview:       string | null; // "EAAB...0000"
  tokenExpiresAt:     string | null; // ISO date or null (null = token never expires)
  tokenExpiringSoon:  boolean;       // true when ≤ 30 days to expiry
  lastHealthCheckAt:  string | null;
  lastError:          string | null;
  qualityRating:      string | null;
  messagingLimit:     string | null;
  metaCrmEnabled:     boolean;
}

export function generateVerifyToken(): string {
  return randomBytes(24).toString("hex");
}

export const MetaConfigService = {
  /** Create/update a restaurant's Meta config (encrypts secrets). */
  async upsert(input: MetaConfigInput): Promise<void> {
    const accessTokenEnc = encrypt(input.accessToken);
    const verifyTokenEnc = encrypt(input.webhookVerifyToken ?? generateVerifyToken());
    const data = {
      wabaId:             input.wabaId,
      phoneNumberId:      input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber ?? null,
      businessId:         input.businessId ?? null,
      configId:           input.configId ?? null,
      accessToken:        accessTokenEnc,
      tokenExpiresAt:     input.tokenExpiresAt ?? null,
      webhookVerifyToken: verifyTokenEnc,
      connectionStatus:   "CONNECTED",
      lastError:          null,
    };
    await prisma.metaWhatsAppConfig.upsert({
      where:  { restaurantId: input.restaurantId },
      create: { restaurantId: input.restaurantId, ...data },
      update: data,
    });
  },

  async getResolved(restaurantId: string): Promise<MetaConfigResolved | null> {
    const cfg = await prisma.metaWhatsAppConfig.findUnique({ where: { restaurantId } });
    return cfg ? resolve(cfg) : null;
  },

  /** Inbound webhook routing: phone_number_id → restaurant config. */
  async getByPhoneNumberId(phoneNumberId: string): Promise<MetaConfigResolved | null> {
    const cfg = await prisma.metaWhatsAppConfig.findUnique({ where: { phoneNumberId } });
    return cfg ? resolve(cfg) : null;
  },

  /** Masked, client-safe view. */
  async getPublic(restaurantId: string): Promise<MetaConfigPublic | null> {
    const cfg = await prisma.metaWhatsAppConfig.findUnique({ where: { restaurantId } });
    if (!cfg) return null;
    let tokenPreview: string | null = null;
    try { tokenPreview = maskSecret(decrypt(cfg.accessToken)); } catch { tokenPreview = "***"; }
    const expiresAt = cfg.tokenExpiresAt;
    const tokenExpiringSoon = expiresAt != null
      ? expiresAt.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
      : false;
    return {
      connected:          cfg.connectionStatus === "CONNECTED",
      connectionStatus:   cfg.connectionStatus,
      displayPhoneNumber: cfg.displayPhoneNumber,
      wabaId:             cfg.wabaId,
      phoneNumberId:      cfg.phoneNumberId,
      businessId:         cfg.businessId,
      tokenPreview,
      tokenExpiresAt:     expiresAt?.toISOString() ?? null,
      tokenExpiringSoon,
      lastHealthCheckAt:  cfg.lastHealthCheckAt?.toISOString() ?? null,
      lastError:          cfg.lastError,
      qualityRating:      cfg.qualityRating,
      messagingLimit:     cfg.messagingLimit,
      metaCrmEnabled:     cfg.metaCrmEnabled,
    };
  },

  async setHealth(
    restaurantId: string,
    patch: { connectionStatus?: string; lastError?: string | null; qualityRating?: string | null; messagingLimit?: string | null },
  ): Promise<void> {
    await prisma.metaWhatsAppConfig.updateMany({
      where: { restaurantId },
      data:  { ...patch, lastHealthCheckAt: new Date() },
    });
  },

  async disconnect(restaurantId: string): Promise<void> {
    await prisma.metaWhatsAppConfig.updateMany({
      where: { restaurantId },
      data:  { connectionStatus: "DISCONNECTED" },
    });
  },

  /**
   * Fully remove a restaurant's Meta config so the owner can start a clean
   * Embedded Signup from scratch (e.g. connected the wrong/test number and needs
   * to pick the real one). Deleting the row — rather than just flagging it
   * DISCONNECTED — also frees the unique phoneNumberId, so the same number can be
   * reconnected later without hitting the "já conectado em outra conta" guard.
   */
  async remove(restaurantId: string): Promise<void> {
    await prisma.metaWhatsAppConfig.deleteMany({ where: { restaurantId } });
  },
};

function resolve(cfg: {
  restaurantId: string; wabaId: string; phoneNumberId: string; displayPhoneNumber: string | null;
  businessId: string | null; accessToken: string; webhookVerifyToken: string; connectionStatus: string;
}): MetaConfigResolved {
  return {
    restaurantId:       cfg.restaurantId,
    wabaId:             cfg.wabaId,
    phoneNumberId:      cfg.phoneNumberId,
    displayPhoneNumber: cfg.displayPhoneNumber,
    businessId:         cfg.businessId,
    accessToken:        decrypt(cfg.accessToken),
    webhookVerifyToken: decrypt(cfg.webhookVerifyToken),
    connectionStatus:   cfg.connectionStatus,
  };
}
