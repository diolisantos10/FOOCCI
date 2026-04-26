import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { TopBar } from "@/components/layout/TopBar";
import { CRMClient } from "./CRMClient";
import { CRMService, getTier } from "@/services/crm/CRMService";
import type { CRMCustomer, Opportunity, OverviewStats } from "@/services/crm/CRMService";

export const metadata = { title: "CRM — Motor de Receita" };
export const dynamic = "force-dynamic";

export default async function CRMPage() {
  let restaurantId: string | null = null;
  let restaurantName = "Restaurante";
  try { restaurantId = getTenantId(); } catch { /* unauthenticated */ }

  let customers:     CRMCustomer[]  = [];
  let opportunities: Opportunity[]  = [];
  let overviewStats: OverviewStats = {
    totalCustomers: 0, activeCustomers: 0, inactiveCustomers: 0,
    newCustomers: 0, segments: [], deliveryOrders: 0, dineInOrders: 0,
  };
  let reviewLinks: { google: string | null; ifood: string | null } = { google: null, ifood: null };

  if (restaurantId) {
    const [restaurant, rows, opResult, statsResult, brandConfig] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
      prisma.customer.findMany({
        where: { restaurantId },
        orderBy: [{ totalSpend: "desc" }, { lastOrderAt: "desc" }],
        select: {
          id: true, name: true, phone: true,
          totalSpend: true, totalOrders: true,
          lastOrderAt: true, isActive: true, birthDate: true,
        },
      }),
      CRMService.getOpportunities(restaurantId, restaurantName),
      CRMService.getOverviewStats(restaurantId),
      prisma.restaurantBrandConfig.findUnique({
        where: { restaurantId },
        select: { googleReviewUrl: true, ifoodReviewUrl: true },
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

    if (opResult.ok) opportunities = opResult.data;
    if (statsResult.ok) overviewStats = statsResult.data;
    if (brandConfig) {
      reviewLinks = {
        google: brandConfig.googleReviewUrl ?? null,
        ifood:  brandConfig.ifoodReviewUrl  ?? null,
      };
    }
  }

  return (
    <>
      <TopBar title="CRM — Motor de Receita" />
      <CRMClient
        initialCustomers={customers}
        initialOpportunities={opportunities}
        restaurantName={restaurantName}
        overviewStats={overviewStats}
        opportunitiesCount={opportunities.length}
        reviewLinks={reviewLinks}
      />
    </>
  );
}
