/**
 * RepriceService — DB orchestration for CMV & precificação (/precificacao).
 *
 * Wraps the pure PricingEngine with Prisma I/O:
 *   • getOrCreateConfig     — each restaurant's assumptions + reprice device
 *   • updateCostsWithReprice— save item costs, audit them, and (in AUTO mode)
 *                             apply the new ideal prices within the guardrail
 *   • applySuggestedPrices  — the lojista explicitly applies suggestions
 *   • repriceAllAfterConfigChange — AUTO mode reacts to assumption changes
 *
 * Every applied price/cost change writes a PriceChangeLog row. The suggested
 * price is ALWAYS recomputed server-side from the saved config — the client
 * never sends a target price.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type { PriceChangeSource, RestaurantPricingConfig } from "@prisma/client";
import {
  changePct,
  computeFixedPct,
  computeMarkup,
  idealPrice,
  type RoundingMode,
} from "./PricingEngine";

const num = (d: Decimal | null | undefined): number | null =>
  d === null || d === undefined ? null : Number(d);

export interface RepriceOutcome {
  applied: number; // prices actually changed
  heldByGuardrail: number; // AUTO wanted to change but |variation| > maxAutoChangePct
  skipped: number; // no cost / invalid markup / already at the ideal price
  changedIds: string[]; // ids whose price was applied
}

/** Fresh DB state of the touched items, for the client to merge into its table. */
export interface ItemPriceState {
  id: string;
  price: number;
  cost: number | null;
}

export async function fetchItemsState(
  restaurantId: string,
  itemIds: string[]
): Promise<ItemPriceState[]> {
  if (itemIds.length === 0) return [];
  const items = await prisma.menuItem.findMany({
    where: { id: { in: itemIds }, category: { restaurantId } },
    select: { id: true, price: true, cost: true },
  });
  return items.map((i) => ({ id: i.id, price: Number(i.price), cost: num(i.cost) }));
}

export async function getOrCreateConfig(
  restaurantId: string
): Promise<RestaurantPricingConfig> {
  return prisma.restaurantPricingConfig.upsert({
    where: { restaurantId },
    update: {},
    create: { restaurantId },
  });
}

/**
 * The markup the saved config produces, or null when the assumptions don't
 * yield a usable multiplier yet. Missing revenue/fixed data counts as 0% fixed
 * (the page nudges the lojista to fill it), and a totalPct of 0 means the
 * lojista hasn't set premissas at all — no markup, no suggestions.
 */
export function markupFromConfig(config: RestaurantPricingConfig): number | null {
  const fixedPct =
    computeFixedPct(num(config.monthlyRevenue), num(config.fixedExpensesMonthly)) ?? 0;
  const result = computeMarkup({
    fixedPct,
    taxesFeesPct: num(config.taxesFeesPct) ?? 0,
    targetProfitPct: num(config.targetProfitPct) ?? 0,
  });
  if (!result || result.totalPct <= 0) return null;
  return result.markup;
}

interface ApplyIdealOptions {
  source: PriceChangeSource;
  userId: string | null;
  /** AUTO respects maxAutoChangePct; an explicit lojista click does not. */
  respectGuardrail: boolean;
}

/**
 * Recompute each item's ideal price from the saved config and apply it.
 * Items without cost, with no computable ideal, or already at the ideal are
 * skipped. Updates + audit rows run in one transaction.
 */
async function applyIdealToItems(
  restaurantId: string,
  itemIds: string[],
  config: RestaurantPricingConfig,
  opts: ApplyIdealOptions
): Promise<RepriceOutcome> {
  const outcome: RepriceOutcome = {
    applied: 0,
    heldByGuardrail: 0,
    skipped: 0,
    changedIds: [],
  };
  if (itemIds.length === 0) return outcome;

  const markup = markupFromConfig(config);
  if (markup === null) {
    outcome.skipped = itemIds.length;
    return outcome;
  }

  const items = await prisma.menuItem.findMany({
    where: { id: { in: itemIds }, category: { restaurantId } },
    select: { id: true, name: true, price: true, cost: true },
  });

  const maxChange = num(config.maxAutoChangePct) ?? 0;
  const rounding = config.rounding as RoundingMode;
  const writes = [];

  for (const item of items) {
    const currentPrice = Number(item.price);
    const cost = num(item.cost);
    const ideal = idealPrice(cost, markup, rounding);

    if (ideal === null || ideal === currentPrice) {
      outcome.skipped++;
      continue;
    }

    const variation = changePct(currentPrice, ideal);
    if (opts.respectGuardrail && variation !== null && Math.abs(variation) > maxChange) {
      outcome.heldByGuardrail++;
      continue;
    }

    writes.push(
      prisma.menuItem.update({
        where: { id: item.id },
        data: { price: new Decimal(ideal.toFixed(2)) },
      }),
      prisma.priceChangeLog.create({
        data: {
          restaurantId,
          menuItemId: item.id,
          itemName: item.name,
          oldPrice: item.price,
          newPrice: new Decimal(ideal.toFixed(2)),
          oldCost: item.cost,
          newCost: item.cost,
          source: opts.source,
          changedByUserId: opts.userId,
        },
      })
    );
    outcome.applied++;
    outcome.changedIds.push(item.id);
  }

  if (writes.length > 0) await prisma.$transaction(writes);
  return outcome;
}

export interface UpdateCostsResult {
  updated: number;
  auto: RepriceOutcome | null; // null when the device is not in AUTO mode
  items: ItemPriceState[]; // fresh state of every touched item (cost and/or price)
}

/**
 * Save item costs (null clears), audit each real change as COST_EDIT, then —
 * when the device is in AUTO mode — apply the resulting ideal prices within
 * the guardrail. Fails if any id is not an item of this restaurant.
 */
export async function updateCostsWithReprice(
  restaurantId: string,
  changes: Array<{ id: string; cost: number | null }>,
  userId: string | null
): Promise<ServiceResult<UpdateCostsResult>> {
  const ids = changes.map((c) => c.id);
  const items = await prisma.menuItem.findMany({
    where: { id: { in: ids }, category: { restaurantId } },
    select: { id: true, name: true, cost: true, price: true },
  });

  if (items.length !== ids.length) {
    return serviceFail("Um ou mais itens não pertencem a este restaurante.", 404);
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const writes = [];
  const changedIds: string[] = [];

  for (const change of changes) {
    const item = byId.get(change.id)!;
    const oldCost = num(item.cost);
    if (oldCost === change.cost) continue; // no-op: don't write, don't audit

    changedIds.push(change.id);
    writes.push(
      prisma.menuItem.update({
        where: { id: change.id },
        data: { cost: change.cost === null ? null : new Decimal(change.cost.toFixed(2)) },
      }),
      prisma.priceChangeLog.create({
        data: {
          restaurantId,
          menuItemId: item.id,
          itemName: item.name,
          oldPrice: item.price,
          newPrice: item.price,
          oldCost: item.cost,
          newCost: change.cost === null ? null : new Decimal(change.cost.toFixed(2)),
          source: "COST_EDIT",
          changedByUserId: userId,
        },
      })
    );
  }

  if (writes.length > 0) await prisma.$transaction(writes);

  let auto: RepriceOutcome | null = null;
  const config = await getOrCreateConfig(restaurantId);
  if (config.autoRepriceMode === "AUTO" && changedIds.length > 0) {
    auto = await applyIdealToItems(restaurantId, changedIds, config, {
      source: "AUTO",
      userId,
      respectGuardrail: true,
    });
  }

  const freshItems = await fetchItemsState(restaurantId, changedIds);
  return serviceOk({ updated: changedIds.length, auto, items: freshItems });
}

/**
 * The lojista explicitly applies the suggested price to these items
 * (individual "Aplicar" or bulk "Aplicar sugeridos"). No guardrail — the UI
 * showed the exact variation and asked for confirmation.
 */
export async function applySuggestedPrices(
  restaurantId: string,
  itemIds: string[],
  userId: string | null
): Promise<ServiceResult<RepriceOutcome & { items: ItemPriceState[] }>> {
  const config = await getOrCreateConfig(restaurantId);
  if (markupFromConfig(config) === null) {
    return serviceFail(
      "Defina as premissas de precificação (Bloco Custos & Fórmula) antes de aplicar preços.",
      400
    );
  }
  const outcome = await applyIdealToItems(restaurantId, itemIds, config, {
    source: "APPLIED",
    userId,
    respectGuardrail: false,
  });
  const items = await fetchItemsState(restaurantId, itemIds);
  return serviceOk({ ...outcome, items });
}

/**
 * After the premissas/rounding change: in AUTO mode, re-derive every costed
 * active item's ideal price and apply within the guardrail. In OFF/SUGGEST the
 * page simply shows the refreshed suggestions — nothing is written.
 */
export async function repriceAllAfterConfigChange(
  restaurantId: string,
  userId: string | null
): Promise<RepriceOutcome | null> {
  const config = await getOrCreateConfig(restaurantId);
  if (config.autoRepriceMode !== "AUTO") return null;

  const items = await prisma.menuItem.findMany({
    where: { isActive: true, cost: { not: null }, category: { restaurantId } },
    select: { id: true },
  });

  return applyIdealToItems(
    restaurantId,
    items.map((i) => i.id),
    config,
    { source: "AUTO", userId, respectGuardrail: true }
  );
}

export const RepriceService = {
  getOrCreateConfig,
  markupFromConfig,
  updateCostsWithReprice,
  applySuggestedPrices,
  repriceAllAfterConfigChange,
  fetchItemsState,
};
