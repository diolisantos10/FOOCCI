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
import { isTierUp } from "./crm-helpers";
import {
  TIER_COUPON_CAMPAIGN_IDS, resolveTierCoupon, couponLabel,
  type ReadyMadeCoupon, type TierCouponsConfig,
} from "./readyMadeCampaigns";

// ─── Exported types ───────────────────────────────────────────────────────────

export type TierKey = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

export interface TierSettingsInput {
  /** Master switch — the program is inert until turned on. */
  programEnabled:   boolean;
  /** Rolling window of sales that counts (months). 0 = vitalício (lifetime). */
  classificationWindowMonths: number;
  silverMinSpend:   number;
  silverMinOrders:  number;
  goldMinSpend:     number;
  goldMinOrders:    number;
  diamondMinSpend:  number;
  diamondMinOrders: number;
}

export const DEFAULT_SETTINGS: TierSettingsInput = {
  programEnabled:   false,
  classificationWindowMonths: 0,
  silverMinSpend:   300,
  silverMinOrders:  0,
  goldMinSpend:     800,
  goldMinOrders:    0,
  diamondMinSpend:  2000,
  diamondMinOrders: 0,
};

/** Allowed classification windows (months). 0 = vitalício. */
export const CLASSIFICATION_WINDOWS = [0, 3, 6, 12] as const;

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

/** A reward the customer ALREADY earns at a tier, pulled from the live fidelity
 *  campaigns (Mimo mensal / Subiu de nível) — not free text. */
export interface TierReward {
  tier:   TierKey;
  label:  string; // "10% OFF" · "Frete grátis" · "sobremesa grátis"
  source: string; // owner-facing origin, e.g. "Mimo mensal"
}

export interface ProgramOverview {
  tiers:           TierStats[];
  closeToNextTier: CloseToNextTierCustomer[];
  /** Coupon rewards per tier that the fidelity campaigns already grant. */
  tierRewards:     TierReward[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function settingsToInput(s: TierSettings): TierSettingsInput {
  return {
    programEnabled:   s.programEnabled,
    classificationWindowMonths: s.classificationWindowMonths,
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
    const window = CLASSIFICATION_WINDOWS.includes(input.classificationWindowMonths as never)
      ? input.classificationWindowMonths : 0;
    const fields = {
      programEnabled:             !!input.programEnabled,
      classificationWindowMonths: window,
      silverMinSpend:   input.silverMinSpend,
      silverMinOrders:  input.silverMinOrders,
      goldMinSpend:     input.goldMinSpend,
      goldMinOrders:    input.goldMinOrders,
      diamondMinSpend:  input.diamondMinSpend,
      diamondMinOrders: input.diamondMinOrders,
    };
    const row = await prisma.tierSettings.upsert({
      where:  { restaurantId },
      update: fields,
      create: { restaurantId, ...fields },
    });
    // Thresholds/window changed → reclassify now so the levels are immediately
    // correct (the daily cron keeps them fresh afterwards).
    await this.recalculateTiers(restaurantId).catch(() => {});
    return settingsToInput(row);
  }

  // ── Recalculate all customer tiers ─────────────────────────────────────────

  static async recalculateTiers(restaurantId: string): Promise<{ updated: number }> {
    const settings = await this.getSettings(restaurantId);
    const now = new Date();

    const customers = await prisma.customer.findMany({
      where:  { restaurantId, isGuest: false },
      select: {
        id: true, tier: true, totalSpend: true, totalOrders: true,
        importedTotalSpent: true, importedOrderCount: true,
      },
    });

    // Rolling window: spend/orders are the sum of DELIVERED orders within the last
    // N months (not lifetime). Computed once for the whole restaurant, then joined
    // per customer. Window 0 = vitalício (keep the lifetime totals).
    const windowSpend = new Map<string, { spend: number; orders: number }>();
    if (settings.classificationWindowMonths > 0) {
      const since = new Date(now.getTime());
      since.setMonth(since.getMonth() - settings.classificationWindowMonths);
      const grouped = await prisma.order.groupBy({
        by:    ["customerId"],
        where: { restaurantId, createdAt: { gte: since }, status: { notIn: ["CANCELLED"] as never[] } },
        _sum:  { total: true },
        _count: { _all: true },
      });
      for (const g of grouped) {
        if (g.customerId) windowSpend.set(g.customerId, { spend: Number(g._sum.total ?? 0), orders: g._count._all });
      }
    }

    let updated = 0;
    for (let i = 0; i < customers.length; i += 100) {
      const chunk = customers.slice(i, i + 100);
      await Promise.all(
        chunk.map((c) => {
          let effSpend: number;
          let effOrders: number;
          if (settings.classificationWindowMonths > 0) {
            // Windowed: only sales inside the window count (imported history has no
            // dated orders, so it's excluded from windowed classification).
            const w = windowSpend.get(c.id);
            effSpend  = w?.spend  ?? 0;
            effOrders = w?.orders ?? 0;
          } else {
            const realSpend  = Number(c.totalSpend);
            const realOrders = c.totalOrders;
            effSpend  = realSpend  > 0 ? realSpend  : Number(c.importedTotalSpent ?? 0);
            effOrders = realOrders > 0 ? realOrders : (c.importedOrderCount ?? 0);
          }
          const tier = computeTierWithSettings(effSpend, effOrders, settings);
          return prisma.customer.update({
            where: { id: c.id },
            data:  {
              tier,
              // Level-up stamp — feeds the "Subiu de nível" campaign.
              ...(isTierUp(c.tier, tier) ? { previousTier: c.tier, tierUpAt: now } : {}),
            },
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
        id:                 true,
        name:               true,
        phone:              true,
        tier:               true,
        totalSpend:         true,
        totalOrders:        true,
        lastOrderAt:        true,
        segment:            true,
        importedTotalSpent: true,
        importedOrderCount: true,
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
      const tier      = (c.tier as TierKey) in tierBuckets ? (c.tier as TierKey) : "BRONZE";
      const realSpend = Number(c.totalSpend);
      const effSpend  = realSpend > 0 ? realSpend : Number(c.importedTotalSpent ?? 0);
      const realOrds  = c.totalOrders;
      const effOrders = realOrds > 0 ? realOrds : (c.importedOrderCount ?? 0);
      tierBuckets[tier].count   += 1;
      tierBuckets[tier].revenue += effSpend;
      tierBuckets[tier].orders  += effOrders;
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

      // Use effective spend/orders (imported as fallback when no real Foocci data)
      const realSpend  = Number(c.totalSpend);
      const realOrders = c.totalOrders;
      const spend      = realSpend  > 0 ? realSpend  : Number(c.importedTotalSpent  ?? 0);
      const orders     = realOrders > 0 ? realOrders : (c.importedOrderCount ?? 0);

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

    const tierRewards = await this.getTierRewards(restaurantId);
    return { tiers, closeToNextTier: closeList.slice(0, 10), tierRewards };
  }

  /**
   * Coupon rewards the customer ALREADY earns per tier — read live from the
   * fidelity campaigns' scheduleConfig.tierCoupons (Mimo mensal / Subiu de nível),
   * so the Benefícios panel reflects what's really granted, not free text.
   */
  static async getTierRewards(restaurantId: string): Promise<TierReward[]> {
    const rows = await prisma.campaign.findMany({
      where:   { restaurantId, templateId: { in: [...TIER_COUPON_CAMPAIGN_IDS] }, status: { notIn: ["SENT", "COMPLETED", "CANCELLED"] as never[] } },
      orderBy: { createdAt: "desc" },
      select:  { templateId: true, scheduleConfig: true },
    }).catch(() => []);

    const SOURCE: Record<string, string> = { "mimo-mensal-nivel": "Mimo mensal", "subiu-de-nivel": "Ao subir de nível" };
    const seen = new Set<string>();
    const out: TierReward[] = [];
    for (const r of rows) {
      if (!r.templateId || seen.has(r.templateId)) continue; // newest row per campaign
      seen.add(r.templateId);
      const cfg = (r.scheduleConfig as { coupon?: ReadyMadeCoupon | null; tierCoupons?: TierCouponsConfig } | null);
      for (const tier of ["PRATA", "OURO", "DIAMANTE"] as const) {
        const coupon = resolveTierCoupon(cfg?.tierCoupons, tier, cfg?.coupon ?? null);
        if (coupon) out.push({ tier, label: couponLabel(coupon), source: SOURCE[r.templateId] ?? r.templateId });
      }
    }
    return out;
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
    input: { tier: TierKey; title: string; description?: string; isPhysicalGift?: boolean; stockTotal?: number | null },
  ) {
    return prisma.tierBenefit.create({
      data: {
        restaurantId,
        tier:           input.tier,
        title:          input.title,
        description:    input.description ?? null,
        isActive:       true,
        isPhysicalGift: !!input.isPhysicalGift,
        stockTotal:     input.isPhysicalGift ? (input.stockTotal ?? null) : null,
      },
    });
  }

  static async updateBenefit(
    id: string,
    restaurantId: string,
    input: Partial<{ title: string; description: string | null; isActive: boolean; isPhysicalGift: boolean; stockTotal: number | null }>,
  ) {
    return prisma.tierBenefit.updateMany({
      where: { id, restaurantId },
      data:  input,
    });
  }

  static async deleteBenefit(id: string, restaurantId: string) {
    return prisma.tierBenefit.deleteMany({ where: { id, restaurantId } });
  }

  /**
   * Register that N physical gifts were handed to customers — decrements stock.
   * Guarded so stockUsed never exceeds stockTotal. Returns the new counters.
   */
  static async registerGiftDelivery(id: string, restaurantId: string, qty = 1) {
    const b = await prisma.tierBenefit.findFirst({
      where:  { id, restaurantId, isPhysicalGift: true },
      select: { stockTotal: true, stockUsed: true },
    });
    if (!b) return { ok: false as const, error: "Brinde não encontrado." };
    const delta   = Math.max(1, Math.floor(qty));
    const cap      = b.stockTotal ?? Number.MAX_SAFE_INTEGER;
    const newUsed  = Math.min(cap, b.stockUsed + delta);
    await prisma.tierBenefit.update({ where: { id }, data: { stockUsed: newUsed } });
    return { ok: true as const, stockUsed: newUsed, stockTotal: b.stockTotal };
  }
}
