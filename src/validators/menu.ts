import { z } from "zod";

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
  price: z
    .number()
    .positive("Price must be positive")
    .multipleOf(0.01, "Price must have at most 2 decimal places"),
  imageUrl: z.string().nullable().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  showInDelivery: z.boolean().default(true),
  showInDineIn: z.boolean().default(true),
  hasVariants: z.boolean().default(false),
});

export const updateMenuItemSchema = createMenuItemSchema.partial();

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
  name: z.string().min(1, "Nome é obrigatório").max(100),
  price: z
    .number()
    .positive("Preço deve ser maior que zero")
    .multipleOf(0.01, "Preço deve ter no máximo 2 casas decimais"),
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
