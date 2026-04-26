import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, type ServiceResult } from "@/types";
import { pickSuggestedMessage } from "@/lib/crm-messages";
import type { AutomationTrigger } from "@prisma/client";

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
  phone: string;
  totalSpend: number;
  totalOrders: number;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  tier: CustomerTier;
  isActive: boolean;
  birthDate: string | null;
};

function serializeCustomer(c: {
  id: string;
  name: string;
  phone: string;
  totalSpend: Decimal;
  totalOrders: number;
  lastOrderAt: Date | null;
  isActive: boolean;
  birthDate: Date | null;
}): CRMCustomer {
  const spend = Number(c.totalSpend);
  const days = daysSince(c.lastOrderAt);
  return {
    id:                 c.id,
    name:               c.name,
    phone:              c.phone,
    totalSpend:         spend,
    totalOrders:        c.totalOrders,
    lastOrderAt:        c.lastOrderAt?.toISOString() ?? null,
    daysSinceLastOrder: days,
    tier:               getTier(spend),
    isActive:           c.isActive,
    birthDate:          c.birthDate?.toISOString() ?? null,
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
  totalCustomers:    number;
  activeCustomers:   number;   // lastOrderAt within 30 days
  inactiveCustomers: number;   // isActive but no order in 30+ days
  newCustomers:      number;   // created within selected date range
  segments: Array<{ tier: CustomerTier; count: number }>;
  deliveryOrders:    number;
  dineInOrders:      number;
};

// ── Automation shape ──────────────────────────────────────────────────────────

export type AutomationRow = {
  id: string;
  trigger: string;
  isEnabled: boolean;
  messageTemplate: string;
  triggerAfterDays: number;
  discountType: string | null;
  discountValue: number | null;
};

// ── Input types ───────────────────────────────────────────────────────────────

export type UpsertAutomationInput = {
  isEnabled?: boolean;
  messageTemplate?: string;
  triggerAfterDays?: number;
  discountType?: string | null;
  discountValue?: number | null;
};

// ── Service ───────────────────────────────────────────────────────────────────

export class CRMService {

  // ── Customers ──────────────────────────────────────────────────────────────

  static async getCustomers(
    restaurantId: string,
    filter?: "inactive" | "neverOrdered" | "vip" | "recent" | "all" | "firstTime"
  ): Promise<ServiceResult<CRMCustomer[]>> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const sevenDaysAgo  = new Date(now.getTime() - 7  * 86_400_000);

    let where: Record<string, unknown> = { restaurantId };

    if (filter === "inactive") {
      where = {
        ...where,
        isActive: true,
        lastOrderAt: { lt: thirtyDaysAgo },
      };
    } else if (filter === "neverOrdered") {
      where = {
        ...where,
        isActive: true,
        totalOrders: 0,
      };
    } else if (filter === "vip") {
      where = {
        ...where,
        isActive: true,
        OR: [
          { totalSpend: { gte: new Decimal(800) } },
          { totalOrders: { gte: 10 } },
        ],
      };
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

    const rows = await prisma.customer.findMany({
      where,
      orderBy: [{ totalSpend: "desc" }, { lastOrderAt: "desc" }],
      select: {
        id: true, name: true, phone: true,
        totalSpend: true, totalOrders: true,
        lastOrderAt: true, isActive: true, birthDate: true,
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

    // Fetch all active customers in one query
    const customers = await prisma.customer.findMany({
      where: { restaurantId, isActive: true },
      select: {
        id: true, name: true, phone: true,
        totalSpend: true, totalOrders: true,
        lastOrderAt: true, isActive: true, birthDate: true,
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
      ...(input.discountType !== undefined && { discountType: input.discountType }),
      ...(input.discountValue !== undefined && {
        discountValue: input.discountValue != null ? new Decimal(input.discountValue) : null,
      }),
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
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

    const newCustomersFilter = dateRange
      ? { gte: dateRange.from, lte: dateRange.to }
      : { gte: new Date(now.getFullYear(), now.getMonth(), 1) };

    const [
      totalCustomers,
      activeCustomers,
      newCustomers,
      bronze, prata, ouro, diamante,
      deliveryOrders, dineInOrders,
    ] = await Promise.all([
      prisma.customer.count({ where: { restaurantId } }),
      prisma.customer.count({ where: { restaurantId, isActive: true, lastOrderAt: { gte: thirtyDaysAgo } } }),
      prisma.customer.count({ where: { restaurantId, createdAt: newCustomersFilter } }),
      prisma.customer.count({ where: { restaurantId, totalSpend: { lt:  300 } } }),
      prisma.customer.count({ where: { restaurantId, totalSpend: { gte: 300, lt:  800 } } }),
      prisma.customer.count({ where: { restaurantId, totalSpend: { gte: 800, lt: 2000 } } }),
      prisma.customer.count({ where: { restaurantId, totalSpend: { gte: 2000 } } }),
      prisma.order.count({ where: { restaurantId, type: "DELIVERY" } }),
      prisma.order.count({ where: { restaurantId, type: "DINE_IN" } }),
    ]);

    return serviceOk({
      totalCustomers,
      activeCustomers,
      inactiveCustomers: Math.max(0, totalCustomers - activeCustomers),
      newCustomers,
      segments: [
        { tier: "DIAMANTE" as CustomerTier, count: diamante },
        { tier: "OURO"     as CustomerTier, count: ouro },
        { tier: "PRATA"    as CustomerTier, count: prata },
        { tier: "BRONZE"   as CustomerTier, count: bronze },
      ],
      deliveryOrders,
      dineInOrders,
    });
  }
}
