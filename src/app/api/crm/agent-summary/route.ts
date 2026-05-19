/**
 * GET /api/crm/agent-summary
 *
 * Read-only aggregate for the Agente CRM dashboard.
 * Returns overview stats, active campaigns, automations, and CRM revenue totals
 * in one call so the page only needs a single fetch.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { CRMService } from "@/services/crm/CRMService";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { restaurantId } = ctx;

    const [statsResult, activeCampaigns, automationsResult, revenueAgg, customersWithBirthday] =
      await Promise.all([
        CRMService.getOverviewStats(restaurantId),

        prisma.campaign.findMany({
          where: {
            restaurantId,
            status: { in: ["ACTIVE", "SCHEDULED", "PAUSED", "SENDING"] as never[] },
          },
          select: {
            id:             true,
            name:           true,
            status:         true,
            targetSegment:  true,
            scheduleConfig: true,
            totalSent:      true,
            totalResponded: true,
            totalConverted: true,
            totalRevenue:   true,
            scheduledAt:    true,
            createdAt:      true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),

        CRMService.getAutomations(restaurantId),

        prisma.campaign.aggregate({
          where: { restaurantId },
          _sum: {
            totalSent:      true,
            totalResponded: true,
            totalConverted: true,
            totalRevenue:   true,
          },
        }),

        prisma.customer.findMany({
          where: { restaurantId, isGuest: false, birthDate: { not: null } },
          select: { birthDate: true },
        }),
      ]);

    const stats = statsResult.ok ? statsResult.data : null;

    const currentMonth        = new Date().getMonth();
    const birthdayThisMonth   = customersWithBirthday.filter(
      (c) => c.birthDate !== null && c.birthDate.getMonth() === currentMonth
    ).length;

    const vipSegments    = stats?.segments ?? [];
    const vipCustomers   = (vipSegments.find((s) => s.tier === "OURO")?.count  ?? 0) +
                           (vipSegments.find((s) => s.tier === "DIAMANTE")?.count ?? 0);

    const automations    = automationsResult.ok ? automationsResult.data : [];

    const campaigns = activeCampaigns.map((c) => ({
      id:             c.id,
      name:           c.name,
      status:         c.status,
      targetSegment:  c.targetSegment ?? null,
      scheduleConfig: c.scheduleConfig as Record<string, unknown> | null,
      totalSent:      c.totalSent,
      totalResponded: c.totalResponded,
      totalConverted: c.totalConverted,
      totalRevenue:   Number(c.totalRevenue),
      scheduledAt:    c.scheduledAt?.toISOString() ?? null,
      createdAt:      c.createdAt.toISOString(),
    }));

    return ok({
      overview: {
        totalCustomers:    stats?.totalCustomers    ?? 0,
        frioCustomers:     stats?.frioCustomers     ?? 0,
        mornoCustomers:    stats?.mornoCustomers    ?? 0,
        ativoCustomers:    stats?.ativoCustomers    ?? 0,
        newCustomers:      stats?.newCustomers      ?? 0,
        vipCustomers,
        birthdayThisMonth,
      },
      campaigns: {
        activeCount: campaigns.length,
        list:        campaigns,
      },
      automations: {
        enabledCount: automations.filter((a) => a.isEnabled).length,
        list: automations.map((a) => ({
          trigger:          a.trigger,
          isEnabled:        a.isEnabled,
          triggerAfterDays: a.triggerAfterDays,
        })),
      },
      revenue: {
        totalSent:      revenueAgg._sum.totalSent      ?? 0,
        totalResponded: revenueAgg._sum.totalResponded ?? 0,
        totalConverted: revenueAgg._sum.totalConverted ?? 0,
        totalRevenue:   Number(revenueAgg._sum.totalRevenue ?? 0),
      },
    });
  } catch (err) {
    console.error("[GET /api/crm/agent-summary]", err);
    return serverError();
  }
}
