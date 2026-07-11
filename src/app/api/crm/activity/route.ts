/**
 * GET /api/crm/activity — recent CRM send activity (a live, always-updating log).
 *
 * Unlike the campaign HISTORY (which only lists terminal campaign rows and never
 * updates for recurring campaigns), this returns the last N individual
 * CampaignExecution rows — every message the CRM actually sent/attempted — with
 * the campaign name, recipient, status and a full date+time stamp.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { classifyExecution } from "@/services/crm/crmExecutionClassification";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "60", 10) || 60));

    const rows = await prisma.campaignExecution.findMany({
      where:   { restaurantId: ctx.restaurantId },
      orderBy: { createdAt: "desc" },
      take:    limit,
      select: {
        id: true, status: true, sentAt: true, createdAt: true,
        customerName: true, customerPhone: true, messageText: true,
        failedReason: true, errorMessage: true, converted: true, revenue: true,
        campaign: { select: { id: true, name: true } },
      },
    });

    const activity = rows.map((r) => {
      const cls = classifyExecution({ status: r.status, failedReason: r.failedReason, errorMessage: r.errorMessage });
      return {
        id:            r.id,
        campaignId:    r.campaign?.id ?? null,
        campaignName:  r.campaign?.name ?? "Campanha",
        customerName:  r.customerName,
        customerPhone: r.customerPhone,
        messageText:   r.messageText,
        status:        r.status,
        kind:          cls.kind,
        badge:         cls.badge,
        at:            (r.sentAt ?? r.createdAt).toISOString(),
        converted:     r.converted,
        revenue:       r.revenue != null ? Number(r.revenue) : null,
      };
    });

    return ok({ activity });
  } catch (err) {
    console.error("[GET /api/crm/activity]", err);
    return serverError();
  }
}
