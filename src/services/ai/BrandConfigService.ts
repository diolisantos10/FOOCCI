import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type { UpsertBrandConfigInput } from "@/validators/brand-config";
import { DEFAULT_BRAND_CONFIG } from "@/validators/brand-config";
import type { RestaurantBrandConfig } from "@prisma/client";

export class BrandConfigService {
  static async upsert(
    restaurantId: string,
    input: UpsertBrandConfigInput
  ): Promise<ServiceResult<RestaurantBrandConfig>> {
    const data = {
      tone: input.tone,
      formality: input.formality,
      emojiUsage: input.emojiUsage,
      communicationStyle: input.communicationStyle,
      upsellStyle: input.upsellStyle,
      greetingTemplate: input.greetingTemplate ?? null,
      systemPromptOverride: input.systemPromptOverride ?? null,
      aiModel: input.aiModel,
      maxHistoryMessages: input.maxHistoryMessages,
      // Experience fields
      personalityPreset: input.personalityPreset,
      upsellIntensity: input.upsellIntensity,
      salesFocus: input.salesFocus,
      salesPriority: input.salesPriority,
      brandPrimaryColor: input.brandPrimaryColor ?? null,
      brandSecondaryColor: input.brandSecondaryColor ?? null,
      instagramUrl: input.instagramUrl ?? null,
      tiktokUrl: input.tiktokUrl ?? null,
      brandPersona: input.brandPersona ?? undefined,
    };

    const config = await prisma.restaurantBrandConfig.upsert({
      where: { restaurantId },
      create: { restaurantId, ...data },
      update: data,
    });

    return serviceOk(config);
  }

  static async getByRestaurantId(
    restaurantId: string
  ): Promise<ServiceResult<RestaurantBrandConfig>> {
    const config = await prisma.restaurantBrandConfig.findUnique({
      where: { restaurantId },
    });

    if (!config) return serviceFail("Brand config not found", 404);
    return serviceOk(config);
  }

  /**
   * Returns saved config or in-memory defaults — never 404.
   * Used internally by AIOrderService so it always gets a valid config.
   */
  static async getOrDefault(restaurantId: string): Promise<RestaurantBrandConfig> {
    const config = await prisma.restaurantBrandConfig.findUnique({
      where: { restaurantId },
    });

    if (config) return config;

    return {
      id: "",
      restaurantId,
      tone: DEFAULT_BRAND_CONFIG.tone,
      formality: DEFAULT_BRAND_CONFIG.formality,
      emojiUsage: DEFAULT_BRAND_CONFIG.emojiUsage,
      communicationStyle: DEFAULT_BRAND_CONFIG.communicationStyle,
      upsellStyle: DEFAULT_BRAND_CONFIG.upsellStyle,
      greetingTemplate: null,
      systemPromptOverride: null,
      aiModel: DEFAULT_BRAND_CONFIG.aiModel,
      maxHistoryMessages: DEFAULT_BRAND_CONFIG.maxHistoryMessages,
      personalityPreset: DEFAULT_BRAND_CONFIG.personalityPreset,
      upsellIntensity: DEFAULT_BRAND_CONFIG.upsellIntensity,
      salesFocus: DEFAULT_BRAND_CONFIG.salesFocus,
      salesPriority: DEFAULT_BRAND_CONFIG.salesPriority,
      brandPrimaryColor: null,
      brandSecondaryColor: null,
      instagramUrl: null,
      tiktokUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
