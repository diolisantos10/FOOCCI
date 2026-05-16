import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskSecret } from "@/lib/crypto";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type { UpsertEvolutionConfigInput } from "@/validators/evolution";
import type { EvolutionConfigSnapshot } from "@/lib/evolution/EvolutionClient";

// Shape returned to API callers — secrets are masked, never plain.
export interface EvolutionConfigView {
  id: string;
  restaurantId: string;
  instanceName: string;
  baseUrl: string;
  apiKeyPreview: string;        // e.g. "sk_l...0000"
  webhookSecretPreview: string; // e.g. "abc1...xyz9"
  isActive: boolean;
  updatedAt: Date;
}

export class EvolutionConfigService {
  /**
   * Create or replace the Evolution config for a restaurant.
   * Secrets are encrypted before storage.
   */
  static async upsert(
    restaurantId: string,
    input: UpsertEvolutionConfigInput
  ): Promise<ServiceResult<EvolutionConfigView>> {
    const encryptedApiKey = encrypt(input.apiKey);
    const encryptedWebhookSecret = encrypt(input.webhookSecret);

    const config = await prisma.evolutionConfig.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        instanceName: input.instanceName,
        baseUrl: input.baseUrl,
        apiKey: encryptedApiKey,
        webhookSecret: encryptedWebhookSecret,
        isActive: true,
      },
      update: {
        instanceName: input.instanceName,
        baseUrl: input.baseUrl,
        apiKey: encryptedApiKey,
        webhookSecret: encryptedWebhookSecret,
        isActive: true,
      },
    });

    return serviceOk(toView(config));
  }

  /**
   * Return the masked view for a restaurant — safe to expose via API.
   */
  static async getView(
    restaurantId: string
  ): Promise<ServiceResult<EvolutionConfigView>> {
    const config = await prisma.evolutionConfig.findUnique({
      where: { restaurantId },
    });

    if (!config) {
      return serviceFail("Evolution config not found", 404);
    }

    return serviceOk(toView(config));
  }

  /**
   * Return a decrypted config snapshot for internal service use only.
   * NEVER expose this object via API responses.
   * Pass includeWebhookSecret=true only for hard-reset / admin flows.
   */
  static async getSnapshot(
    restaurantId: string,
    includeWebhookSecret = false
  ): Promise<ServiceResult<EvolutionConfigSnapshot>> {
    const config = await prisma.evolutionConfig.findUnique({
      where: { restaurantId },
    });

    if (!config) {
      return serviceFail("Evolution config not configured for this restaurant", 404);
    }

    return serviceOk({
      instanceName:  config.instanceName,
      baseUrl:       config.baseUrl,
      apiKey:        decrypt(config.apiKey),
      ...(includeWebhookSecret ? { webhookSecret: decrypt(config.webhookSecret) } : {}),
    });
  }

  /**
   * Find a restaurant by their Evolution instanceName.
   * Used by the webhook receiver to route inbound events to the right tenant.
   *
   * isActive is intentionally NOT filtered here: deactivate() is called during
   * every hard-reset. Filtering to isActive=true means all webhook events —
   * including connection.update with state "open" that would reactivate the config —
   * are silently discarded, creating a deadlock. Security is preserved by the
   * webhookSecret comparison that follows this lookup in the webhook handler.
   */
  static async findRestaurantByInstance(
    instanceName: string
  ): Promise<ServiceResult<{ restaurantId: string; webhookSecret: string; isActive: boolean }>> {
    const config = await prisma.evolutionConfig.findFirst({
      where: { instanceName },
      select: { restaurantId: true, webhookSecret: true, isActive: true },
    });

    if (!config) {
      return serviceFail(`No Evolution config for instance "${instanceName}"`, 404);
    }

    return serviceOk({
      restaurantId:  config.restaurantId,
      webhookSecret: decrypt(config.webhookSecret),
      isActive:      config.isActive,
    });
  }

  static async activate(
    restaurantId: string
  ): Promise<ServiceResult<void>> {
    await prisma.evolutionConfig.updateMany({
      where: { restaurantId },
      data: { isActive: true },
    });
    return serviceOk(undefined);
  }

  static async deactivate(
    restaurantId: string
  ): Promise<ServiceResult<void>> {
    await prisma.evolutionConfig.updateMany({
      where: { restaurantId },
      data: { isActive: false },
    });
    return serviceOk(undefined);
  }
}

// ─── private helper ──────────────────────────────────────────

function toView(config: {
  id: string;
  restaurantId: string;
  instanceName: string;
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  isActive: boolean;
  updatedAt: Date;
}): EvolutionConfigView {
  let apiKeyPreview = "***";
  let webhookSecretPreview = "***";

  try {
    apiKeyPreview = maskSecret(decrypt(config.apiKey));
    webhookSecretPreview = maskSecret(decrypt(config.webhookSecret));
  } catch {
    // If decryption fails (e.g. key rotation) return *** rather than crashing.
  }

  return {
    id: config.id,
    restaurantId: config.restaurantId,
    instanceName: config.instanceName,
    baseUrl: config.baseUrl,
    apiKeyPreview,
    webhookSecretPreview,
    isActive: config.isActive,
    updatedAt: config.updatedAt,
  };
}
