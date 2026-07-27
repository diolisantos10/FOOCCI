/**
 * RecipeCostService — Insumos catalog + ficha técnica v1 (/precificacao, aba Insumos).
 *
 * Flow the lojista asked for:
 *   1. importFromMenu()        — seed the catalog by parsing MenuItem.ingredients
 *                                free text; links each product to its ingredients
 *                                (quantity starts NULL = not in the math yet)
 *   2. updateIngredients()     — edit cost per unit / unit / add & remove items
 *   3. recomputeAndPropagate() — products whose ficha is COMPLETE (every line has
 *                                quantity and every ingredient has costPerUnit)
 *                                get MenuItem.cost recomputed (source RECIPE),
 *                                which feeds the existing reprice device
 *                                (SUGGEST/AUTO + guardrail + audit).
 *
 * A product with an incomplete ficha keeps its manually-typed cost untouched.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import { parseIngredientNames } from "./IngredientParser";
import {
  updateCostsWithReprice,
  type UpdateCostsResult,
} from "./RepriceService";

const num = (d: Decimal | null | undefined): number | null =>
  d === null || d === undefined ? null : Number(d);

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Import from menu ──────────────────────────────────────────────────────────

export interface ImportOutcome {
  ingredientsCreated: number;
  linksCreated: number;
  itemsLinked: number; // products that had parseable ingredients text
  itemsWithoutText: number; // products with an empty ingredients column
}

/**
 * Parse every active product's `ingredients` text, create missing catalog
 * entries and product↔ingredient links. Idempotent and additive — safe to
 * re-run after the cardápio changes; never deletes or overwrites costs.
 */
export async function importFromMenu(restaurantId: string): Promise<ImportOutcome> {
  const items = await prisma.menuItem.findMany({
    where: { isActive: true, category: { restaurantId } },
    select: { id: true, ingredients: true },
  });

  const namesPerItem = new Map<string, string[]>();
  const allNames = new Map<string, string>(); // lowercase key → display name
  let itemsWithoutText = 0;

  for (const item of items) {
    const names = parseIngredientNames(item.ingredients);
    if (names.length === 0) {
      itemsWithoutText++;
      continue;
    }
    namesPerItem.set(item.id, names);
    for (const n of names) {
      const key = n.toLocaleLowerCase("pt-BR");
      if (!allNames.has(key)) allNames.set(key, n);
    }
  }

  // Create missing ingredients (unique on restaurantId+name).
  const existing = await prisma.ingredient.findMany({
    where: { restaurantId },
    select: { id: true, name: true },
  });
  const idByKey = new Map(existing.map((i) => [i.name.toLocaleLowerCase("pt-BR"), i.id]));

  const toCreate = Array.from(allNames.entries()).filter(([key]) => !idByKey.has(key));
  if (toCreate.length > 0) {
    await prisma.ingredient.createMany({
      data: toCreate.map(([, name]) => ({ restaurantId, name })),
      skipDuplicates: true,
    });
    const fresh = await prisma.ingredient.findMany({
      where: { restaurantId },
      select: { id: true, name: true },
    });
    idByKey.clear();
    for (const i of fresh) idByKey.set(i.name.toLocaleLowerCase("pt-BR"), i.id);
  }

  // Link products to their parsed ingredients (quantity stays NULL).
  const links: Array<{ menuItemId: string; ingredientId: string }> = [];
  for (const [menuItemId, names] of Array.from(namesPerItem.entries())) {
    for (const n of names) {
      const ingredientId = idByKey.get(n.toLocaleLowerCase("pt-BR"));
      if (ingredientId) links.push({ menuItemId, ingredientId });
    }
  }
  let linksCreated = 0;
  if (links.length > 0) {
    const res = await prisma.recipeLine.createMany({ data: links, skipDuplicates: true });
    linksCreated = res.count;
  }

  return {
    ingredientsCreated: toCreate.length,
    linksCreated,
    itemsLinked: namesPerItem.size,
    itemsWithoutText,
  };
}

// ── Recipe math + propagation ─────────────────────────────────────────────────

/**
 * For each item: if it has ≥1 recipe line AND every line has a quantity AND
 * every referenced ingredient has a costPerUnit → its recipe cost (2 dp).
 * Otherwise null (incomplete ficha — manual cost stays authoritative).
 */
export async function computeRecipeCosts(
  restaurantId: string,
  itemIds?: string[]
): Promise<Map<string, number>> {
  const lines = await prisma.recipeLine.findMany({
    where: {
      menuItem: { category: { restaurantId } },
      ...(itemIds ? { menuItemId: { in: itemIds } } : {}),
    },
    select: {
      menuItemId: true,
      quantity: true,
      ingredient: { select: { costPerUnit: true, isActive: true } },
    },
  });

  const byItem = new Map<string, { total: number; complete: boolean }>();
  for (const line of lines) {
    const entry = byItem.get(line.menuItemId) ?? { total: 0, complete: true };
    const qty = num(line.quantity);
    const unitCost = num(line.ingredient.costPerUnit);
    if (qty === null || unitCost === null) {
      entry.complete = false;
    } else {
      entry.total += qty * unitCost;
    }
    byItem.set(line.menuItemId, entry);
  }

  const result = new Map<string, number>();
  for (const [id, { total, complete }] of Array.from(byItem.entries())) {
    if (complete) result.set(id, round2(total));
  }
  return result;
}

/**
 * Recompute the given products' recipe costs and push real changes through
 * the existing cost/reprice pipeline (audit source RECIPE; the device then
 * suggests or auto-applies the new selling price per the saved config).
 */
export async function recomputeAndPropagate(
  restaurantId: string,
  itemIds: string[],
  userId: string | null
): Promise<UpdateCostsResult | null> {
  if (itemIds.length === 0) return null;
  const recipeCosts = await computeRecipeCosts(restaurantId, itemIds);
  if (recipeCosts.size === 0) return null;

  const changes = Array.from(recipeCosts.entries()).map(([id, cost]) => ({ id, cost }));
  const result = await updateCostsWithReprice(restaurantId, changes, userId, "RECIPE");
  return result.ok ? result.data : null;
}

// ── Ingredient CRUD ───────────────────────────────────────────────────────────

export interface IngredientChange {
  id: string;
  name?: string;
  unit?: string;
  costPerUnit?: number | null;
}

export interface UpdateIngredientsOutcome {
  updated: number;
  propagation: UpdateCostsResult | null; // product-cost recompute triggered by cost changes
}

export async function updateIngredients(
  restaurantId: string,
  changes: IngredientChange[],
  userId: string | null
): Promise<ServiceResult<UpdateIngredientsOutcome>> {
  const ids = changes.map((c) => c.id);
  const existing = await prisma.ingredient.findMany({
    where: { id: { in: ids }, restaurantId },
    select: { id: true, costPerUnit: true },
  });
  if (existing.length !== ids.length) {
    return serviceFail("Um ou mais insumos não pertencem a este restaurante.", 404);
  }
  const oldCostById = new Map(existing.map((i) => [i.id, num(i.costPerUnit)]));

  const costChangedIds: string[] = [];
  const writes = [];
  for (const change of changes) {
    const data: Record<string, unknown> = {};
    if (change.name !== undefined) data.name = change.name;
    if (change.unit !== undefined) data.unit = change.unit;
    if (change.costPerUnit !== undefined) {
      data.costPerUnit =
        change.costPerUnit === null ? null : new Decimal(change.costPerUnit.toFixed(4));
      if (oldCostById.get(change.id) !== change.costPerUnit) costChangedIds.push(change.id);
    }
    if (Object.keys(data).length > 0) {
      writes.push(prisma.ingredient.update({ where: { id: change.id }, data }));
    }
  }
  if (writes.length > 0) await prisma.$transaction(writes);

  // Propagate: products using the repriced ingredients get their ficha recost.
  let propagation: UpdateCostsResult | null = null;
  if (costChangedIds.length > 0) {
    const affected = await prisma.recipeLine.findMany({
      where: { ingredientId: { in: costChangedIds } },
      select: { menuItemId: true },
      distinct: ["menuItemId"],
    });
    propagation = await recomputeAndPropagate(
      restaurantId,
      affected.map((a) => a.menuItemId),
      userId
    );
  }

  return serviceOk({ updated: writes.length, propagation });
}

export async function createIngredient(
  restaurantId: string,
  input: { name: string; unit: string; costPerUnit: number | null }
): Promise<ServiceResult<{ id: string }>> {
  const existing = await prisma.ingredient.findUnique({
    where: { restaurantId_name: { restaurantId, name: input.name } },
    select: { id: true },
  });
  if (existing) return serviceFail("Já existe um insumo com esse nome.", 409);

  const created = await prisma.ingredient.create({
    data: {
      restaurantId,
      name: input.name,
      unit: input.unit,
      costPerUnit: input.costPerUnit === null ? null : new Decimal(input.costPerUnit.toFixed(4)),
    },
    select: { id: true },
  });
  return serviceOk({ id: created.id });
}

export interface BulkCreateOutcome {
  created: number; // efetivamente inseridos
  alreadyExisted: number; // nomes que já estavam no catálogo (ignorados)
  received: number; // itens válidos após dedupe da própria lista
}

/**
 * Adiciona insumos em massa a partir de uma lista (colada ou de arquivo, já
 * parseada no cliente). Dedupe em duas frentes: a lista recebida já vem sem
 * repetição, e aqui filtramos contra o catálogo existente por nome
 * case-insensitive (o unique do banco é case-sensitive, então a checagem é
 * feita em memória, como no importFromMenu). Nunca sobrescreve custo/unidade
 * de um insumo que já existe.
 */
export async function bulkCreateIngredients(
  restaurantId: string,
  items: Array<{ name: string; unit?: string; costPerUnit?: number | null }>
): Promise<ServiceResult<BulkCreateOutcome>> {
  const byKey = new Map<string, { name: string; unit: string; costPerUnit: number | null }>();
  for (const it of items) {
    const name = it.name.trim();
    if (name.length < 2) continue;
    const key = name.toLocaleLowerCase("pt-BR");
    if (!byKey.has(key)) {
      byKey.set(key, {
        name,
        unit: it.unit && it.unit.trim() ? it.unit.trim().slice(0, 20) : "un",
        costPerUnit: it.costPerUnit ?? null,
      });
    }
  }
  if (byKey.size === 0) return serviceFail("Nenhum insumo válido na lista.", 400);

  const existing = await prisma.ingredient.findMany({
    where: { restaurantId },
    select: { name: true },
  });
  const existingKeys = new Set(existing.map((e) => e.name.toLocaleLowerCase("pt-BR")));

  const toCreate = Array.from(byKey.values()).filter(
    (v) => !existingKeys.has(v.name.toLocaleLowerCase("pt-BR"))
  );

  let created = 0;
  if (toCreate.length > 0) {
    const res = await prisma.ingredient.createMany({
      data: toCreate.map((v) => ({
        restaurantId,
        name: v.name,
        unit: v.unit,
        costPerUnit: v.costPerUnit === null ? null : new Decimal(v.costPerUnit.toFixed(4)),
      })),
      skipDuplicates: true,
    });
    created = res.count;
  }

  return serviceOk({
    created,
    alreadyExisted: byKey.size - toCreate.length,
    received: byKey.size,
  });
}

export async function deleteIngredient(
  restaurantId: string,
  ingredientId: string,
  userId: string | null
): Promise<ServiceResult<{ productsRecalculated: UpdateCostsResult | null }>> {
  const ingredient = await prisma.ingredient.findUnique({
    where: { id: ingredientId },
    select: { restaurantId: true },
  });
  if (!ingredient || ingredient.restaurantId !== restaurantId) {
    return serviceFail("Insumo não encontrado.", 404);
  }

  const affected = await prisma.recipeLine.findMany({
    where: { ingredientId },
    select: { menuItemId: true },
    distinct: ["menuItemId"],
  });

  await prisma.ingredient.delete({ where: { id: ingredientId } }); // cascades recipe_lines

  // Fichas that lost a line may have become complete (or stay incomplete —
  // recompute only writes when a ficha is fully quantified).
  const propagation = await recomputeAndPropagate(
    restaurantId,
    affected.map((a) => a.menuItemId),
    userId
  );
  return serviceOk({ productsRecalculated: propagation });
}

// ── Recipe line upsert/remove (ficha por produto) ─────────────────────────────

export async function setRecipeLine(
  restaurantId: string,
  menuItemId: string,
  ingredientId: string,
  quantity: number | null,
  userId: string | null
): Promise<ServiceResult<{ propagation: UpdateCostsResult | null }>> {
  const [item, ingredient] = await Promise.all([
    prisma.menuItem.findFirst({
      where: { id: menuItemId, category: { restaurantId } },
      select: { id: true },
    }),
    prisma.ingredient.findFirst({
      where: { id: ingredientId, restaurantId },
      select: { id: true },
    }),
  ]);
  if (!item || !ingredient) return serviceFail("Produto ou insumo não encontrado.", 404);

  await prisma.recipeLine.upsert({
    where: { menuItemId_ingredientId: { menuItemId, ingredientId } },
    update: { quantity: quantity === null ? null : new Decimal(quantity.toFixed(4)) },
    create: {
      menuItemId,
      ingredientId,
      quantity: quantity === null ? null : new Decimal(quantity.toFixed(4)),
    },
  });

  const propagation = await recomputeAndPropagate(restaurantId, [menuItemId], userId);
  return serviceOk({ propagation });
}

export async function removeRecipeLine(
  restaurantId: string,
  menuItemId: string,
  ingredientId: string,
  userId: string | null
): Promise<ServiceResult<{ propagation: UpdateCostsResult | null }>> {
  const line = await prisma.recipeLine.findUnique({
    where: { menuItemId_ingredientId: { menuItemId, ingredientId } },
    select: { id: true, menuItem: { select: { category: { select: { restaurantId: true } } } } },
  });
  if (!line || line.menuItem.category.restaurantId !== restaurantId) {
    return serviceFail("Linha da ficha não encontrada.", 404);
  }
  await prisma.recipeLine.delete({ where: { id: line.id } });
  const propagation = await recomputeAndPropagate(restaurantId, [menuItemId], userId);
  return serviceOk({ propagation });
}

export const RecipeCostService = {
  importFromMenu,
  computeRecipeCosts,
  recomputeAndPropagate,
  updateIngredients,
  createIngredient,
  bulkCreateIngredients,
  deleteIngredient,
  setRecipeLine,
  removeRecipeLine,
};
