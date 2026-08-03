import { z } from "zod";

// E.164: +55 followed by 10-11 digits (Brazil)
const phoneRegex = /^\+[1-9]\d{7,14}$/;

export const createCustomerSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z
    .string()
    .regex(phoneRegex, "Phone must be in E.164 format (e.g. +5511999990000)"),
  email: z.string().email().optional().or(z.literal("")),
  birthDate: z.string().datetime().optional().or(z.literal("")),
  notes: z.string().max(1000).optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().regex(phoneRegex).optional(),
  // Accept "", null and undefined for the optional email — the edit form sends
  // `null` to clear it, and an empty string is the same intent. Without the
  // `.nullable()` a customer with a blank email could never be saved at all.
  email: z.string().email().nullable().optional().or(z.literal("")),
  birthDate: z.string().datetime().nullable().optional().or(z.literal("")),
  notes: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
