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

    return ok(campaigns);
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
    });

    return ok(result, 201);
  } catch (err) {
    console.error("[POST /api/crm/campaigns]", err);
    return serverError();
  }
}
