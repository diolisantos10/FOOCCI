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
    opts: { days?: number; now?: Date } = {},
  ): Promise<MigrationResult> {
    const days = Math.max(1, Math.floor(opts.days ?? 7));
    const now  = opts.now ?? new Date();
    const ref  = new Date(now.getTime() - days * 86_400_000);

    const cfg = await getSegmentConfig(restaurantId);

    // Everyone currently in the base (guests are never part of the CRM base).
    const customers = await prisma.customer.findMany({
      where:  { restaurantId, isGuest: false },
      select: { id: true, lastOrderAt: true, importedLastOrderAt: true },
    });

    // Reactivations: native order landed inside the window → effective-last moved.
    // We need each such customer's effective-last AS OF the reference date to know
    // which base they came FROM. Pull their latest order on/before `ref` in one query.
    const orderedInWindow = customers.filter(
      (c) => c.lastOrderAt !== null && c.lastOrderAt > ref,
    );
    const priorNativeLast = new Map<string, Date>();
    if (orderedInWindow.length > 0) {
      const grouped = await prisma.order.groupBy({
        by:    ["customerId"],
        where: { customerId: { in: orderedInWindow.map((c) => c.id) }, createdAt: { lte: ref } },
        _max:  { createdAt: true },
      });
      for (const g of grouped) {
        if (g.customerId && g._max.createdAt) priorNativeLast.set(g.customerId, g._max.createdAt);
      }
    }

    // Build the before/after segment for every customer.
    const matrix = new Map<string, number>(); // `${from}->${to}` → count
    let reactivations = 0;
    let newActive     = 0;

    const key = (f: BaseSegment, t: BaseSegment) => `${f}->${t}`;

    for (const c of customers) {
      const effNow = c.lastOrderAt ?? c.importedLastOrderAt;
      const segNow = classifyByDays(effNow ? daysBetween(effNow, now) : null, cfg);

      // Effective last as of the reference date.
      let effRef: Date | null;
      if (c.lastOrderAt !== null && c.lastOrderAt > ref) {
        // Ordered inside the window — use the pre-window native order, else the
        // imported summary, else they were brand new (no history at ref).
        effRef = priorNativeLast.get(c.id) ?? c.importedLastOrderAt ?? null;
      } else {
        effRef = effNow; // unchanged across the window
      }
      const segRef = classifyByDays(effRef ? daysBetween(effRef, ref) : null, cfg);

      matrix.set(key(segRef, segNow), (matrix.get(key(segRef, segNow)) ?? 0) + 1);

      if (RECENCY_RANK[segNow] > RECENCY_RANK[segRef]) reactivations++;
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

    // Exclusions from the log (only accrues going forward).
    const exclusionRows = await prisma.crmBaseExclusion.findMany({
      where:  { restaurantId, createdAt: { gte: ref, lte: now } },
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
      to:   now.toISOString(),
      days,
      totalTracked: customers.length,
      flows,
      transitions,
      reactivations,
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
