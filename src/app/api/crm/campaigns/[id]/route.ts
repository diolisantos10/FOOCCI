/**
 * GET    /api/crm/campaigns/[id]  — campaign detail with recipients
 * PATCH  /api/crm/campaigns/[id]  — update draft (message, segment, schedule)
 * DELETE /api/crm/campaigns/[id]  — delete DRAFT or CANCELLED campaign
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, notFound, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const campaign = await prisma.campaign.findUnique({
      where:  { id: params.id },
      select: {
        id:            true,
        restaurantId:  true,
        name:          true,
        objective:     true,
        channel:       true,
        targetSegment: true,
        templateId:    true,
        status:        true,
        scheduledAt:   true,
        totalAudience:  true,
        totalSent:      true,
        totalFailed:    true,
        totalResponded: true,
        totalConverted: true,
        totalRevenue:   true,
        createdAt:      true,
        sentAt:         true,
        executions: {
          orderBy: { createdAt: "asc" },
          select: {
            id:               true,
            customerId:       true,
            customerName:     true,
            customerPhone:    true,
            messageText:      true,
            status:           true,
            sentAt:           true,
            failedReason:     true,
            converted:        true,
            convertedAt:      true,
            revenue:          true,
            convertedOrderId: true,
          },
        },
      },
    });

    if (!campaign || campaign.restaurantId !== ctx.restaurantId) {
      return notFound("Campaign not found");
    }

    return ok(campaign);
  } catch (err) {
    console.error("[GET /api/crm/campaigns/[id]]", err);
    return serverError();
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const campaign = await prisma.campaign.findUnique({
      where:  { id: params.id },
      select: { id: true, restaurantId: true, status: true },
    });

    if (!campaign || campaign.restaurantId !== ctx.restaurantId) {
      return notFound("Campaign not found");
    }

    if (!["DRAFT", "SCHEDULED"].includes(campaign.status)) {
      return badRequest("Apenas rascunhos e agendamentos podem ser editados");
    }

    const body = await req.json() as {
      name?:            string;
      message?:         string;
      targetSegment?:   string;
      scheduledAt?:     string | null;
      sendWindowStart?: string | null;
      sendWindowEnd?:   string | null;
    };

    const newStatus = body.scheduledAt ? "SCHEDULED" : "DRAFT";

    const updated = await prisma.campaign.update({
      where: { id: params.id },
      data: {
        ...(body.name?.trim()          ? { name: body.name.trim() }                          : {}),
        ...(body.targetSegment?.trim() ? { targetSegment: body.targetSegment.trim() }         : {}),
        ...(body.message?.trim()       ? { message: body.message.trim() }                     : {}),
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status:      newStatus,
      },
      select: { id: true, status: true, scheduledAt: true },
    });

    return ok(updated);
  } catch (err) {
    console.error("[PATCH /api/crm/campaigns/[id]]", err);
    return serverError();
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const campaign = await prisma.campaign.findUnique({
      where:  { id: params.id },
      select: { id: true, restaurantId: true, status: true },
    });

    if (!campaign || campaign.restaurantId !== ctx.restaurantId) {
      return notFound("Campaign not found");
    }

    if (!["DRAFT", "CANCELLED"].includes(campaign.status)) {
      return badRequest("Apenas rascunhos ou cancelados podem ser excluídos. Histórico de envios é mantido.");
    }

    await prisma.campaign.delete({ where: { id: params.id } });

    return ok({ deleted: true });
  } catch (err) {
    console.error("[DELETE /api/crm/campaigns/[id]]", err);
    return serverError();
  }
}
