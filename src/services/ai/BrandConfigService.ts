import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type { UpsertBrandConfigInput } from "@/validators/brand-config";
import { DEFAULT_BRAND_CONFIG } from "@/validators/brand-config";
import type { RestaurantBrandConfig } from "@prisma/client";

type PartialConfig = Partial<UpsertBrandConfigInput>;

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
      googleReviewUrl: input.googleReviewUrl ?? null,
      ifoodReviewUrl: input.ifoodReviewUrl ?? null,
      brandPersona: input.brandPersona ?? undefined,
      waiterPrompt: input.waiterPrompt ?? null,
    };

    const config = await prisma.restaurantBrandConfig.upsert({
      where: { restaurantId },
      create: { restaurantId, ...data },
      update: data,
    });

    return serviceOk(config);
  }

  /**
   * Partial update — only fields present in `input` are written.
   * Creates the record with defaults if it doesn't exist yet.
   */
  static async patch(
    restaurantId: string,
    input: PartialConfig
  ): Promise<ServiceResult<RestaurantBrandConfig>> {
    const data: Record<string, unknown> = {};
    if (input.tone              !== undefined) data.tone              = input.tone;
    if (input.formality         !== undefined) data.formality         = input.formality;
    if (input.emojiUsage        !== undefined) data.emojiUsage        = input.emojiUsage;
    if (input.communicationStyle !== undefined) data.communicationStyle = input.communicationStyle;
    if (input.upsellStyle       !== undefined) data.upsellStyle       = input.upsellStyle;
    if (input.greetingTemplate  !== undefined) data.greetingTemplate  = input.greetingTemplate ?? null;
    if (input.systemPromptOverride !== undefined) data.systemPromptOverride = input.systemPromptOverride ?? null;
    if (input.aiModel           !== undefined) data.aiModel           = input.aiModel;
    if (input.maxHistoryMessages !== undefined) data.maxHistoryMessages = input.maxHistoryMessages;
    if (input.personalityPreset !== undefined) data.personalityPreset = input.personalityPreset;
    if (input.upsellIntensity   !== undefined) data.upsellIntensity   = input.upsellIntensity;
    if (input.salesFocus        !== undefined) data.salesFocus        = input.salesFocus;
    if (input.salesPriority     !== undefined) data.salesPriority     = input.salesPriority;
    if (input.brandPrimaryColor !== undefined) data.brandPrimaryColor = input.brandPrimaryColor ?? null;
    if (input.brandSecondaryColor !== undefined) data.brandSecondaryColor = input.brandSecondaryColor ?? null;
    if (input.instagramUrl      !== undefined) data.instagramUrl      = input.instagramUrl ?? null;
    if (input.tiktokUrl         !== undefined) data.tiktokUrl         = input.tiktokUrl ?? null;
    if (input.googleReviewUrl   !== undefined) data.googleReviewUrl   = input.googleReviewUrl ?? null;
    if (input.ifoodReviewUrl    !== undefined) data.ifoodReviewUrl    = input.ifoodReviewUrl ?? null;
    if (input.waiterPrompt      !== undefined) data.waiterPrompt      = input.waiterPrompt ?? null;
    if (input.brandPersona !== undefined) {
      // Merge with existing JSON so a partial PATCH (e.g. logo-only) never
      // wipes out fields set by other parts of the form or the system.
      const existing = await prisma.restaurantBrandConfig.findUnique({
        where:  { restaurantId },
        select: { brandPersona: true },
      });
      const base = (existing?.brandPersona as Record<string, unknown>) ?? {};
      data.brandPersona = { ...base, ...(input.brandPersona as Record<string, unknown>) };
    }

    const config = await prisma.restaurantBrandConfig.upsert({
      where:  { restaurantId },
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
      googleReviewUrl: null,
      ifoodReviewUrl: null,
      brandPersona: null,
      ga4MeasurementId: null,
      gtmId: null,
      waiterPrompt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
