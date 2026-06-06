/**
 * GET  /api/crm/campaigns  — list campaigns for the restaurant (history)
 * POST /api/crm/campaigns  — create a new campaign with audience + personalized messages
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { CrmCampaignService } from "@/services/crm/CrmCampaignService";

// ─── GET — campaign history ────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const campaigns = await prisma.campaign.findMany({
      where:   { restaurantId: ctx.restaurantId },
      orderBy: { createdAt: "desc" },
      take:    50,
      select: {
        id:             true,
        name:           true,
        objective:      true,
        channel:        true,
        targetSegment:  true,
        templateId:     true,
        status:         true,
        totalAudience:  true,
        totalSent:      true,
        totalFailed:    true,
        totalResponded: true,
        totalConverted: true,
        totalRevenue:   true,
        scheduledAt:    true,
        scheduleConfig: true,
        createdAt:      true,
        sentAt:         true,
      },
    });

    // For SENDING campaigns the denormalized totalSent/totalFailed may be stale
    // (updated only after the batch completes, or lost if the process timed out).
    // Compute live counts from CampaignExecution so the UI always shows real numbers.
    const sendingIds = campaigns
      .filter((c) => c.status === "SENDING")
      .map((c) => c.id);

    const liveCounts: Record<string, { sent: number; failed: number; pending: number }> = {};

    if (sendingIds.length > 0) {
      const execGroups = await prisma.campaignExecution.groupBy({
        by:    ["campaignId", "status"],
        where: { campaignId: { in: sendingIds } },
        _count: { id: true },
      });
      for (const g of execGroups) {
        if (!liveCounts[g.campaignId]) {
          liveCounts[g.campaignId] = { sent: 0, failed: 0, pending: 0 };
        }
        const s = liveCounts[g.campaignId]!;
        if (["SENT", "DELIVERED", "READ"].includes(g.status)) s.sent   += g._count.id;
        else if (g.status === "FAILED")                        s.failed += g._count.id;
        else if (g.status === "PENDING")                       s.pending += g._count.id;
      }
    }

    const enriched = campaigns.map((c) => {
      const live = liveCounts[c.id];
      if (!live) return { ...c, pendingCount: 0 };
      return {
        ...c,
        // Prefer live counts — they reflect the actual execution state
        totalSent:   Math.max(c.totalSent,   live.sent),
        totalFailed: Math.max(c.totalFailed, live.failed),
        pendingCount: live.pending,
      };
    });

    // Batch-compute failure breakdowns for campaigns that have failures.
    // Grouped at the DB level — one round-trip regardless of campaign count.
    const failedCampaignIds = enriched.filter((c) => c.totalFailed > 0).map((c) => c.id);
    const failureBreakdowns: Record<string, Record<string, number>> = {};

    if (failedCampaignIds.length > 0) {
      const failGroups = await prisma.campaignExecution.groupBy({
        by:    ["campaignId", "failedReason"],
        where: { campaignId: { in: failedCampaignIds }, status: "FAILED" },
        _count: { id: true },
      });
      for (const g of failGroups) {
        if (!failureBreakdowns[g.campaignId]) failureBreakdowns[g.campaignId] = {};
        const reason = g.failedReason ?? "BLOCKED";
        failureBreakdowns[g.campaignId]![reason] =
          (failureBreakdowns[g.campaignId]![reason] ?? 0) + g._count.id;
      }
    }

    const withBreakdowns = enriched.map((c) => ({
      ...c,
      failureBreakdown: failureBreakdowns[c.id] ?? null,
    }));

    return ok(withBreakdowns);
  } catch (err) {
    console.error("[GET /api/crm/campaigns]", err);
    return serverError();
  }
}

// ─── POST — create campaign ────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const body = await req.json() as {
      name?:            string;
      templateId?:      string;
      targetSegment?:   string;
      messageTemplate?: string;
      objective?:       string;
      channel?:         string;
      scheduledAt?:     string | null;
      scheduleConfig?:  Record<string, unknown> | null;
      audienceConfig?:  Record<string, unknown> | null;
      couponCode?:      string | null;
      promotionId?:     string | null;
    };

    if (!body.name?.trim()) {
      return badRequest("name é obrigatório");
    }
    if (!body.targetSegment?.trim() && !body.templateId?.trim()) {
      return badRequest("targetSegment ou templateId é obrigatório");
    }
    if (!body.messageTemplate?.trim()) {
      return badRequest("messageTemplate é obrigatório");
    }

    const result = await CrmCampaignService.create(ctx.restaurantId, {
      name:            body.name.trim(),
      templateId:      body.templateId?.trim(),
      targetSegment:   body.targetSegment?.trim() ?? "",
      messageTemplate: body.messageTemplate.trim(),
      objective:       body.objective?.trim(),
      channel:         body.channel ?? "WHATSAPP",
      scheduledAt:     body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      scheduleConfig:  body.scheduleConfig ?? undefined,
      audienceConfig:  body.audienceConfig ?? undefined,
      couponCode:      body.couponCode?.trim() || undefined,
      promotionId:     body.promotionId?.trim() || undefined,
    });

    return ok(result, 201);
  } catch (err) {
    console.error("[POST /api/crm/campaigns]", err);
    return serverError();
  }
}
