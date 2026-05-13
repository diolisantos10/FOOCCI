/**
 * RelationshipProgramService
 *
 * Handles tier overview stats, "close to next tier" calculations,
 * tier settings persistence, and tier recalculation for the
 * Programa de Relacionamento tab.
 *
 * Tier logic (OR rule):
 *   DIAMANTE: totalSpend >= diamondMinSpend  OR  totalOrders >= diamondMinOrders (if > 0)
 *   OURO:     totalSpend >= goldMinSpend     OR  totalOrders >= goldMinOrders    (if > 0)
 *   PRATA:    totalSpend >= silverMinSpend   OR  totalOrders >= silverMinOrders  (if > 0)
 *   BRONZE:   everything else
 *
 * Defaults match crm-helpers.ts exactly:
 *   DIAMANTE ≥ R$2000 | OURO ≥ R$800 | PRATA ≥ R$300
 */

import { prisma } from "@/lib/prisma";
import type { TierSettings } from "@prisma/client";

// ─── Exported types ───────────────────────────────────────────────────────────

export type TierKey = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

export interface TierSettingsInput {
  silverMinSpend:   number;
  silverMinOrders:  number;
  goldMinSpend:     number;
  goldMinOrders:    number;
  diamondMinSpend:  number;
  diamondMinOrders: number;
}

export const DEFAULT_SETTINGS: TierSettingsInput = {
  silverMinSpend:   300,
  silverMinOrders:  0,
  goldMinSpend:     800,
  goldMinOrders:    0,
  diamondMinSpend:  2000,
  diamondMinOrders: 0,
};

export interface TierStats {
  tier:          TierKey;
  label:         string;
  icon:          string;
  description:   string;
  customerCount: number;
  totalRevenue:  number;
  avgTicket:     number;
  avgOrders:     number;
  minSpend:      number; // threshold for this tier
  minOrders:     number; // order-count threshold (0 = disabled)
}

export interface CloseToNextTierCustomer {
  id:           string;
  name:         string;
  phone:        string;
  currentTier:  TierKey;
  nextTier:     TierKey;
  totalSpend:   number;
  totalOrders:  number;
  lastOrderAt:  Date | null;
  segment:      string;
  missingSpend: number; // how much more spend needed
  missingOrders: number; // how many more orders needed (0 if spend path is closer)
}

export interface ProgramOverview {
  tiers:           TierStats[];
  closeToNextTier: CloseToNextTierCustomer[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function settingsToInput(s: TierSettings): TierSettingsInput {
  return {
    silverMinSpend:   Number(s.silverMinSpend),
    silverMinOrders:  s.silverMinOrders,
    goldMinSpend:     Number(s.goldMinSpend),
    goldMinOrders:    s.goldMinOrders,
    diamondMinSpend:  Number(s.diamondMinSpend),
    diamondMinOrders: s.diamondMinOrders,
  };
}

export function computeTierWithSettings(
  totalSpend:   number,
  totalOrders:  number,
  settings:     TierSettingsInput,
): TierKey {
  const { silverMinSpend, silverMinOrders, goldMinSpend, goldMinOrders, diamondMinSpend, diamondMinOrders } = settings;

  // Diamond
  const diamondBySpend  = totalSpend  >= diamondMinSpend;
  const diamondByOrders = diamondMinOrders > 0 && totalOrders >= diamondMinOrders;
  if (diamondBySpend || diamondByOrders) return "DIAMANTE";

  // Gold
  const goldBySpend  = totalSpend  >= goldMinSpend;
  const goldByOrders = goldMinOrders > 0 && totalOrders >= goldMinOrders;
  if (goldBySpend || goldByOrders) return "OURO";

  // Silver
  const silverBySpend  = totalSpend  >= silverMinSpend;
  const silverByOrders = silverMinOrders > 0 && totalOrders >= silverMinOrders;
  if (silverBySpend || silverByOrders) return "PRATA";

  return "BRONZE";
}

// Given a customer's current tier, return what the next tier is (or null if at top)
function nextTier(current: TierKey): TierKey | null {
  const order: TierKey[] = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1]! : null;
}

const TIER_META: Record<TierKey, { label: string; icon: string; description: string }> = {
  BRONZE:   { label: "Bronze",   icon: "🥉", description: "Clientes em início de relacionamento." },
  PRATA:    { label: "Prata",    icon: "🥈", description: "Clientes que já demonstraram recorrência." },
  OURO:     { label: "Ouro",     icon: "🥇", description: "Clientes de alto valor para o restaurante." },
  DIAMANTE: { label: "Diamante", icon: "💎", description: "Clientes VIP que merecem atenção especial." },
};

// ─── Main service ─────────────────────────────────────────────────────────────

export class RelationshipProgramService {
  // ── Settings ───────────────────────────────────────────────────────────────

  static async getSettings(restaurantId: string): Promise<TierSettingsInput> {
    const row = await prisma.tierSettings.findUnique({ where: { restaurantId } });
    return row ? settingsToInput(row) : { ...DEFAULT_SETTINGS };
  }

  static async saveSettings(
    restaurantId: string,
    input: TierSettingsInput,
  ): Promise<TierSettingsInput> {
    const row = await prisma.tierSettings.upsert({
      where:  { restaurantId },
      update: {
        silverMinSpend:   input.silverMinSpend,
        silverMinOrders:  input.silverMinOrders,
        goldMinSpend:     input.goldMinSpend,
        goldMinOrders:    input.goldMinOrders,
        diamondMinSpend:  input.diamondMinSpend,
        diamondMinOrders: input.diamondMinOrders,
      },
      create: {
        restaurantId,
        silverMinSpend:   input.silverMinSpend,
        silverMinOrders:  input.silverMinOrders,
        goldMinSpend:     input.goldMinSpend,
        goldMinOrders:    input.goldMinOrders,
        diamondMinSpend:  input.diamondMinSpend,
        diamondMinOrders: input.diamondMinOrders,
      },
    });
    return settingsToInput(row);
  }

  // ── Recalculate all customer tiers ─────────────────────────────────────────

  static async recalculateTiers(restaurantId: string): Promise<{ updated: number }> {
    const settings = await this.getSettings(restaurantId);

    const customers = await prisma.customer.findMany({
      where:  { restaurantId, isGuest: false },
      select: { id: true, totalSpend: true, totalOrders: true },
    });

    let updated = 0;
    // Batch updates in chunks of 100
    for (let i = 0; i < customers.length; i += 100) {
      const chunk = customers.slice(i, i + 100);
      await Promise.all(
        chunk.map((c) => {
          const tier = computeTierWithSettings(
            Number(c.totalSpend),
            c.totalOrders,
            settings,
          );
          return prisma.customer.update({
            where: { id: c.id },
            data:  { tier },
          });
        }),
      );
      updated += chunk.length;
    }

    return { updated };
  }

  // ── Tier overview stats ────────────────────────────────────────────────────

  static async getOverview(restaurantId: string): Promise<ProgramOverview> {
    const settings = await this.getSettings(restaurantId);

    const customers = await prisma.customer.findMany({
      where:  { restaurantId, isGuest: false },
      select: {
        id:          true,
        name:        true,
        phone:       true,
        tier:        true,
        totalSpend:  true,
        totalOrders: true,
        lastOrderAt: true,
        segment:     true,
      },
    });

    // ── Tier stats ──────────────────────────────────────────────────────────
    const tierBuckets: Record<TierKey, { revenue: number; orders: number; count: number }> = {
      BRONZE:   { revenue: 0, orders: 0, count: 0 },
      PRATA:    { revenue: 0, orders: 0, count: 0 },
      OURO:     { revenue: 0, orders: 0, count: 0 },
      DIAMANTE: { revenue: 0, orders: 0, count: 0 },
    };

    for (const c of customers) {
      const tier = (c.tier as TierKey) in tierBuckets ? (c.tier as TierKey) : "BRONZE";
      tierBuckets[tier].count   += 1;
      tierBuckets[tier].revenue += Number(c.totalSpend);
      tierBuckets[tier].orders  += c.totalOrders;
    }

    const TIER_ORDER: TierKey[] = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];

    // Map each tier to its threshold (used for display in the UI)
    const tierMinSpend: Record<TierKey, number> = {
      BRONZE:   0,
      PRATA:    settings.silverMinSpend,
      OURO:     settings.goldMinSpend,
      DIAMANTE: settings.diamondMinSpend,
    };
    const tierMinOrders: Record<TierKey, number> = {
      BRONZE:   0,
      PRATA:    settings.silverMinOrders,
      OURO:     settings.goldMinOrders,
      DIAMANTE: settings.diamondMinOrders,
    };

    const tiers: TierStats[] = TIER_ORDER.map((key) => {
      const b    = tierBuckets[key];
      const meta = TIER_META[key];
      return {
        tier:          key,
        label:         meta.label,
        icon:          meta.icon,
        description:   meta.description,
        customerCount: b.count,
        totalRevenue:  b.revenue,
        avgTicket:     b.count > 0 ? b.revenue / b.count : 0,
        avgOrders:     b.count > 0 ? b.orders / b.count  : 0,
        minSpend:      tierMinSpend[key],
        minOrders:     tierMinOrders[key],
      };
    });

    // ── Close to next tier ──────────────────────────────────────────────────
    const PROXIMITY_SPEND_PCT  = 0.85; // within 85% of next tier spend threshold
    const closeList: CloseToNextTierCustomer[] = [];

    for (const c of customers) {
      const currentTierKey = (c.tier as TierKey) in tierBuckets ? (c.tier as TierKey) : "BRONZE";
      const next = nextTier(currentTierKey);
      if (!next) continue; // already DIAMANTE

      const spend = Number(c.totalSpend);
      const orders = c.totalOrders;

      let nextMinSpend  = 0;
      let nextMinOrders = 0;
      if (next === "PRATA")    { nextMinSpend = settings.silverMinSpend;  nextMinOrders = settings.silverMinOrders; }
      if (next === "OURO")     { nextMinSpend = settings.goldMinSpend;    nextMinOrders = settings.goldMinOrders; }
      if (next === "DIAMANTE") { nextMinSpend = settings.diamondMinSpend; nextMinOrders = settings.diamondMinOrders; }

      const missingSpend  = Math.max(0, nextMinSpend  - spend);
      const missingOrders = nextMinOrders > 0 ? Math.max(0, nextMinOrders - orders) : 0;

      // Include customer if spend is >= PROXIMITY_SPEND_PCT of next tier threshold
      const closeBySpend  = spend >= nextMinSpend * PROXIMITY_SPEND_PCT && missingSpend > 0;
      const closeByOrders = nextMinOrders > 0 && orders >= Math.floor(nextMinOrders * PROXIMITY_SPEND_PCT) && missingOrders > 0;

      if (closeBySpend || closeByOrders) {
        closeList.push({
          id:           c.id,
          name:         c.name,
          phone:        c.phone ?? "",
          currentTier:  currentTierKey,
          nextTier:     next,
          totalSpend:   spend,
          totalOrders:  orders,
          lastOrderAt:  c.lastOrderAt,
          segment:      c.segment,
          missingSpend,
          missingOrders,
        });
      }
    }

    // Sort: closest to next tier first (smallest missingSpend)
    closeList.sort((a, b) => a.missingSpend - b.missingSpend);

    return { tiers, closeToNextTier: closeList.slice(0, 10) };
  }

  // ── Benefits ───────────────────────────────────────────────────────────────

  static async getBenefits(restaurantId: string) {
    return prisma.tierBenefit.findMany({
      where:   { restaurantId },
      orderBy: [{ tier: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  static async createBenefit(
    restaurantId: string,
    input: { tier: TierKey; title: string; description?: string },
  ) {
    return prisma.tierBenefit.create({
      data: {
        restaurantId,
        tier:        input.tier,
        title:       input.title,
        description: input.description ?? null,
        isActive:    true,
      },
    });
  }

  static async updateBenefit(
    id: string,
    restaurantId: string,
    input: Partial<{ title: string; description: string | null; isActive: boolean }>,
  ) {
    return prisma.tierBenefit.updateMany({
      where: { id, restaurantId },
      data:  input,
    });
  }

  static async deleteBenefit(id: string, restaurantId: string) {
    return prisma.tierBenefit.deleteMany({ where: { id, restaurantId } });
  }
}
