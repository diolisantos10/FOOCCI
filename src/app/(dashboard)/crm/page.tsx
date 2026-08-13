import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { TopBar } from "@/components/layout/TopBar";
import { CRMClient, type CrmTab } from "./CRMClient";
import { CRMService, getTier } from "@/services/crm/CRMService";
import type { CRMCustomer, Opportunity, OverviewStats } from "@/services/crm/CRMService";
import { CrmActionCenterService } from "@/services/crm/CrmActionCenterService";
import type { CrmAction } from "@/services/crm/CrmActionCenterService";

export const metadata = { title: "CRM — Motor de Receita" };
export const dynamic = "force-dynamic";

// A lista de abas mora no CRMClient — aqui só se traduz o slug da URL. Antes
// existiam duas cópias deste tipo, e elas já tinham divergido: esta esquecera a
// aba "migracao" e ainda carregava "automacoes", que não existe mais.
const TAB_PARAM_MAP: Record<string, CrmTab> = {
  "visao-geral":   "overview",
  "campanhas":     "campanhas",
  "migracao":      "migracao",
  "cupons":        "cupons",
  "conversoes":    "conversoes",
  "clientes":      "customers",
  "programa":      "programa",
  "avaliacoes":    "avaliacoes",
  "configuracoes": "configuracoes",
};

const CUSTOMERS_PAGE_SIZE = 20;

export default async function CRMPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const initialTab: CrmTab = TAB_PARAM_MAP[tabParam ?? ""] ?? "overview";
  let restaurantId: string | null = null;
  let restaurantName = "Restaurante";
  try { restaurantId = getTenantId(); } catch { /* unauthenticated */ }

  let customers:           CRMCustomer[]  = [];
  let customersTotal       = 0;
  let opportunities:       Opportunity[]  = [];
  let actionCenterActions: CrmAction[]    = [];
  // Falhou o cálculo dos avisos? A Visão Geral precisa saber a diferença entre
  // "nada travando" e "não deu para conferir" — senão o erro vira silêncio, e
  // silêncio o lojista lê como saúde (guardrail 1).
  let actionCenterFailed = false;
  let overviewStats: OverviewStats = {
    totalCustomers: 0, ativoCustomers: 0, mornoCustomers: 0, frioCustomers: 0,
    perdidosCustomers: 0, naoCompraramCustomers: 0,
    newCustomers: 0, segments: [],
    deliveryOnlyCustomers: 0, dineInOnlyCustomers: 0, bothChannelsCustomers: 0,
    contactableCustomers: 0, withEmailCustomers: 0, uncontactableCustomers: 0,
    foocciAcquiredCustomers: 0, activatableCustomers: 0,
  };
  let reviewLinks: { google: string | null; ifood: string | null } = { google: null, ifood: null };

  if (restaurantId) {
    const [restaurant, rows, custTotal, opResult, statsResult, brandConfig, actionCenterResult] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
      prisma.customer.findMany({
        where: { restaurantId, isGuest: false },
        orderBy: [{ totalSpend: "desc" }, { lastOrderAt: "desc" }],
        take: CUSTOMERS_PAGE_SIZE, // first page only — list paginates server-side
        select: {
          id: true, name: true, phone: true,
          totalSpend: true, totalOrders: true,
          lastOrderAt: true, isActive: true, birthDate: true,
          crmContactable: true, contactStatus: true, dataEnrichmentStatus: true,
          importedOrderCount: true, importedTotalSpent: true,
          importedLastOrderAt: true, averageTicket: true,
        },
      }),
      prisma.customer.count({ where: { restaurantId, isGuest: false } }),
      CRMService.getOpportunities(restaurantId, restaurantName),
      CRMService.getOverviewStats(restaurantId),
      prisma.restaurantBrandConfig.findUnique({
        where: { restaurantId },
        select: { googleReviewUrl: true, ifoodReviewUrl: true },
      }),
      CrmActionCenterService.getActionCenter(restaurantId).catch(() => null),
    ]);

    restaurantName = restaurant?.name ?? "Restaurante";
    customersTotal = custTotal;

    const now = new Date();
    customers = rows.map((c) => {
      const realSpend  = Number(c.totalSpend);
      const realOrders = c.totalOrders;
      const realLast   = c.lastOrderAt ?? null;
      const impSpend   = c.importedTotalSpent !== null ? Number(c.importedTotalSpent) : null;
      const impOrders  = c.importedOrderCount ?? null;
      const impLast    = c.importedLastOrderAt ?? null;
      const isUsingImportedData = realOrders === 0 && (impOrders !== null || impSpend !== null || impLast !== null);
      const displaySpend  = realOrders > 0 ? realSpend  : (impSpend  ?? 0);
      const displayOrders = realOrders > 0 ? realOrders : (impOrders ?? 0);
      const displayLast   = realLast ?? impLast;
      const days = displayLast
        ? Math.floor((now.getTime() - displayLast.getTime()) / 86_400_000)
        : null;
      return {
        id:                   c.id,
        name:                 c.name,
        phone:                c.phone ?? "",
        totalSpend:           displaySpend,
        totalOrders:          displayOrders,
        lastOrderAt:          displayLast instanceof Date ? displayLast.toISOString() : (displayLast ?? null),
        daysSinceLastOrder:   days,
        tier:                 getTier(displaySpend),
        isActive:             c.isActive,
        birthDate:            c.birthDate?.toISOString() ?? null,
        crmContactable:       c.crmContactable,
        contactStatus:        c.contactStatus ?? null,
        dataEnrichmentStatus: c.dataEnrichmentStatus ?? null,
        importedOrderCount:   impOrders,
        importedTotalSpent:   impSpend,
        importedLastOrderAt:  impLast?.toISOString() ?? null,
        averageTicket:        c.averageTicket !== null ? Number(c.averageTicket) : null,
        isUsingImportedData,
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
    if (actionCenterResult) {
      actionCenterActions = actionCenterResult.actions;
    } else {
      actionCenterFailed = true;
    }
  }

  return (
    <>
      <TopBar title="CRM — Motor de Receita" />
      <Suspense fallback={
        <div className="flex items-center justify-center py-24 text-sm text-muted">
          Carregando CRM…
        </div>
      }>
        <CRMClient
          initialCustomers={customers}
          initialCustomersTotal={customersTotal}
          customersPageSize={CUSTOMERS_PAGE_SIZE}
          initialOpportunities={opportunities}
          initialActions={actionCenterActions}
          initialActionsFailed={actionCenterFailed}
          restaurantName={restaurantName}
          overviewStats={overviewStats}
          opportunitiesCount={opportunities.length}
          reviewLinks={reviewLinks}
          initialTab={initialTab}
        />
      </Suspense>
    </>
  );
}
