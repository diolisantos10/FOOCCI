/**
 * CrmAudienceService
 *
 * Centralises audience-preview queries for CRM action templates.
 * Returns two counts for every template:
 *   - totalSegmentCount: all customers matching the segment criteria
 *     (no WhatsApp eligibility filters — tells you the raw segment size)
 *   - eligibleCount: subset who can actually receive a WhatsApp message
 *     (crmContactable=true, phone not null, isGuest=false)
 *
 * Keeping these separate lets the UI explain *why* the eligible count
 * is smaller than the segment, which was previously confusing owners.
 *
 * IMPORTANT: date-based queries use an OR condition so that customers
 * imported with only importedLastOrderAt are correctly included.
 * The overview stats (CRMService.getOverviewStats) uses COALESCE in raw SQL
 * for the same reason — these two paths must stay in sync.
 */

import { prisma } from "@/lib/prisma";
import type { SegmentConfig } from "@/lib/crm-segments";
import { DEFAULT_SEGMENT_CONFIG, buildCutoffs } from "@/lib/crm-segments";

const PREVIEW_LIMIT = 20;
const now = () => new Date();

// ── Types ─────────────────────────────────────────────────────────────────────

export type AudienceCustomerRow = {
  id:          string;
  name:        string;
  phone:       string;
  tier:        string;
  segment:     string;
  totalOrders: number;
  totalSpend:  number;
  lastOrderAt: string | null;
};

export type ExclusionBreakdown = {
  noPhone:        number;
  notContactable: number;
  isGuest:        number;
};

export type AudiencePreviewResult = {
  computed:          boolean;
  totalSegmentCount: number;
  eligibleCount:     number;
  previewCustomers:  AudienceCustomerRow[];
  exclusionBreakdown: ExclusionBreakdown;
  /** Backward-compat alias for eligibleCount (used by existing API consumers) */
  count:             number;
  /** Backward-compat alias for previewCustomers */
  customers:         AudienceCustomerRow[];
};

// ── Helper ────────────────────────────────────────────────────────────────────

type RawRow = {
  id: string; name: string; phone: string | null;
  tier: string; segment: string;
  totalOrders: number; totalSpend: { toNumber(): number };
  lastOrderAt: Date | null;
  importedLastOrderAt: Date | null;
};

const baseSelect = {
  id: true, name: true, phone: true,
  tier: true, segment: true,
  totalOrders: true, totalSpend: true,
  lastOrderAt: true, importedLastOrderAt: true,
} as const;

function serialize(rows: RawRow[]): AudienceCustomerRow[] {
  return rows.map((r) => ({
    id:          r.id,
    name:        r.name,
    phone:       r.phone ?? "—",
    tier:        r.tier,
    segment:     r.segment,
    totalOrders: r.totalOrders,
    totalSpend:  r.totalSpend.toNumber(),
    // Fall back to importedLastOrderAt for customers with no Foocci orders
    lastOrderAt: (r.lastOrderAt ?? r.importedLastOrderAt)?.toISOString() ?? null,
  }));
}

/** Eligibility filters applied on top of any segment criteria */
const ELIGIBLE_FILTERS = {
  isGuest:        false,
  isActive:       true,
  crmContactable: true,
  phone:          { not: null as null },
};

/**
 * Build a Prisma `where` condition that matches customers whose
 * effective last order (real OR imported) is before `cutoff`.
 *
 * This mirrors the COALESCE("lastOrderAt","importedLastOrderAt") logic in the
 * overview stats raw SQL, so both paths count the same customers.
 */
function effectiveLastOrderBefore(cutoff: Date) {
  return {
    OR: [
      // Customer has a real Foocci order before the cutoff
      { lastOrderAt: { lt: cutoff } },
      // Customer has no real order yet but has an imported date before cutoff
      { lastOrderAt: null, importedLastOrderAt: { lt: cutoff } },
    ],
  };
}

/**
 * Build a Prisma `where` condition that matches customers whose
 * effective last order falls within [gteDate, ltDate).
 */
function effectiveLastOrderBetween(gteDate: Date, ltDate: Date) {
  return {
    OR: [
      { lastOrderAt: { gte: gteDate, lt: ltDate } },
      { lastOrderAt: null, importedLastOrderAt: { gte: gteDate, lt: ltDate } },
    ],
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CrmAudienceService {
  static async getAudiencePreview(
    restaurantId: string,
    templateId:   string,
    segCfg:       SegmentConfig = DEFAULT_SEGMENT_CONFIG
  ): Promise<AudiencePreviewResult> {
    const ts      = now();
    const cutoffs = buildCutoffs(segCfg, ts);

    switch (templateId) {
      // ── Segment: FRIO — effective last order older than warmMaxDays ──────────
      case "recuperar-frios": {
        const dateCond  = effectiveLastOrderBefore(cutoffs.warmCutoff);
        const segWhere  = { restaurantId, isGuest: false, ...dateCond };
        const eligWhere = { restaurantId, ...ELIGIBLE_FILTERS, ...dateCond };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({
            where:   eligWhere,
            orderBy: [{ lastOrderAt: "asc" }, { importedLastOrderAt: "asc" }],
            take:    PREVIEW_LIMIT,
            select:  baseSelect,
          }),
        ]);
        const excl = await computeExclusions(restaurantId, dateCond, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }

      // ── Segment: QUENTE — effective last order within hotCutoff (≤30d) ─────────
      case "clientes-quentes": {
        const dateCond  = { OR: [
          { lastOrderAt: { gte: cutoffs.hotCutoff } },
          { lastOrderAt: null, importedLastOrderAt: { gte: cutoffs.hotCutoff } },
        ] };
        const segWhere  = { restaurantId, isGuest: false, ...dateCond };
        const eligWhere = { restaurantId, ...ELIGIBLE_FILTERS, ...dateCond };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({
            where:   eligWhere,
            orderBy: { totalSpend: "desc" },
            take:    PREVIEW_LIMIT,
            select:  baseSelect,
          }),
        ]);
        const excl = await computeExclusions(restaurantId, dateCond, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }

      // ── Segment: MORNO — effective last order within (warmCutoff, hotCutoff) ─
      case "reativar-mornos":
      case "recorrente-sumido": {
        const extraFilter = templateId === "recorrente-sumido"
          ? { totalOrders: { gte: 2 } }
          : {};
        const dateCond  = effectiveLastOrderBetween(cutoffs.warmCutoff, cutoffs.hotCutoff);
        const segWhere  = { restaurantId, isGuest: false, ...dateCond, ...extraFilter };
        const eligWhere = { restaurantId, ...ELIGIBLE_FILTERS, ...dateCond, ...extraFilter };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({
            where:   eligWhere,
            orderBy: [{ lastOrderAt: "asc" }, { importedLastOrderAt: "asc" }],
            take:    PREVIEW_LIMIT,
            select:  baseSelect,
          }),
        ]);
        const excl = await computeExclusions(restaurantId, dateCond, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }

      // ── Segment: PERDIDO — effective last order older than lostMinDays ───────
      case "recuperar-perdidos": {
        const dateCond  = effectiveLastOrderBefore(cutoffs.lostCutoff);
        const segWhere  = { restaurantId, isGuest: false, ...dateCond };
        const eligWhere = { restaurantId, ...ELIGIBLE_FILTERS, ...dateCond };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({
            where:   eligWhere,
            orderBy: [{ lastOrderAt: "asc" }, { importedLastOrderAt: "asc" }],
            take:    PREVIEW_LIMIT,
            select:  baseSelect,
          }),
        ]);
        const excl = await computeExclusions(restaurantId, dateCond, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }

      // ── Segment: primeira compra ─────────────────────────────────────────────
      case "segunda-compra": {
        const segWhere  = { restaurantId, isGuest: false, totalOrders: 1 };
        const eligWhere = { ...segWhere, crmContactable: true, phone: { not: null as null } };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({ where: eligWhere, orderBy: { lastOrderAt: "desc" }, take: PREVIEW_LIMIT, select: baseSelect }),
        ]);
        const excl = await computeExclusions(restaurantId, segWhere, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }

      // ── Segment: VIP ─────────────────────────────────────────────────────────
      case "clientes-vip": {
        const segWhere  = { restaurantId, isGuest: false, tier: { in: ["OURO", "DIAMANTE"] } };
        const eligWhere = { ...segWhere, crmContactable: true, phone: { not: null as null } };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({ where: eligWhere, orderBy: [{ tier: "asc" }, { totalSpend: "desc" }], take: PREVIEW_LIMIT, select: baseSelect }),
        ]);
        const excl = await computeExclusions(restaurantId, segWhere, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }

      // ── Segment: recentes (7 dias) ───────────────────────────────────────────
      case "pedido-avaliacao": {
        const sevenDaysAgo = new Date(ts.getTime() - 7 * 86_400_000);
        const segWhere  = { restaurantId, isGuest: false, lastOrderAt: { gte: sevenDaysAgo } };
        const eligWhere = { ...segWhere, crmContactable: true, phone: { not: null as null } };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({ where: eligWhere, orderBy: { lastOrderAt: "desc" }, take: PREVIEW_LIMIT, select: baseSelect }),
        ]);
        const excl = await computeExclusions(restaurantId, segWhere, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }

      // ── Templates needing more data (birthday, product-based, etc.) ──────────
      case "aniversariantes": {
        const currentMonth = ts.getMonth(); // 0-indexed
        const withBirthday = await prisma.customer.findMany({
          where: { restaurantId, isGuest: false, birthDate: { not: null } },
          select: {
            birthDate: true, isActive: true,
            hasOptedOut: true, crmContactable: true, phone: true,
          },
        });
        const thisMonth = withBirthday.filter(
          (r) => r.birthDate !== null && r.birthDate.getMonth() === currentMonth
        );
        const eligible = thisMonth.filter(
          (r) => r.isActive && !r.hasOptedOut && r.crmContactable && r.phone !== null
        ).length;
        return build(true, thisMonth.length, eligible, [], { noPhone: 0, notContactable: 0, isGuest: 0 });
      }

      case "aumentar-sobremesas":
      case "aumentar-bebidas":
      case "produto-favorito":
      case "alto-ticket":
      case "carrinho-abandonado": {
        const total = await prisma.customer.count({ where: { restaurantId, isGuest: false } });
        return build(false, total, 0, [], { noPhone: 0, notContactable: 0, isGuest: 0 });
      }

      // ── Tier-based segments ───────────────────────────────────────────────────
      case "tier-bronze": {
        const segWhere  = { restaurantId, isGuest: false, tier: "BRONZE" };
        const eligWhere = { ...segWhere, ...ELIGIBLE_FILTERS };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({ where: eligWhere, orderBy: { totalSpend: "desc" }, take: PREVIEW_LIMIT, select: baseSelect }),
        ]);
        const excl = await computeExclusions(restaurantId, segWhere, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }
      case "tier-prata": {
        const segWhere  = { restaurantId, isGuest: false, tier: "PRATA" };
        const eligWhere = { ...segWhere, ...ELIGIBLE_FILTERS };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({ where: eligWhere, orderBy: { totalSpend: "desc" }, take: PREVIEW_LIMIT, select: baseSelect }),
        ]);
        const excl = await computeExclusions(restaurantId, segWhere, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }
      case "tier-ouro": {
        const segWhere  = { restaurantId, isGuest: false, tier: "OURO" };
        const eligWhere = { ...segWhere, ...ELIGIBLE_FILTERS };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({ where: eligWhere, orderBy: { totalSpend: "desc" }, take: PREVIEW_LIMIT, select: baseSelect }),
        ]);
        const excl = await computeExclusions(restaurantId, segWhere, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }
      case "tier-diamante": {
        const segWhere  = { restaurantId, isGuest: false, tier: "DIAMANTE" };
        const eligWhere = { ...segWhere, ...ELIGIBLE_FILTERS };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({ where: eligWhere, orderBy: { totalSpend: "desc" }, take: PREVIEW_LIMIT, select: baseSelect }),
        ]);
        const excl = await computeExclusions(restaurantId, segWhere, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }

      // ── All contactable customers ─────────────────────────────────────────────
      case "todos-clientes": {
        const segWhere  = { restaurantId, isGuest: false };
        const eligWhere = { ...segWhere, ...ELIGIBLE_FILTERS };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({ where: eligWhere, orderBy: { totalSpend: "desc" }, take: PREVIEW_LIMIT, select: baseSelect }),
        ]);
        const excl = await computeExclusions(restaurantId, segWhere, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }

      default:
        console.warn(`[CrmAudienceService] Unknown template: '${templateId}'`);
        const total = await prisma.customer.count({ where: { restaurantId, isGuest: false } });
        return build(false, total, 0, [], { noPhone: 0, notContactable: 0, isGuest: 0 });
    }
  }

  /** Convenience: return only the eligible customers for dispatchable templates */
  static async getEligibleCustomers(
    restaurantId: string,
    templateId:   string,
    segCfg?:      SegmentConfig
  ): Promise<AudienceCustomerRow[]> {
    const preview = await CrmAudienceService.getAudiencePreview(restaurantId, templateId, segCfg);
    return preview.previewCustomers;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function build(
  computed:   boolean,
  total:      number,
  eligible:   number,
  preview:    AudienceCustomerRow[],
  excl:       ExclusionBreakdown
): AudiencePreviewResult {
  return {
    computed,
    totalSegmentCount:  total,
    eligibleCount:      eligible,
    previewCustomers:   preview,
    exclusionBreakdown: excl,
    count:              eligible,  // backward compat
    customers:          preview,   // backward compat
  };
}

async function computeExclusions(
  restaurantId: string,
  dateCond:     object,
  eligible:     number
): Promise<ExclusionBreakdown> {
  const base = { restaurantId, ...dateCond };
  const [noPhone, notContactable, isGuest] = await Promise.all([
    prisma.customer.count({ where: { ...base, isGuest: false, phone: null } }),
    prisma.customer.count({ where: { ...base, isGuest: false, phone: { not: null }, crmContactable: false } }),
    prisma.customer.count({ where: { ...base, isGuest: true } }),
  ]);
  return { noPhone, notContactable, isGuest };
}
