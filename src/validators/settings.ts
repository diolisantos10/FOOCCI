import { z } from "zod";

// ── Store ──────────────────────────────────────────────────────────────────────

export const upsertStoreSchema = z.object({
  name:        z.string().min(1, "Nome obrigatório").max(120),
  phone:       z.string().max(30).nullable().optional(),
  address:     z.string().max(300).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  logoUrl:     z.string().max(500).nullable().optional(),
});

export type UpsertStoreInput = z.infer<typeof upsertStoreSchema>;

// ── Delivery ───────────────────────────────────────────────────────────────────

export const upsertDeliverySchema = z.object({
  // Global toggles
  enabled:          z.boolean().default(true),
  pickupEnabled:    z.boolean().default(true),

  // UI mode
  mode:             z.enum(["simple", "advanced", "distance", "manual"]).default("simple"),

  // Simple-mode flat config
  fee:              z.number().min(0).nullable().optional(),
  estimatedMinutes: z.number().int().min(1).max(300).nullable().optional(),
  areaDescription:  z.string().max(500).nullable().optional(),

  // Commercial rules
  minOrderValue:      z.number().min(0).nullable().optional(),
  freeDeliveryAbove:  z.number().min(0).nullable().optional(),

  // Distance-mode fields
  distanceBaseFee:       z.number().min(0).nullable().optional(),
  distancePricePerKm:    z.number().min(0).nullable().optional(),
  distanceMaxKm:         z.number().min(0.1).nullable().optional(),
  distanceMinFee:        z.number().min(0).nullable().optional(),
  distanceMaxFee:        z.number().min(0).nullable().optional(),
  distanceEstimatedBase: z.number().int().min(1).max(300).nullable().optional(),

  // Phase 3 hooks (accepted but not enforced)
  peakHoursEnabled: z.boolean().default(false),
  peakHoursConfig:  z.string().nullable().optional(),

  // Phase 5 geo hooks
  geoCenter:   z.string().nullable().optional(), // JSON string
  geoRadiusKm: z.number().min(0).nullable().optional(),
});

export type UpsertDeliveryInput = z.infer<typeof upsertDeliverySchema>;

// ── Delivery Zone ──────────────────────────────────────────────────────────────

export const upsertDeliveryZoneSchema = z.object({
  name:             z.string().min(1).max(100),
  sortOrder:        z.number().int().min(0).optional(),
  maxDistanceKm:    z.number().min(0.1).max(500),
  fee:              z.number().min(0),
  estimatedMinutes: z.number().int().min(1).max(300),
  minOrderValue:    z.number().min(0).nullable().optional(),
  isActive:         z.boolean().default(true),
  // Phase 3 hook
  peakFee:          z.number().min(0).nullable().optional(),
  // Phase 5 hook
  geoPolygon:       z.string().nullable().optional(),
});

export type UpsertDeliveryZoneInput = z.infer<typeof upsertDeliveryZoneSchema>;

// ── Business hours ─────────────────────────────────────────────────────────────

export const dayHoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isOpen:    z.boolean(),
  openTime:  z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
});

export const upsertHoursSchema = z.array(dayHoursSchema).length(7);

export type DayHoursInput  = z.infer<typeof dayHoursSchema>;
export type UpsertHoursInput = z.infer<typeof upsertHoursSchema>;

// ── Payment settings ───────────────────────────────────────────────────────────

export const upsertPaymentSchema = z.object({
  acceptPix:  z.boolean().default(true),
  acceptCash: z.boolean().default(true),
  acceptCard: z.boolean().default(true),
  acceptLink: z.boolean().default(false),
});

export type UpsertPaymentInput = z.infer<typeof upsertPaymentSchema>;

// ── Store policies ─────────────────────────────────────────────────────────────

export const upsertPoliciesSchema = z.object({
  termsOfUse:         z.string().max(5000).nullable().optional(),
  privacyPolicy:      z.string().max(5000).nullable().optional(),
  cancellationPolicy: z.string().max(5000).nullable().optional(),
});

export type UpsertPoliciesInput = z.infer<typeof upsertPoliciesSchema>;

// ── Default hours (Mon-Sat open 09-22, Sun closed) ─────────────────────────────

export const DEFAULT_HOURS: DayHoursInput[] = [
  { dayOfWeek: 0, isOpen: false, openTime: "09:00", closeTime: "22:00" },
  { dayOfWeek: 1, isOpen: true,  openTime: "09:00", closeTime: "22:00" },
  { dayOfWeek: 2, isOpen: true,  openTime: "09:00", closeTime: "22:00" },
  { dayOfWeek: 3, isOpen: true,  openTime: "09:00", closeTime: "22:00" },
  { dayOfWeek: 4, isOpen: true,  openTime: "09:00", closeTime: "22:00" },
  { dayOfWeek: 5, isOpen: true,  openTime: "09:00", closeTime: "22:00" },
  { dayOfWeek: 6, isOpen: true,  openTime: "09:00", closeTime: "20:00" },
];
