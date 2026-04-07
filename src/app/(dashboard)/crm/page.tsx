import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { TopBar } from "@/components/layout/TopBar";
import { CRMClient } from "./CRMClient";
import { CRMService, getTier } from "@/services/crm/CRMService";
import type { CRMCustomer, Opportunity, AutomationRow } from "@/services/crm/CRMService";

export const metadata = { title: "CRM — Motor de Receita" };
export const dynamic = "force-dynamic";

export default async function CRMPage() {
  let restaurantId: string | null = null;
  let restaurantName = "Restaurante";
  try { restaurantId = getTenantId(); } catch { /* unauthenticated */ }

  let customers:    CRMCustomer[]  = [];
  let opportunities: Opportunity[] = [];
  let automations:  AutomationRow[] = [];

  if (restaurantId) {
    const [restaurant, rows, autoRows] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
      prisma.customer.findMany({
        where: { restaurantId },
        orderBy: [{ totalSpend: "desc" }, { lastOrderAt: "desc" }],
        take: 100,
        select: {
          id: true, name: true, phone: true,
          totalSpend: true, totalOrders: true,
          lastOrderAt: true, isActive: true, birthDate: true,
        },
      }),
      prisma.cRMAutomation.findMany({
        where: { restaurantId },
        orderBy: { trigger: "asc" },
      }),
    ]);

    restaurantName = restaurant?.name ?? "Restaurante";

    const now = new Date();
    customers = rows.map((c) => {
      const spend = Number(c.totalSpend);
      const days = c.lastOrderAt
        ? Math.floor((now.getTime() - c.lastOrderAt.getTime()) / 86_400_000)
        : null;
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
    });

    automations = autoRows.map((r) => ({
      id:               r.id,
      trigger:          r.trigger,
      isEnabled:        r.isEnabled,
      messageTemplate:  r.messageTemplate,
      triggerAfterDays: r.triggerAfterDays,
      discountType:     r.discountType ?? null,
      discountValue:    r.discountValue != null ? Number(r.discountValue) : null,
    }));

    const result = await CRMService.getOpportunities(restaurantId, restaurantName);
    if (result.ok) opportunities = result.data;
  }

  return (
    <>
      <TopBar title="CRM — Motor de Receita" />
      <CRMClient
        initialCustomers={customers}
        initialOpportunities={opportunities}
        initialAutomations={automations}
        restaurantName={restaurantName}
      />
    </>
  );
}
