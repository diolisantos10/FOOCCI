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
 */

import { prisma } from "@/lib/prisma";

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
};

const baseSelect = {
  id: true, name: true, phone: true,
  tier: true, segment: true,
  totalOrders: true, totalSpend: true, lastOrderAt: true,
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
    lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
  }));
}

/** Eligibility filters applied on top of any segment criteria */
const ELIGIBLE_FILTERS = {
  isGuest:        false,
  isActive:       true,
  crmContactable: true,
  phone:          { not: null as null },
};

// ── Service ───────────────────────────────────────────────────────────────────

export class CrmAudienceService {
  static async getAudiencePreview(
    restaurantId: string,
    templateId:   string
  ): Promise<AudiencePreviewResult> {
    const ts = now();

    switch (templateId) {
      // ── Segment: FRIO ────────────────────────────────────────────────────────
      case "recuperar-frios": {
        const segWhere   = { restaurantId, segment: "FRIO" };
        const eligWhere  = { ...segWhere, ...ELIGIBLE_FILTERS };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({ where: eligWhere, orderBy: { lastOrderAt: "asc" }, take: PREVIEW_LIMIT, select: baseSelect }),
        ]);
        const excl = await computeExclusions(restaurantId, segWhere, eligible);
        return build(true, total, eligible, serialize(preview as RawRow[]), excl);
      }

      // ── Segment: MORNO ───────────────────────────────────────────────────────
      case "reativar-mornos":
      case "recorrente-sumido": {
        const extraFilter = templateId === "recorrente-sumido"
          ? { totalOrders: { gte: 2 } }
          : {};
        const segWhere  = { restaurantId, segment: "MORNO", ...extraFilter };
        const eligWhere = { ...segWhere, ...ELIGIBLE_FILTERS };
        const [total, eligible, preview] = await Promise.all([
          prisma.customer.count({ where: segWhere }),
          prisma.customer.count({ where: eligWhere }),
          prisma.customer.findMany({ where: eligWhere, orderBy: { lastOrderAt: "asc" }, take: PREVIEW_LIMIT, select: baseSelect }),
        ]);
        const excl = await computeExclusions(restaurantId, segWhere, eligible);
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
        // Count customers whose birth month matches the current calendar month.
        // Prisma has no month() filter; fetch all with birthDate and filter in JS.
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

      default:
        throw new Error(`Template '${templateId}' desconhecido`);
    }
  }

  /** Convenience: return only the eligible customers for dispatchable templates */
  static async getEligibleCustomers(
    restaurantId: string,
    templateId:   string
  ): Promise<AudienceCustomerRow[]> {
    const preview = await CrmAudienceService.getAudiencePreview(restaurantId, templateId);
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
    count:              eligible,    // backward compat
    customers:          preview,     // backward compat
  };
}

async function computeExclusions(
  restaurantId: string,
  segWhere:     object,
  eligible:     number
): Promise<ExclusionBreakdown> {
  const [noPhone, notContactable, isGuest] = await Promise.all([
    prisma.customer.count({ where: { ...segWhere, restaurantId, phone: null, isGuest: false } }),
    prisma.customer.count({ where: { ...segWhere, restaurantId, isGuest: false, phone: { not: null }, crmContactable: false } }),
    prisma.customer.count({ where: { ...segWhere, restaurantId, isGuest: true } }),
  ]);
  return { noPhone, notContactable, isGuest };
}
