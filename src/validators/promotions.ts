import { z } from "zod";

// ── Enums (mirror Prisma) ──────────────────────────────────────────────────────

export const PROMOTION_TYPES = ["PERCENTAGE", "FIXED", "COMBO", "FREE_DELIVERY", "COUPON"] as const;
export const PROMOTION_STATUSES = ["DRAFT", "ACTIVE", "PAUSED"] as const;
export const PROMOTION_CHANNELS = ["QR_MENU", "DELIVERY", "WHATSAPP", "ALL"] as const;
export const PROMOTION_TARGETS = ["PRODUCT", "CATEGORY", "ORDER"] as const;

export type PromotionType = (typeof PROMOTION_TYPES)[number];
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];
export type PromotionChannel = (typeof PROMOTION_CHANNELS)[number];
export type PromotionTarget = (typeof PROMOTION_TARGETS)[number];

// ── Shared field definitions ──────────────────────────────────────────────────

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Create schema ─────────────────────────────────────────────────────────────

export const createPromotionSchema = z.object({
  name:              z.string().min(1).max(120),
  description:       z.string().max(500).optional(),
  type:              z.enum(PROMOTION_TYPES),
  discountValue:     z.number().min(0).max(100000),
  target:            z.enum(PROMOTION_TARGETS).default("ORDER"),
  targetProductIds:  z.array(z.string()).default([]),
  targetCategoryIds: z.array(z.string()).default([]),
  channel:           z.enum(PROMOTION_CHANNELS).default("ALL"),
  couponCode:        z.string().max(50).optional(),
  bannerImageUrl:    z.string().url().optional(),
  startsAt:          z.string().datetime({ offset: true }).optional(),
  endsAt:            z.string().datetime({ offset: true }).optional(),
  daysOfWeek:        z.array(z.number().int().min(0).max(6)).default([]),
  timeFrom:          z.string().regex(timePattern, "Use HH:MM format").optional(),
  timeTo:            z.string().regex(timePattern, "Use HH:MM format").optional(),
  minOrderValue:     z.number().min(0).optional(),
  minQuantity:       z.number().int().min(1).optional(),
  maxUses:           z.number().int().min(1).optional(),
  oneTimePerUser:    z.boolean().default(false),
  combinable:        z.boolean().default(false),
});

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

// ── Update schema (all optional) ──────────────────────────────────────────────

export const updatePromotionSchema = createPromotionSchema
  .partial()
  .extend({ status: z.enum(PROMOTION_STATUSES).optional() });

export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

// ── List query ────────────────────────────────────────────────────────────────

export const promotionListQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum([...PROMOTION_STATUSES, "SCHEDULED", "EXPIRED"] as const).optional(),
  type:   z.enum(PROMOTION_TYPES).optional(),
  search: z.string().optional(),
});

export type PromotionListQuery = z.infer<typeof promotionListQuerySchema>;
