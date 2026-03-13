import { z } from "zod";

const slugRegex = /^[a-z0-9-]+$/;

export const createRestaurantSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(300).optional(),
  timezone: z.string().default("America/Sao_Paulo"),
  // Owner account created alongside the restaurant
  ownerName: z.string().min(2).max(100),
  ownerEmail: z.string().email(),
  ownerPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72), // bcrypt max
});

export const updateRestaurantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(300).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
