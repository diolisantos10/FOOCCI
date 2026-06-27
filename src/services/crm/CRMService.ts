import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, type ServiceResult } from "@/types";
import { pickSuggestedMessage } from "@/lib/crm-messages";
import { getSegmentConfig, type SegmentConfig } from "@/lib/crm-segments";
import { OrderStatus, type AutomationTrigger } from "@prisma/client";

// Orders in these states never count as realized revenue (mirrors revenue-summary).
const REVENUE_EXCLUDED_STATUSES: OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PENDING,
];

// ── Tier thresholds (aligned with CustomerProfileClient) ──────────────────────
// Diamond ≥ R$2000 | Gold ≥ R$800 | Silver ≥ R$300 | Bronze < R$300

export type CustomerTier = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

export function getTier(spend: number): CustomerTier {
  if (spend >= 2000) return "DIAMANTE";
  if (spend >= 800)  return "OURO";
  if (spend >= 300)  return "PRATA";
  return "BRONZE";
}

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

// ── Serialised customer for CRM screens ──────────────────────────────────────

export type CRMCustomer = {
  id: string;
  name: string;
  phone: string;              // "" for no-phone imported customers
  totalSpend: number;
  totalOrders: number;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  tier: CustomerTier;
  isActive: boolean;
  birthDate: string | null;
  crmContactable: boolean;          // false = no valid phone; excluded from campaigns
  contactStatus: string | null;     // CONTACTABLE | SEM_TELEFONE | OPT_OUT | NEEDS_REVIEW
  dataEnrichmentStatus: string | null; // COMPLETE | PARTIAL | NEEDS_ENRICHMENT | NEEDS_REVIEW
  // Imported historical summary — present when customer was imported from Saipos/Nemo
  importedOrderCount:   number | null;
  importedTotalSpent:   number | null;
  importedLastOrderAt:  string | null;
  averageTicket:        number | null;
  // True when display values derive from imported summary, not real Foocci orders
  isUsingImportedData: boolean;
};

function serializeCustomer(c: {
  id: string;
  name: string;
  phone: string | null;
  totalSpend: Decimal;
  totalOrders: number;
  lastOrderAt: Date | null;
  isActive: boolean;
  birthDate: Date | null;
  crmContactable?: boolean;
  contactStatus?: string | null;
  dataEnrichmentStatus?: string | null;
  importedOrderCount?:   number | null;
  importedTotalSpent?:   Decimal | null;
  importedLastOrderAt?:  Date | null;
  averageTicket?:        Decimal | null;
}): CRMCustomer {
  const realSpend  = Number(c.totalSpend);
  const realOrders = c.totalOrders;
  const realLast   = c.lastOrderAt ?? null;
  const impSpend   = c.importedTotalSpent !== null && c.importedTotalSpent !== undefined
    ? Number(c.importedTotalSpent) : null;
  const impOrders  = c.importedOrderCount ?? null;
  const impLast    = c.importedLastOrderAt ?? null;

  // Use real Foocci data when available, otherwise fall back to imported summary
  const isUsingImportedData = realOrders === 0 && (impOrders !== null || impSpend !== null || impLast !== null);
  const displaySpend  = realOrders > 0 ? realSpend  : (impSpend  ?? 0);
  const displayOrders = realOrders > 0 ? realOrders : (impOrders ?? 0);
  const displayLast   = realLast?.toISOString() ?? impLast?.toISOString() ?? null;

  const days = daysSince(displayLast ? new Date(displayLast) : null);
  return {
    id:                   c.id,
    name:                 c.name,
    phone:                c.phone ?? "",
    totalSpend:           displaySpend,
    totalOrders:          displayOrders,
    lastOrderAt:          displayLast,
    daysSinceLastOrder:   days,
    tier:                 getTier(displaySpend),
    isActive:             c.isActive,
    birthDate:            c.birthDate?.toISOString() ?? null,
    crmContactable:       c.crmContactable ?? true,
    contactStatus:        c.contactStatus ?? null,
    dataEnrichmentStatus: c.dataEnrichmentStatus ?? null,
    importedOrderCount:   impOrders,
    importedTotalSpent:   impSpend,
    importedLastOrderAt:  impLast?.toISOString() ?? null,
    averageTicket:        c.averageTicket !== null && c.averageTicket !== undefined
      ? Number(c.averageTicket) : null,
    isUsingImportedData,
  };
}

// ── Opportunity types ─────────────────────────────────────────────────────────

export type OpportunityType = "REACTIVATION" | "BIRTHDAY" | "VIP_INACTIVE" | "NEW_CUSTOMER";

export type Opportunity = {
  type: OpportunityType;
  title: string;
  description: string;
  count: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  suggestedMessage: string;
  customers: CRMCustomer[];
};

// ── Overview stats ────────────────────────────────────────────────────────────

export type OverviewStats = {
  totalCustomers:         number;
  ativoCustomers:         number; // lastOrderAt ≤ 30 days
  mornoCustomers:         number; // lastOrderAt 31-60 days
  frioCustomers:          number; // lastOrderAt > 60 days
  perdidosCustomers:      number; // lastOrderAt ≥ lostMinDays days (default 120d) — subset of frioCustomers
  newCustomers:           number; // created within selected date range
  segments: Array<{ tier: CustomerTier; count: number }>;
  deliveryOnlyCustomers:  number; // ordered only via delivery
  dineInOnlyCustomers:    number; // ordered only presencially
  bothChannelsCustomers:  number; // ordered via both channels
  // ── Contactability health (the whole non-guest base) ──
  contactableCustomers:   number; // valid phone → reachable on WhatsApp
  withEmailCustomers:     number; // has an e-mail (alternative channel)
  uncontactableCustomers: number; // no valid phone AND no e-mail → unreachable ("inúteis")
  foocciAcquiredCustomers: number; // sourceSystem null → acquired through Foocci (not imported)
};

// ── Top customers (most valuable) ─────────────────────────────────────────────

export type TopCustomerSegment = "QUENTE" | "MORNO" | "FRIO" | "PERDIDO" | "SEM_PEDIDOS";

/** Data provenance for a top-customer row (real Foocci orders vs imported history). */
export type TopCustomerSource = "FOCCI_ONLY" | "IMPORTED_INCLUDED" | "MIXED";

export type TopCustomer = {
  customerId:  string;
  name:        string;
  phone:       string;
  totalSpent:  number;       // spend within the basis window (period / 12m / all-time)
  orderCount:  number;       // orders within the basis window
  lastOrderAt: string | null; // overall last order (real or imported), for recency
  tier:        CustomerTier;
  segment:     TopCustomerSegment;
  source:      TopCustomerSource;
};

/** How the top-customers list was computed, so the UI can label it honestly. */
export type TopCustomersBasis = "PERIOD" | "LOOKBACK_12M" | "ALL_TIME";

export type TopCustomersResult = {
  customers:    TopCustomer[];
  basis:        TopCustomersBasis;
  fallbackUsed: boolean;   // true when a short period fell back to the last 12 months
};

/**
 * Pure classification of a customer into a temperature segment by recency.
 * PERDIDO is the subset of FRIO that is past the lost threshold. Exported for tests.
 */
export function classifyTopSegment(
  daysSinceLastOrder: number | null,
  cfg: Pick<SegmentConfig, "hotMaxDays" | "warmMaxDays" | "lostMinDays">,
): TopCustomerSegment {
  if (daysSinceLastOrder === null) return "SEM_PEDIDOS";
  if (daysSinceLastOrder <= cfg.hotMaxDays)  return "QUENTE";
  if (daysSinceLastOrder <= cfg.warmMaxDays) return "MORNO";
  if (daysSinceLastOrder >= cfg.lostMinDays) return "PERDIDO";
  return "FRIO";
}

// ── Automation shape ──────────────────────────────────────────────────────────

export type AutomationRow = {
  id: string;
  trigger: string;
  isEnabled: boolean;
  messageTemplate: string;
  triggerAfterDays: number;
  discountType: string | null;
  discountValue: number | null;
  scheduleConfig: { sendTime?: string; sendDays?: number[]; timezone?: string } | null;
};

// ── Input types ───────────────────────────────────────────────────────────────

export type UpsertAutomationInput = {
  isEnabled?: boolean;
  messageTemplate?: string;
  triggerAfterDays?: number;
  oncePerCustomerLifetime?: boolean;
  discountType?: string | null;
  discountValue?: number | null;
  scheduleConfig?: { sendTime?: string; sendDays?: number[]; timezone?: string } | null;
};

// ── Service ───────────────────────────────────────────────────────────────────

export class CRMService {

  // ── Customers ──────────────────────────────────────────────────────────────

  static async getCustomers(
    restaurantId: string,
    filter?: "inactive" | "neverOrdered" | "quente" | "morno" | "frio" | "recent" | "all" | "firstTime" | "tier-bronze" | "tier-prata" | "tier-ouro" | "tier-diamante",
    search?: string
  ): Promise<ServiceResult<CRMCustomer[]>> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const sixtyDaysAgo  = new Date(now.getTime() - 60 * 86_400_000);
    const sevenDaysAgo  = new Date(now.getTime() - 7  * 86_400_000);

    let where: Record<string, unknown> = { restaurantId, isGuest: false };

    if (filter === "inactive") {
      where = {
        ...where,
        isActive: true,
        lastOrderAt: { lt: thirtyDaysAgo },
      };
    } else if (filter === "quente") {
      where = {
        ...where,
        isActive: true,
        lastOrderAt: { gte: thirtyDaysAgo },
      };
    } else if (filter === "morno") {
      where = {
        ...where,
        isActive: true,
        lastOrderAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      };
    } else if (filter === "frio") {
      where = {
        ...where,
        isActive: true,
        lastOrderAt: { lt: sixtyDaysAgo },
      };
    } else if (filter === "neverOrdered") {
      where = {
        ...where,
        isActive: true,
        totalOrders: 0,
      };
    } else if (filter === "tier-bronze") {
      where = { ...where, isActive: true, tier: "BRONZE" };
    } else if (filter === "tier-prata") {
      where = { ...where, isActive: true, tier: "PRATA" };
    } else if (filter === "tier-ouro") {
      where = { ...where, isActive: true, tier: "OURO" };
    } else if (filter === "tier-diamante") {
      where = { ...where, isActive: true, tier: "DIAMANTE" };
    } else if (filter === "firstTime") {
      where = {
        ...where,
        isActive: true,
        totalOrders: 1,
      };
    } else if (filter === "recent") {
      where = {
        ...where,
        isActive: true,
        lastOrderAt: { gte: sevenDaysAgo },
      };
    }

    if (search?.trim()) {
      const s      = search.trim();
      const digits = s.replace(/\D/g, "");
      const searchClause = digits.length >= 4
        ? { OR: [
            { name:  { contains: s,      mode: "insensitive" as const } },
            { phone: { contains: digits, mode: "insensitive" as const } },
          ]}
        : { name: { contains: s, mode: "insensitive" as const } };
      where = { ...where, AND: [searchClause] };
    }

    const rows = await prisma.customer.findMany({
      where,
      orderBy: [{ totalSpend: "desc" }, { lastOrderAt: "desc" }],
      select: {
        id: true, name: true, phone: true,
        totalSpend: true, totalOrders: true,
        lastOrderAt: true, isActive: true, birthDate: true,
        crmContactable: true, contactStatus: true, dataEnrichmentStatus: true,
        importedOrderCount: true, importedTotalSpent: true,
        importedLastOrderAt: true, averageTicket: true,
      },
    });

    return serviceOk(rows.map(serializeCustomer));
  }

  // ── Opportunities ──────────────────────────────────────────────────────────

  static async getOpportunities(
    restaurantId: string,
    restaurantName: string
  ): Promise<ServiceResult<Opportunity[]>> {
    const now = new Date();
    const todayMonth = now.getMonth() + 1;
    const todayDay   = now.getDate();

    // Fetch all active, non-guest customers in one query
    const customers = await prisma.customer.findMany({
      where: { restaurantId, isActive: true, isGuest: false },
      select: {
        id: true, name: true, phone: true,
        totalSpend: true, totalOrders: true,
        lastOrderAt: true, isActive: true, birthDate: true,
        crmContactable: true, contactStatus: true, dataEnrichmentStatus: true,
        importedOrderCount: true, importedTotalSpent: true,
        importedLastOrderAt: true, averageTicket: true,
      },
    });

    const serialized = customers.map(serializeCustomer);
    const opportunities: Opportunity[] = [];

    // 1. Reactivation — inactive 15–60 days
    const inactive = serialized.filter((c) => {
      const d = c.daysSinceLastOrder;
      return d !== null && d >= 15 && d <= 60;
    });
    if (inactive.length > 0) {
      opportunities.push({
        type: "REACTIVATION",
        title: `Reativar ${inactive.length} cliente${inactive.length > 1 ? "s" : ""} inativo${inactive.length > 1 ? "s" : ""}`,
        description: `Clientes que não pedem há ${15}–${60} dias. Momento ideal para uma oferta de retorno.`,
        count: inactive.length,
        priority: inactive.length >= 5 ? "HIGH" : "MEDIUM",
        suggestedMessage: pickSuggestedMessage("REACTIVATION", restaurantName, inactive.length),
        customers: inactive.slice(0, 10),
      });
    }

    // 2. Birthdays — today ±3 days
    const birthdays = serialized.filter((c) => {
      if (!c.birthDate) return false;
      const bd = new Date(c.birthDate);
      const bMonth = bd.getMonth() + 1;
      const bDay   = bd.getDate();
      // Today
      if (bMonth === todayMonth && bDay === todayDay) return true;
      // Next 3 days
      for (let i = 1; i <= 3; i++) {
        const future = new Date(now.getTime() + i * 86_400_000);
        if (bMonth === future.getMonth() + 1 && bDay === future.getDate()) return true;
      }
      return false;
    });
    if (birthdays.length > 0) {
      const todayBirthdays = birthdays.filter((c) => {
        const bd = new Date(c.birthDate!);
        return bd.getMonth() + 1 === todayMonth && bd.getDate() === todayDay;
      });
      const prefix = todayBirthdays.length > 0
        ? `🎂 ${todayBirthdays.length} aniversário(s) hoje`
        : `🎂 ${birthdays.length} aniversário(s) nos próximos dias`;
      opportunities.push({
        type: "BIRTHDAY",
        title: prefix,
        description: "Mensagem de aniversário com oferta especial. Clientes adoram ser lembrados!",
        count: birthdays.length,
        priority: "HIGH",
        suggestedMessage: pickSuggestedMessage("BIRTHDAY", restaurantName, birthdays.length),
        customers: birthdays.slice(0, 10),
      });
    }

    // 3. VIP inactive — Ouro/Diamante idle > 14 days
    const vipInactive = serialized.filter((c) => {
      const tier = c.tier;
      const isVip = tier === "OURO" || tier === "DIAMANTE";
      const d = c.daysSinceLastOrder;
      return isVip && d !== null && d >= 14;
    });
    if (vipInactive.length > 0) {
      opportunities.push({
        type: "VIP_INACTIVE",
        title: `${vipInactive.length} cliente${vipInactive.length > 1 ? "s" : ""} VIP sem pedir`,
        description: `Clientes Ouro e Diamante que há mais de 14 dias não fazem um pedido. Alto potencial de receita.`,
        count: vipInactive.length,
        priority: "HIGH",
        suggestedMessage: pickSuggestedMessage("VIP_INACTIVE", restaurantName, vipInactive.length),
        customers: vipInactive.slice(0, 10),
      });
    }

    // 4. New customers — first order within last 7 days (follow-up)
    const newCustomers = serialized.filter((c) => {
      const d = c.daysSinceLastOrder;
      return c.totalOrders === 1 && d !== null && d <= 7;
    });
    if (newCustomers.length > 0) {
      opportunities.push({
        type: "NEW_CUSTOMER",
        title: `${newCustomers.length} novo${newCustomers.length > 1 ? "s" : ""} cliente${newCustomers.length > 1 ? "s" : ""} para fidelizar`,
        description: "Clientes que fizeram o primeiro pedido esta semana. Ótimo momento para criar um vínculo.",
        count: newCustomers.length,
        priority: "MEDIUM",
        suggestedMessage: pickSuggestedMessage("NEW_CUSTOMER", restaurantName, newCustomers.length),
        customers: newCustomers.slice(0, 10),
      });
    }

    // Sort by priority
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    opportunities.sort((a, b) => order[a.priority] - order[b.priority]);

    return serviceOk(opportunities);
  }

  // ── Automations ────────────────────────────────────────────────────────────

  static async getAutomations(restaurantId: string): Promise<ServiceResult<AutomationRow[]>> {
    const rows = await prisma.cRMAutomation.findMany({
      where: { restaurantId },
      orderBy: { trigger: "asc" },
    });

    return serviceOk(
      rows.map((r) => ({
        id:               r.id,
        trigger:          r.trigger,
        isEnabled:        r.isEnabled,
        messageTemplate:  r.messageTemplate,
        triggerAfterDays: r.triggerAfterDays,
        discountType:     r.discountType ?? null,
        discountValue:    r.discountValue != null ? Number(r.discountValue) : null,
        scheduleConfig:   (r.scheduleConfig as AutomationRow["scheduleConfig"]) ?? null,
      }))
    );
  }

  static async upsertAutomation(
    restaurantId: string,
    trigger: AutomationTrigger,
    input: UpsertAutomationInput
  ): Promise<ServiceResult<AutomationRow>> {
    const data = {
      ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled }),
      ...(input.messageTemplate !== undefined && { messageTemplate: input.messageTemplate }),
      ...(input.triggerAfterDays !== undefined && { triggerAfterDays: input.triggerAfterDays }),
      ...(input.oncePerCustomerLifetime !== undefined && { oncePerCustomerLifetime: input.oncePerCustomerLifetime }),
      ...(input.discountType !== undefined && { discountType: input.discountType }),
      ...(input.discountValue !== undefined && {
        discountValue: input.discountValue != null ? new Decimal(input.discountValue) : null,
      }),
      ...(input.scheduleConfig != null && { scheduleConfig: input.scheduleConfig }),
    };

    const existing = await prisma.cRMAutomation.findUnique({
      where: { restaurantId_trigger: { restaurantId, trigger } },
    });

    const r = existing
      ? await prisma.cRMAutomation.update({ where: { id: existing.id }, data })
      : await prisma.cRMAutomation.create({
          data: {
            restaurantId,
            trigger,
            isEnabled: false,
            messageTemplate: "",
            triggerAfterDays: trigger === "REACTIVATION" ? 30 : trigger === "POST_ORDER" ? 1 : 0,
            ...data,
          },
        });

    return serviceOk({
      id:               r.id,
      trigger:          r.trigger,
      isEnabled:        r.isEnabled,
      messageTemplate:  r.messageTemplate,
      triggerAfterDays: r.triggerAfterDays,
      discountType:     r.discountType ?? null,
      discountValue:    r.discountValue != null ? Number(r.discountValue) : null,
      scheduleConfig:   (r.scheduleConfig as AutomationRow["scheduleConfig"]) ?? null,
    });
  }

  static async getRestaurantName(restaurantId: string): Promise<string> {
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true },
    });
    return r?.name ?? "nosso restaurante";
  }

  // ── Overview stats ─────────────────────────────────────────────────────────

  static async getOverviewStats(
    restaurantId: string,
    dateRange?: { from: Date; to: Date }
  ): Promise<ServiceResult<OverviewStats>> {
    const now = new Date();
    const segCfg = await getSegmentConfig(restaurantId);
    const hotCutoff  = new Date(now.getTime() - segCfg.hotMaxDays  * 86_400_000);
    const warmCutoff = new Date(now.getTime() - segCfg.warmMaxDays * 86_400_000);
    const lostCutoff = new Date(now.getTime() - segCfg.lostMinDays * 86_400_000);

    const newCustomersFilter = dateRange
      ? { gte: dateRange.from, lte: dateRange.to }
      : { gte: new Date(now.getFullYear(), now.getMonth(), 1) };

    // Temperature segments use COALESCE(lastOrderAt, importedLastOrderAt) so imported
    // customers with historical purchase dates are not all counted as "no orders".
    // Tier segments use COALESCE(totalSpend, importedTotalSpent, 0) for the same reason.
    const [
      totalCustomers,
      tempRows,
      tierRows,
      newCustomers,
      channelData,
      perdidoRows,
      contactRows,
    ] = await Promise.all([
      prisma.customer.count({ where: { restaurantId, isGuest: false } }),
      prisma.$queryRaw<Array<{ bucket: string; cnt: bigint }>>`
        SELECT
          CASE
            WHEN COALESCE("lastOrderAt", "importedLastOrderAt") >= ${hotCutoff}  THEN 'ativo'
            WHEN COALESCE("lastOrderAt", "importedLastOrderAt") >= ${warmCutoff} THEN 'morno'
            WHEN COALESCE("lastOrderAt", "importedLastOrderAt") IS NOT NULL       THEN 'frio'
            ELSE 'sem_pedidos'
          END AS bucket,
          COUNT(*)::bigint AS cnt
        FROM customers
        WHERE "restaurantId" = ${restaurantId}
          AND "isGuest" = false
        GROUP BY 1
      `,
      prisma.$queryRaw<Array<{ bucket: string; cnt: bigint }>>`
        SELECT
          CASE
            WHEN COALESCE("totalSpend", "importedTotalSpent", 0) >= 2000 THEN 'diamante'
            WHEN COALESCE("totalSpend", "importedTotalSpent", 0) >=  800 THEN 'ouro'
            WHEN COALESCE("totalSpend", "importedTotalSpent", 0) >=  300 THEN 'prata'
            ELSE 'bronze'
          END AS bucket,
          COUNT(*)::bigint AS cnt
        FROM customers
        WHERE "restaurantId" = ${restaurantId}
          AND "isGuest" = false
        GROUP BY 1
      `,
      prisma.customer.count({ where: { restaurantId, isGuest: false, createdAt: newCustomersFilter } }),
      prisma.order.groupBy({
        by: ["customerId", "type"],
        where: { restaurantId },
        _count: { _all: true },
      }),
      prisma.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(*)::bigint AS cnt
        FROM customers
        WHERE "restaurantId" = ${restaurantId}
          AND "isGuest" = false
          AND COALESCE("lastOrderAt", "importedLastOrderAt") IS NOT NULL
          AND COALESCE("lastOrderAt", "importedLastOrderAt") < ${lostCutoff}
      `,
      // Contactability health across the whole non-guest base.
      prisma.$queryRaw<Array<{
        contactable:     bigint;
        with_email:      bigint;
        uncontactable:   bigint;
        foocci_acquired: bigint;
      }>>`
        SELECT
          COUNT(*) FILTER (WHERE "crmContactable" = true)                                AS contactable,
          COUNT(*) FILTER (WHERE email IS NOT NULL AND email <> '')                       AS with_email,
          COUNT(*) FILTER (WHERE "crmContactable" = false
                             AND (email IS NULL OR email = ''))                           AS uncontactable,
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM orders o
            WHERE o."customerId" = customers.id AND o."importedAt" IS NULL
          ))                                                                              AS foocci_acquired
        FROM customers
        WHERE "restaurantId" = ${restaurantId}
          AND "isGuest" = false
      `,
    ]);

    const bucketNum = (bucket: string) => {
      const found = tempRows.find(r => r.bucket === bucket);
      return found ? Number(found.cnt) : 0;
    };
    const ativoCustomers = bucketNum("ativo");
    const mornoCustomers = bucketNum("morno");
    const frioCustomers  = bucketNum("frio");
    const perdidosCustomers = perdidoRows[0] ? Number(perdidoRows[0].cnt) : 0;

    const tierNum = (bucket: string) => {
      const found = tierRows.find(r => r.bucket === bucket);
      return found ? Number(found.cnt) : 0;
    };
    const bronze  = tierNum("bronze");
    const prata   = tierNum("prata");
    const ouro    = tierNum("ouro");
    const diamante = tierNum("diamante");

    // Customer-based channel segmentation
    const customerChannelMap = new Map<string, Set<string>>();
    for (const row of channelData) {
      if (!customerChannelMap.has(row.customerId)) {
        customerChannelMap.set(row.customerId, new Set());
      }
      customerChannelMap.get(row.customerId)!.add(row.type as string);
    }
    let deliveryOnlyCustomers = 0, dineInOnlyCustomers = 0, bothChannelsCustomers = 0;
    for (const channels of customerChannelMap.values()) {
      if (channels.has("DELIVERY") && channels.has("DINE_IN")) bothChannelsCustomers++;
      else if (channels.has("DELIVERY")) deliveryOnlyCustomers++;
      else if (channels.has("DINE_IN"))  dineInOnlyCustomers++;
    }

    const contactRow = contactRows[0];
    const contactableCustomers    = contactRow ? Number(contactRow.contactable)     : 0;
    const withEmailCustomers      = contactRow ? Number(contactRow.with_email)      : 0;
    const uncontactableCustomers  = contactRow ? Number(contactRow.uncontactable)   : 0;
    const foocciAcquiredCustomers = contactRow ? Number(contactRow.foocci_acquired) : 0;

    return serviceOk({
      totalCustomers,
      ativoCustomers,
      mornoCustomers,
      frioCustomers,
      perdidosCustomers,
      newCustomers,
      segments: [
        { tier: "DIAMANTE" as CustomerTier, count: diamante },
        { tier: "OURO"     as CustomerTier, count: ouro },
        { tier: "PRATA"    as CustomerTier, count: prata },
        { tier: "BRONZE"   as CustomerTier, count: bronze },
      ],
      deliveryOnlyCustomers,
      dineInOnlyCustomers,
      bothChannelsCustomers,
      contactableCustomers,
      withEmailCustomers,
      uncontactableCustomers,
      foocciAcquiredCustomers,
    });
  }

  // ── Top customers (most valuable) ────────────────────────────────────────────
  //
  // Honest, read-only ranking of the restaurant's biggest spenders.
  //   • With a date range → spend from real orders inside that window.
  //   • Short windows (≤ 8 days: Hoje / 7 dias / Esta semana) that return too few
  //     spenders fall back to the last 12 months, clearly flagged for the UI.
  //   • No range (Total) → all-time spend using denormalized Customer totals,
  //     including imported history (importedTotalSpent) when the customer has no
  //     real Foocci orders yet.
  // Guests, cancelled and unpaid orders are excluded. Never invents spend.
  static async getTopCustomers(
    restaurantId: string,
    dateRange?: { from: Date; to: Date },
    opts?: { limit?: number; minResults?: number },
  ): Promise<ServiceResult<TopCustomersResult>> {
    const limit      = opts?.limit      ?? 10;
    const minResults = opts?.minResults ?? 3;
    const cfg        = await getSegmentConfig(restaurantId);
    const now        = Date.now();

    const overallDays = (real: Date | null, imported: Date | null): number | null => {
      const d = real ?? imported ?? null;
      return d ? Math.floor((now - d.getTime()) / 86_400_000) : null;
    };

    // Build a TopCustomer row from a customer record + window spend/orders/last.
    const buildRow = (
      c: {
        id: string; name: string; phone: string | null;
        totalSpend: Decimal | number; totalOrders: number;
        lastOrderAt: Date | null;
        importedTotalSpent: Decimal | number | null;
        importedOrderCount: number | null;
        importedLastOrderAt: Date | null;
      },
      windowSpent: number,
      windowOrders: number,
    ): TopCustomer => {
      const realOrders   = c.totalOrders;
      const realSpend    = Number(c.totalSpend);
      const impSpend     = c.importedTotalSpent != null ? Number(c.importedTotalSpent) : 0;
      const impOrders    = c.importedOrderCount ?? 0;
      const allTimeSpend = realOrders > 0 ? realSpend : impSpend;
      const hasReal      = realOrders > 0;
      const hasImported  = impOrders > 0 || impSpend > 0;
      const source: TopCustomerSource =
        hasReal && hasImported ? "MIXED" : hasReal ? "FOCCI_ONLY" : "IMPORTED_INCLUDED";
      const days = overallDays(c.lastOrderAt, c.importedLastOrderAt);
      return {
        customerId:  c.id,
        name:        c.name,
        phone:       c.phone ?? "",
        totalSpent:  windowSpent,
        orderCount:  windowOrders,
        lastOrderAt: (c.lastOrderAt ?? c.importedLastOrderAt)?.toISOString() ?? null,
        tier:        getTier(allTimeSpend),
        segment:     classifyTopSegment(days, cfg),
        source,
      };
    };

    // Aggregate real-order spend within [from, to], top N spenders (guests excluded).
    const aggregatePeriod = async (from: Date, to: Date): Promise<TopCustomer[]> => {
      const grouped = await prisma.order.groupBy({
        by: ["customerId"],
        where: {
          restaurantId,
          status:    { notIn: REVENUE_EXCLUDED_STATUSES },
          createdAt: { gte: from, lte: to },
          customer:  { isGuest: false },
        },
        _sum:    { total: true },
        _count:  { _all: true },
        orderBy: { _sum: { total: "desc" } },
        take:    limit,
      });

      const ids = grouped.map((g) => g.customerId);
      if (ids.length === 0) return [];

      const custs = await prisma.customer.findMany({
        where:  { id: { in: ids }, restaurantId },
        select: {
          id: true, name: true, phone: true,
          totalSpend: true, totalOrders: true, lastOrderAt: true,
          importedTotalSpent: true, importedOrderCount: true, importedLastOrderAt: true,
        },
      });
      const byId = new Map(custs.map((c) => [c.id, c]));

      return grouped
        .map((g) => {
          const c = byId.get(g.customerId);
          const spent = Number(g._sum.total ?? 0);
          if (!c || spent <= 0) return null;
          return buildRow(c, spent, g._count._all);
        })
        .filter((r): r is TopCustomer => r !== null);
    };

    // ── All-time (no range) ────────────────────────────────────────────────────
    if (!dateRange) {
      const rows = await prisma.$queryRaw<Array<{
        id: string; name: string; phone: string | null;
        totalSpend: Decimal; totalOrders: number; lastOrderAt: Date | null;
        importedTotalSpent: Decimal | null; importedOrderCount: number | null;
        importedLastOrderAt: Date | null;
      }>>`
        SELECT id, name, phone, "totalSpend", "totalOrders", "lastOrderAt",
               "importedTotalSpent", "importedOrderCount", "importedLastOrderAt"
        FROM customers
        WHERE "restaurantId" = ${restaurantId} AND "isGuest" = false
        ORDER BY (CASE WHEN "totalOrders" > 0 THEN "totalSpend"
                       ELSE COALESCE("importedTotalSpent", 0) END) DESC
        LIMIT ${limit}
      `;
      const customers = rows
        .map((c) => {
          const allTimeSpend  = c.totalOrders > 0 ? Number(c.totalSpend) : Number(c.importedTotalSpent ?? 0);
          const allTimeOrders = c.totalOrders > 0 ? c.totalOrders : (c.importedOrderCount ?? 0);
          if (allTimeSpend <= 0) return null;
          return buildRow(c, allTimeSpend, allTimeOrders);
        })
        .filter((r): r is TopCustomer => r !== null);
      return serviceOk({ customers, basis: "ALL_TIME", fallbackUsed: false });
    }

    // ── Period, with short-window fallback to last 12 months ───────────────────
    const periodCustomers = await aggregatePeriod(dateRange.from, dateRange.to);
    const rangeDays = (dateRange.to.getTime() - dateRange.from.getTime()) / 86_400_000;

    if (periodCustomers.length < minResults && rangeDays <= 8) {
      const from12 = new Date(now - 365 * 86_400_000);
      const to12   = new Date(now);
      const lookback = await aggregatePeriod(from12, to12);
      if (lookback.length > periodCustomers.length) {
        return serviceOk({ customers: lookback, basis: "LOOKBACK_12M", fallbackUsed: true });
      }
    }

    return serviceOk({ customers: periodCustomers, basis: "PERIOD", fallbackUsed: false });
  }
}
