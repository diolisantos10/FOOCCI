import { z } from "zod";

// Optional per-channel price. Accepts a positive number, or null/empty to
// "use the base price" (channel pricing is backwards compatible).
const channelPriceField = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? null : Number(val)),
  z.number().positive("Preço deve ser maior que zero").multipleOf(0.01).nullable(),
).optional();

// ─── Categories ───────────────────────────────────────────────

export const createMenuCategorySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  imageUrl: z.string().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  showInDelivery: z.boolean().default(true),
  showInDineIn: z.boolean().default(true),
});

export const updateMenuCategorySchema = createMenuCategorySchema.partial();

export const reorderCategoriesSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().cuid(),
      sortOrder: z.number().int().min(0),
    })
  ),
});

// ─── Items ────────────────────────────────────────────────────

export const createMenuItemSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  ingredients: z.string().max(2000).optional(),
  price: z
    .number()
    .positive("Price must be positive")
    .multipleOf(0.01, "Price must have at most 2 decimal places"),
  // Channel-based pricing (null/omitted = fall back to base price).
  priceDelivery: channelPriceField,
  priceDineIn:   channelPriceField,
  priceIfood:    channelPriceField,
  imageUrl: z.string().nullable().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  showInDelivery: z.boolean().default(true),
  showInDineIn: z.boolean().default(true),
  hasVariants: z.boolean().default(false),
  code: z.string().max(100).optional(),
  servingSize: z.number().int().min(1).max(20).optional(),
  portionInfo: z.string().max(50).optional(),
  tagFunil:             z.string().max(50).optional(),
  perfilPaladar:        z.string().max(200).optional(),
  harmonizacaoSugerida: z.string().max(200).optional(),
  alergenosDetalhados:  z.string().max(500).optional(),
  storytellingIA:       z.string().max(1000).optional(),
});

export const updateMenuItemSchema = createMenuItemSchema.partial().extend({
  categoryId: z.string().cuid().optional(),
});

export const reorderItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().cuid(),
      sortOrder: z.number().int().min(0),
    })
  ),
});

// ─── Variants ────────────────────────────────────────────────

export const createVariantSchema = z.object({
  name: z.string().min(1, "Nome da variação é obrigatório.").max(100),
  // Optional. null/omitted = inherit the parent product's price for the channel.
  // When provided it must be a valid non-negative price (blank is normalized to null
  // by the client before it reaches here).
  price: z
    .number({ invalid_type_error: "Preço da variação inválido." })
    .nonnegative("Preço da variação inválido.")
    .multipleOf(0.01, "Preço da variação inválido.")
    .nullable()
    .optional(),
  priceDelivery: channelPriceField,
  priceDineIn:   channelPriceField,
  priceIfood:    channelPriceField,
  // Optional per-variant photo. Blank/null accepted — falls back to the product image.
  imageUrl: z.string().nullable().optional().or(z.literal("")),
  portion: z.string().max(50).optional(),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateVariantSchema = createVariantSchema.partial();

export const reorderVariantsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().cuid(),
      sortOrder: z.number().int().min(0),
    })
  ),
});

// ─── Extras ──────────────────────────────────────────────────

export const createExtraSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100),
  quantity: z.number().int().min(1, "Quantidade mínima é 1"),
  price: z.number().min(0, "Preço não pode ser negativo").multipleOf(0.01),
  portion: z.string().max(50).optional(),
  isAvailable: z.boolean().default(true).optional(),
});

export const updateExtraSchema = createExtraSchema.partial();

// ─── Option Groups ────────────────────────────────────────────

export const createOptionGroupSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100),
  required: z.boolean().default(false),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateOptionGroupSchema = createOptionGroupSchema.partial();

export const createOptionItemSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100),
  price: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? 0 : Number(val)),
    z.number().min(0, "Preço não pode ser negativo").multipleOf(0.01)
  ).default(0),
  portion: z.string().max(50).nullish(),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateOptionItemSchema = createOptionItemSchema.partial();

// ─── Bulk price ───────────────────────────────────────────────

export const bulkPriceSchema = z.object({
  action: z.enum(["increase", "decrease", "set"]),
  value: z.number().positive("Valor deve ser positivo"),
  categoryId: z.string().cuid().optional(), // omit = all active items
  applyToVariants: z.boolean().default(false),
});

// ─── Exported types ───────────────────────────────────────────

export type CreateMenuCategoryInput = z.infer<typeof createMenuCategorySchema>;
export type UpdateMenuCategoryInput = z.infer<typeof updateMenuCategorySchema>;
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type ReorderVariantsInput = z.infer<typeof reorderVariantsSchema>;
export type BulkPriceInput = z.infer<typeof bulkPriceSchema>;
export type CreateExtraInput = z.infer<typeof createExtraSchema>;
export type UpdateExtraInput = z.infer<typeof updateExtraSchema>;
export type CreateOptionGroupInput = z.infer<typeof createOptionGroupSchema>;
export type UpdateOptionGroupInput = z.infer<typeof updateOptionGroupSchema>;
export type CreateOptionItemInput = z.infer<typeof createOptionItemSchema>;
export type UpdateOptionItemInput = z.infer<typeof updateOptionItemSchema>;
