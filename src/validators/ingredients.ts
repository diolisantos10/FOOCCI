import { z } from "zod";

// Cost per unit uses 4 decimal places (g/ml pricing needs the precision).
const costPerUnitField = z
  .number()
  .nonnegative("Custo não pode ser negativo")
  .max(999999, "Custo alto demais")
  .nullable();

const unitField = z.string().min(1).max(20);

export const createIngredientSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(60),
  unit: unitField.default("un"),
  costPerUnit: costPerUnitField.optional().default(null),
});

export const updateIngredientsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().cuid(),
        name: z.string().trim().min(2).max(60).optional(),
        unit: unitField.optional(),
        costPerUnit: costPerUnitField.optional(),
      })
    )
    .min(1)
    .max(500),
});

// Adição em massa: lista (colada ou de arquivo) já parseada no cliente.
export const bulkIngredientsSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(60),
        unit: unitField.optional(),
        costPerUnit: costPerUnitField.optional(),
      })
    )
    .min(1)
    .max(1000),
});

export const recipeLineSchema = z.object({
  menuItemId: z.string().cuid(),
  ingredientId: z.string().cuid(),
  // null = link kept but not quantified (out of the math)
  quantity: z.number().positive("Quantidade deve ser maior que zero").max(999999).nullable(),
});

export const removeRecipeLineSchema = z.object({
  menuItemId: z.string().cuid(),
  ingredientId: z.string().cuid(),
});

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientsInput = z.infer<typeof updateIngredientsSchema>;
export type BulkIngredientsInput = z.infer<typeof bulkIngredientsSchema>;
export type RecipeLineInput = z.infer<typeof recipeLineSchema>;
