import { z } from "zod";

// ─── Categories ───────────────────────────────────────────────

export const createMenuCategorySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateMenuCategorySchema = createMenuCategorySchema.partial();

export const reorderCategoriesSchema = z.object({
  // Array of { id, sortOrder } pairs
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
  imageUrl: z.string().url().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  showInDelivery: z.boolean().default(true),
  showInDineIn: z.boolean().default(true),
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

export type CreateMenuCategoryInput = z.infer<typeof createMenuCategorySchema>;
export type UpdateMenuCategoryInput = z.infer<typeof updateMenuCategorySchema>;
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
