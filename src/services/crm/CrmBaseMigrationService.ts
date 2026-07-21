/**
 * CrmBaseMigrationService — "painel de migração de base".
 *
 * Answers: over the last N days, how did customers move between relationship
 * bases (QUENTE → MORNO → FRIO → PERDIDO, and reactivations back up), and how
 * many left the base entirely (excluded for lack of a valid contact)?
 *
 * Segments are a pure function of the effective last-order date + the segment
 * cutoffs, so we can reconstruct the base a customer sat in on ANY past date
 * from data we already have — no historical snapshot needed:
 *
 *   - A customer who did NOT order in the window keeps the same effective last
 *     order date, so their segment `days` ago is computed by shifting the clock
 *     back `days` days. This is exact (the bulk of all movement is time decay).
 *
 *   - A customer who DID order in the window (native lastOrderAt inside it) had a
 *     different, older effective last order at the reference date. We recover it
 *     from their most recent order placed on/before the reference date (or the
 *     imported summary), so reactivations land in the right "from" base too.
 *
 * Exclusions can't be reconstructed (deleted rows leave nothing behind), so they
 * come from the CrmBaseExclusion log the runner writes going forward.
 */

import { prisma } from "@/lib/prisma";
import { getSegmentConfig, type SegmentConfig } from "@/lib/crm-segments";

export type BaseSegment = "SEM_PEDIDOS" | "QUENTE" | "MORNO" | "FRIO" | "PERDIDO";

export const BASE_SEGMENTS: BaseSegment[] = ["QUENTE", "MORNO", "FRIO", "PERDIDO", "SEM_PEDIDOS"];

export interface SegmentFlow {
  segment: BaseSegment;
  /** In the base at the reference date (start of window). */
  before:  number;
  /** In the base now (end of window). */
  after:   number;
  /** Moved INTO this base during the window (from another base). */
  movedIn: number;
  /** Moved OUT of this base during the window (to another base). */
  movedOut: number;
  /** after - before (net change, incl. exclusions leaving the base). */
  net:     number;
}

export interface MigrationTransition {
  from:  BaseSegment;
  to:    BaseSegment;
  count: number;
}

export interface MigrationResult {
  from:        string; // ISO — reference date (window start)
  to:          string; // ISO — now (window end)
  days:        number;
  totalTracked: number;
  flows:       SegmentFlow[];
  /** Non-zero transitions only, biggest first. */
  transitions: MigrationTransition[];
  /** Customers who moved to a MORE-recent base (ordered again). */
  reactivations: number;
  /** Who gets the credit for the reactivations — campaign-driven vs organic. */
  attribution: {
    /** Reactivated customers whose comeback order converted from a campaign. */
    attributed: number;
    /** Reactivated customers with no campaign conversion — came back on their own. */
    organic:    number;
    /** Revenue of the campaign-driven comeback orders. */
    revenue:    number;
    byCampaign: Array<{
      campaignId:   string;
      campaignName: string;
      /** Customers this campaign brought back up the ladder. */
      customers:    number;
      /** Coupons from this campaign redeemed by reactivated customers in the window. */
      couponsUsed:  number;
      revenue:      number;
    }>;
  };
  /** Customers whose first-ever order landed in the window (SEM_PEDIDOS → active). */
  newActive:   number;
  exclusions: {
    invalidPhoneDeleted: number;
    retiredNoContact:    number;
    total:               number;
    /** Exclusions broken down by the base the customer was in when removed. */
    byPriorSegment:      Record<string, number>;
  };
}

/** Classify by how many days ago the effective last order was. Mirrors resolveCustomerSegment. */
function classifyByDays(daysAgo: number | null, cfg: SegmentConfig): BaseSegment {
  if (daysAgo === null) return "SEM_PEDIDOS";
  if (daysAgo <= cfg.hotMaxDays)  return "QUENTE";
  if (daysAgo <= cfg.warmMaxDays) return "MORNO";
  if (daysAgo <  cfg.lostMinDays) return "FRIO";
  return "PERDIDO";
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/** Rank used to detect reactivation (a move toward a more-recent base). */
const RECENCY_RANK: Record<BaseSegment, number> = {
  QUENTE: 4, MORNO: 3, FRIO: 2, PERDIDO: 1, SEM_PEDIDOS: 0,
};

export class CrmBaseMigrationService {
  static async getMigration(
    restaurantId: string,
    opts: { days?: number; now?: Date; from?: Date; to?: Date } = {},
  ): Promise<MigrationResult> {
    const now = opts.now ?? new Date();
    // Custom window (from/to) wins; otherwise a rolling N-day window ending now.
    // `end` may sit in the past — both endpoints are reconstructed the same way.
    const end = opts.to && opts.to < now ? opts.to : now;
    const ref = opts.from && opts.from < end
      ? opts.from
      : new Date(end.getTime() - Math.max(1, Math.floor(opts.days ?? 7)) * 86_400_000);
    const days = Math.max(1, daysBetween(ref, end));

    const cfg = await getSegmentConfig(restaurantId);

    // Everyone in the base (guests never are). For a historical window, customers
    // registered after its end didn't exist yet — leave them out.
    const customers = await prisma.customer.findMany({
      where:  { restaurantId, isGuest: false, createdAt: { lte: end } },
      select: { id: true, lastOrderAt: true, importedLastOrderAt: true },
    });

    // A customer whose lastOrderAt falls AFTER an endpoint had a different effective
    // last order at that date — recover it from their latest order on/before it.
    // (One groupBy per endpoint; the `end` one is empty when end === now.)
    const priorNativeLastAt = async (cutoff: Date): Promise<Map<string, Date>> => {
      const ids = customers.filter((c) => c.lastOrderAt !== null && c.lastOrderAt > cutoff).map((c) => c.id);
      const map = new Map<string, Date>();
      if (ids.length === 0) return map;
      const grouped = await prisma.order.groupBy({
        by:    ["customerId"],
        where: { customerId: { in: ids }, createdAt: { lte: cutoff } },
        _max:  { createdAt: true },
      });
      for (const g of grouped) {
        if (g.customerId && g._max.createdAt) map.set(g.customerId, g._max.createdAt);
      }
      return map;
    };
    const [priorAtRef, priorAtEnd] = await Promise.all([priorNativeLastAt(ref), priorNativeLastAt(end)]);

    /** Effective last order as of `date` (native first, imported summary as fallback). */
    const effAt = (c: (typeof customers)[number], date: Date, prior: Map<string, Date>): Date | null =>
      c.lastOrderAt !== null && c.lastOrderAt > date
        ? (prior.get(c.id) ?? c.importedLastOrderAt ?? null)
        : (c.lastOrderAt ?? c.importedLastOrderAt);

    // Build the before/after segment for every customer.
    const matrix = new Map<string, number>(); // `${from}->${to}` → count
    let reactivations = 0;
    let newActive     = 0;
    const reactivatedIds: string[] = []; // customers who climbed — fed to attribution

    const key = (f: BaseSegment, t: BaseSegment) => `${f}->${t}`;

    for (const c of customers) {
      const effEnd = effAt(c, end, priorAtEnd);
      const segNow = classifyByDays(effEnd ? daysBetween(effEnd, end) : null, cfg);

      const effRef = effAt(c, ref, priorAtRef);
      const segRef = classifyByDays(effRef ? daysBetween(effRef, ref) : null, cfg);

      matrix.set(key(segRef, segNow), (matrix.get(key(segRef, segNow)) ?? 0) + 1);

      if (RECENCY_RANK[segNow] > RECENCY_RANK[segRef]) { reactivations++; reactivatedIds.push(c.id); }
      if (segRef === "SEM_PEDIDOS" && segNow !== "SEM_PEDIDOS") newActive++;
    }

    // Flows per segment.
    const flows: SegmentFlow[] = BASE_SEGMENTS.map((seg) => {
      let before = 0, after = 0, movedIn = 0, movedOut = 0;
      for (const [k, count] of matrix) {
        const [from, to] = k.split("->") as [BaseSegment, BaseSegment];
        if (from === seg) before += count;
        if (to === seg)   after  += count;
        if (to === seg && from !== seg) movedIn  += count;
        if (from === seg && to !== seg) movedOut += count;
      }
      return { segment: seg, before, after, movedIn, movedOut, net: after - before };
    });

    const transitions: MigrationTransition[] = [...matrix.entries()]
      .map(([k, count]) => {
        const [from, to] = k.split("->") as [BaseSegment, BaseSegment];
        return { from, to, count };
      })
      .filter((t) => t.from !== t.to && t.count > 0)
      .sort((a, b) => b.count - a.count);

    // ── Attribution: who gets the credit for each reactivation ────────────────
    // A reactivated customer whose comeback converted from a campaign (execution
    // marked converted inside the window) is credited to that campaign — latest
    // conversion wins. No conversion on file → they came back on their own.
    const attribution: MigrationResult["attribution"] = {
      attributed: 0, organic: reactivations, revenue: 0, byCampaign: [],
    };
    if (reactivatedIds.length > 0) {
      try {
        const [execs, coupons] = await Promise.all([
          prisma.campaignExecution.findMany({
            where: {
              restaurantId,
              customerId:  { in: reactivatedIds },
              converted:   true,
              convertedAt: { gte: ref, lte: end },
            },
            orderBy: { convertedAt: "desc" },
            select:  { customerId: true, campaignId: true, revenue: true },
          }),
          prisma.customerCoupon.findMany({
            where: {
              restaurantId,
              customerId:       { in: reactivatedIds },
              status:           "USED" as never,
              usedAt:           { gte: ref, lte: end },
              sourceCampaignId: { not: null },
            },
            select: { sourceCampaignId: true },
          }),
        ]);

        const creditedByCustomer = new Map<string, { campaignId: string; revenue: number }>();
        for (const e of execs) {
          if (!creditedByCustomer.has(e.customerId)) {
            creditedByCustomer.set(e.customerId, { campaignId: e.campaignId, revenue: Number(e.revenue ?? 0) });
          }
        }
        const couponsByCampaign = new Map<string, number>();
        for (const c of coupons) {
          couponsByCampaign.set(c.sourceCampaignId!, (couponsByCampaign.get(c.sourceCampaignId!) ?? 0) + 1);
        }

        const perCampaign = new Map<string, { customers: number; revenue: number }>();
        for (const { campaignId, revenue } of creditedByCustomer.values()) {
          const row = perCampaign.get(campaignId) ?? { customers: 0, revenue: 0 };
          row.customers += 1;
          row.revenue   += revenue;
          perCampaign.set(campaignId, row);
        }

        const allIds = [...new Set([...perCampaign.keys(), ...couponsByCampaign.keys()])];
        const names  = allIds.length > 0
          ? await prisma.campaign.findMany({ where: { id: { in: allIds } }, select: { id: true, name: true } })
          : [];
        const nameOf = new Map(names.map((n) => [n.id, n.name]));

        attribution.byCampaign = allIds
          .map((id) => ({
            campaignId:   id,
            campaignName: nameOf.get(id) ?? "Campanha",
            customers:    perCampaign.get(id)?.customers ?? 0,
            couponsUsed:  couponsByCampaign.get(id) ?? 0,
            revenue:      perCampaign.get(id)?.revenue ?? 0,
          }))
          .sort((a, b) => b.customers - a.customers || b.couponsUsed - a.couponsUsed);
        attribution.attributed = creditedByCustomer.size;
        attribution.organic    = Math.max(0, reactivations - creditedByCustomer.size);
        attribution.revenue    = [...creditedByCustomer.values()].reduce((s, v) => s + v.revenue, 0);
      } catch (e) {
        console.warn("[CrmBaseMigration] attribution failed", e);
      }
    }

    // Exclusions from the log (only accrues going forward).
    const exclusionRows = await prisma.crmBaseExclusion.findMany({
      where:  { restaurantId, createdAt: { gte: ref, lte: end } },
      select: { reason: true, priorSegment: true },
    });
    const byPriorSegment: Record<string, number> = {};
    let invalidPhoneDeleted = 0, retiredNoContact = 0;
    for (const e of exclusionRows) {
      if (e.reason === "INVALID_PHONE_DELETED") invalidPhoneDeleted++;
      else if (e.reason === "RETIRED_NO_CONTACT") retiredNoContact++;
      const seg = e.priorSegment ?? "SEM_PEDIDOS";
      byPriorSegment[seg] = (byPriorSegment[seg] ?? 0) + 1;
    }

    return {
      from: ref.toISOString(),
      to:   end.toISOString(),
      days,
      totalTracked: customers.length,
      flows,
      transitions,
      reactivations,
      attribution,
      newActive,
      exclusions: {
        invalidPhoneDeleted,
        retiredNoContact,
        total: exclusionRows.length,
        byPriorSegment,
      },
    };
  }
}
