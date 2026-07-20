import { z } from "zod";

// Money-ish optional field: accepts a non-negative number, or ""/null to mean
// "not informed" (stored as NULL). Mirrors channelPriceField in validators/menu.
const optionalMoneyField = z.preprocess(
  (val) => (val === "" || val === null || val === undefined ? null : Number(val)),
  z.number().nonnegative("Valor não pode ser negativo").multipleOf(0.01).nullable()
).optional();

// ─── Config (Bloco A premissas + Bloco C automação) ───────────

export const pricingConfigSchema = z.object({
  monthlyRevenue: optionalMoneyField,
  fixedExpensesMonthly: optionalMoneyField,
  taxesFeesPct: z.number().min(0).max(99, "Percentual deve ficar abaixo de 100"),
  targetProfitPct: z.number().min(0).max(99, "Percentual deve ficar abaixo de 100"),
  autoRepriceMode: z.enum(["OFF", "SUGGEST", "AUTO"]),
  rounding: z.enum(["NONE", "ENDING_90", "ENDING_99"]),
  maxAutoChangePct: z.number().min(0).max(100),
  periodOpeningStock: optionalMoneyField,
  periodPurchases: optionalMoneyField,
  periodClosingStock: optionalMoneyField,
  periodRevenue: optionalMoneyField,
});

// ─── Costs (Bloco B — edição de custo, individual ou em massa) ─

export const updateCostsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().cuid(),
        // null clears the cost ("não informado")
        cost: z
          .number()
          .nonnegative("Custo não pode ser negativo")
          .multipleOf(0.01, "Custo deve ter no máximo 2 casas decimais")
          .nullable(),
      })
    )
    .min(1)
    .max(500),
});

// ─── Apply suggested prices (Bloco B — individual ou em massa) ─

export const applyPricesSchema = z.object({
  itemIds: z.array(z.string().cuid()).min(1).max(500),
});

// ─── Markup por categoria (aba Markup) ────────────────────────

export const categoryMarkupSchema = z.object({
  items: z
    .array(
      z.object({
        categoryId: z.string().cuid(),
        // null = volta ao markup global; ≥1 porque abaixo de 1× vende no prejuízo
        markupOverride: z
          .number()
          .min(1, "Markup deve ser no mínimo 1×")
          .max(50, "Markup alto demais")
          .nullable(),
      })
    )
    .min(1)
    .max(200),
});

// ─── Exported types ───────────────────────────────────────────

export type PricingConfigInput = z.infer<typeof pricingConfigSchema>;
export type UpdateCostsInput = z.infer<typeof updateCostsSchema>;
export type ApplyPricesInput = z.infer<typeof applyPricesSchema>;
export type CategoryMarkupInput = z.infer<typeof categoryMarkupSchema>;
