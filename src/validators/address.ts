import { z } from "zod";

const brazilStates = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO",
  "MA","MT","MS","MG","PA","PB","PR","PE","PI",
  "RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;

export const createAddressSchema = z.object({
  label: z.string().max(50).optional(),
  street: z.string().min(2).max(200),
  number: z.string().min(1).max(20),
  complement: z.string().max(100).optional(),
  neighborhood: z.string().min(2).max(100),
  city: z.string().min(2).max(100),
  state: z.enum(brazilStates),
  zipCode: z
    .string()
    .regex(/^\d{5}-?\d{3}$/, "CEP inválido (formato: 00000-000)"),
  isDefault: z.boolean().default(false),
});

export const updateAddressSchema = createAddressSchema.partial();

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
