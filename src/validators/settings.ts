import { z } from "zod";

// ── Store ──────────────────────────────────────────────────────────────────────

const str   = (max: number) => z.string().max(max).nullable().optional();
const phone  = () => z.string().max(30).nullable().optional();

export const upsertStoreSchema = z.object({
  // ── Dados básicos (Restaurant table) ──────────────────────────
  name:        z.string().min(1, "Nome obrigatório").max(120),
  description: str(1000),
  timezone:    str(60),

  // ── Dados da loja (StoreProfile) ──────────────────────────────
  tradeName:   str(120),
  legalName:   str(200),
  cuisineType: str(100),

  // ── Dados fiscais ──────────────────────────────────────────────
  cnpj:                  str(20),
  stateRegistration:     str(60),
  municipalRegistration: str(60),
  taxRegime:             str(100),
  legalResponsibleName:  str(120),
  legalResponsibleCpf:   str(20),

  // ── Endereço ───────────────────────────────────────────────────
  cep:            str(10),
  street:         str(200),
  streetNumber:   str(20),
  complement:     str(100),
  neighborhood:   str(100),
  city:           str(100),
  state:          str(2),
  country:        str(60),
  referencePoint: str(200),
  latitude:       z.number().nullable().optional(),
  longitude:      z.number().nullable().optional(),

  // ── Contatos ──────────────────────────────────────────────────
  mainPhone:         phone(),
  whatsappPhone:     phone(),
  secondaryPhone:    phone(),
  secondaryWhatsapp: phone(),
  mainEmail:         str(120),
  financeEmail:      str(120),
  supportEmail:      str(120),

  // ── Responsáveis ──────────────────────────────────────────────
  ownerName:       str(120),
  ownerRole:       str(80),
  ownerPhone:      phone(),
  ownerWhatsapp:   phone(),
  ownerEmail:      str(120),
  managerName:     str(120),
  managerRole:     str(80),
  managerPhone:    phone(),
  managerWhatsapp: phone(),
  managerEmail:    str(120),

  // ── Operação ──────────────────────────────────────────────────
  deliveryEnabled:           z.boolean().optional(),
  pickupEnabled:             z.boolean().optional(),
  dineInEnabled:             z.boolean().optional(),
  averagePreparationMinutes: z.number().int().min(1).max(300).nullable().optional(),
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
