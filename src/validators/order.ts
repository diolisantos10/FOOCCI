import { z } from "zod";

// ─── Draft ────────────────────────────────────────────────────

export const createDraftSchema = z.object({
  customerId: z.string().cuid(),
  fulfillmentType: z.enum(["DELIVERY", "PICKUP", "DINE_IN"]).default("DELIVERY"),
  deliveryAddressId: z.string().cuid().optional(),
  notes: z.string().max(500).optional(),
});

export const updateDraftSchema = z.object({
  fulfillmentType: z.enum(["DELIVERY", "PICKUP", "DINE_IN"]).optional(),
  deliveryAddressId: z.string().cuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  deliveryFee: z
    .number()
    .min(0)
    .multipleOf(0.01)
    .optional(),
});

export const addDraftItemSchema = z.object({
  menuItemId: z.string().cuid(),
  quantity: z.number().int().positive(),
  notes: z.string().max(300).optional(),
  isUpsell: z.boolean().default(false),
});

export const updateDraftItemSchema = z.object({
  quantity: z.number().int().positive().optional(),
  notes: z.string().max(300).nullable().optional(),
});

export const confirmDraftSchema = z.object({
  // Optional override of delivery fee at confirmation time
  deliveryFee: z.number().min(0).multipleOf(0.01).optional(),
  // Optional discount (MANAGER+ only — validated in route handler)
  discount: z.number().min(0).multipleOf(0.01).default(0),
  notes: z.string().max(500).optional(),
});

// ─── Orders ───────────────────────────────────────────────────

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "CONFIRMED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ]),
  estimatedAt: z.string().datetime().optional(),
});

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      "PENDING",
      "CONFIRMED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED",
    ])
    .optional(),
  customerId: z.string().cuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ─── Payment ──────────────────────────────────────────────────

export const attachPaymentSchema = z.object({
  method: z.enum(["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX", "ONLINE"]),
  amount: z.number().positive().multipleOf(0.01),
});

export const updatePaymentStatusSchema = z.object({
  status: z.enum(["PAID", "FAILED", "REFUNDED"]),
  paidAt: z.string().datetime().optional(),
});

export type CreateDraftInput = z.infer<typeof createDraftSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type AddDraftItemInput = z.infer<typeof addDraftItemSchema>;
export type UpdateDraftItemInput = z.infer<typeof updateDraftItemSchema>;
export type ConfirmDraftInput = z.infer<typeof confirmDraftSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type AttachPaymentInput = z.infer<typeof attachPaymentSchema>;
export type UpdatePaymentStatusInput = z.infer<typeof updatePaymentStatusSchema>;
