import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type { UpsertBrandConfigInput } from "@/validators/brand-config";
import { DEFAULT_BRAND_CONFIG } from "@/validators/brand-config";
import type { RestaurantBrandConfig } from "@prisma/client";

export class BrandConfigService {
  /**
   * Upsert brand voice configuration for a restaurant.
   */
  static async upsert(
    restaurantId: string,
    input: UpsertBrandConfigInput
  ): Promise<ServiceResult<RestaurantBrandConfig>> {
    const config = await prisma.restaurantBrandConfig.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        tone: input.tone,
        formality: input.formality,
        emojiUsage: input.emojiUsage,
        communicationStyle: input.communicationStyle,
        upsellStyle: input.upsellStyle,
        greetingTemplate: input.greetingTemplate ?? null,
        systemPromptOverride: input.systemPromptOverride ?? null,
        aiModel: input.aiModel,
        maxHistoryMessages: input.maxHistoryMessages,
      },
      update: {
        tone: input.tone,
        formality: input.formality,
        emojiUsage: input.emojiUsage,
        communicationStyle: input.communicationStyle,
        upsellStyle: input.upsellStyle,
        greetingTemplate: input.greetingTemplate ?? null,
        systemPromptOverride: input.systemPromptOverride ?? null,
        aiModel: input.aiModel,
        maxHistoryMessages: input.maxHistoryMessages,
      },
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

    // Return a synthetic default — not persisted, just for the current turn.
    return {
      id: "",
      restaurantId,
      ...DEFAULT_BRAND_CONFIG,
      greetingTemplate: null,
      systemPromptOverride: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
