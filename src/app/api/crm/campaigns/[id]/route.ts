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
        message:       true,
        scheduledAt:   true,
        scheduleConfig: true,
        audienceConfig: true,
        totalAudience:  true,
        totalRead:      true,
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
      select: { id: true, restaurantId: true, status: true, scheduleConfig: true },
    });

    if (!campaign || campaign.restaurantId !== ctx.restaurantId) {
      return notFound("Campaign not found");
    }

    const body = await req.json() as {
      action?:          "pause" | "resume" | "cancel" | "reactivate";
      name?:            string;
      message?:         string;
      targetSegment?:   string;
      scheduledAt?:     string | null;
      sendWindowStart?: string | null;
      sendWindowEnd?:   string | null;
      scheduleConfig?:  Record<string, unknown> | null;
    };

    // ── lifecycle actions (pause / resume / cancel / reactivate) ──
    if (body.action) {
      const currentStatus = campaign.status as string;

      // reactivate: restore a COMPLETED recurring campaign back to ACTIVE.
      // Needed to recover campaigns stuck COMPLETED by the premature-exhaustion bug.
      if (body.action === "reactivate") {
        if (currentStatus === "SENDING") {
          // Recover one-shot campaign stuck in SENDING (server crashed mid-send).
          // Reset to SCHEDULED so it can be re-sent from the UI.
          const updated = await prisma.campaign.update({
            where: { id: params.id },
            data:  { status: "SCHEDULED" as never },
            select: { id: true, status: true },
          });
          return ok(updated);
        }

        if (currentStatus !== "COMPLETED") {
          return badRequest("Apenas campanhas COMPLETED ou SENDING podem ser reativadas");
        }
        const cfg = campaign.scheduleConfig as { mode?: string } | null;
        if (!cfg || cfg.mode !== "RECURRING") {
          return badRequest("Apenas campanhas recorrentes podem ser reativadas");
        }
        const updated = await prisma.campaign.update({
          where: { id: params.id },
          data:  { status: "ACTIVE" as never },
          select: { id: true, status: true },
        });
        return ok(updated);
      }

      const TERMINAL = ["SENT", "COMPLETED", "CANCELLED"];
      if (TERMINAL.includes(currentStatus)) {
        return badRequest("Campanha já finalizada — não pode ser modificada");
      }

      let newStatus: string;
      if (body.action === "pause") {
        if (!["ACTIVE", "SCHEDULED"].includes(currentStatus)) {
          return badRequest("Apenas campanhas ativas ou agendadas podem ser pausadas");
        }
        newStatus = "PAUSED";
      } else if (body.action === "resume") {
        if (currentStatus !== "PAUSED") {
          return badRequest("Apenas campanhas pausadas podem ser retomadas");
        }
        newStatus = "ACTIVE";
      } else {
        // cancel
        newStatus = "CANCELLED";
      }

      const updated = await prisma.campaign.update({
        where: { id: params.id },
        data:  { status: newStatus as never },
        select: { id: true, status: true },
      });
      return ok(updated);
    }

    // ── edit campaign fields ──────────────────────────────────────
    // name/message/scheduleConfig: allowed for any non-terminal status.
    // targetSegment/scheduledAt: only for DRAFT or SCHEDULED (changing
    // audience on a live campaign risks duplicate sends).
    const TERMINAL = ["SENT", "COMPLETED", "CANCELLED"];
    if (TERMINAL.includes(campaign.status)) {
      return badRequest("Campanha finalizada — não pode ser editada");
    }

    const isDraftOrScheduled = ["DRAFT", "SCHEDULED"].includes(campaign.status);
    const updateData: Record<string, unknown> = {};

    if (body.name?.trim())    updateData.name    = body.name.trim();
    if (body.message?.trim()) updateData.message = body.message.trim();

    // Merge only safe schedule subfields; preserve mode/endCondition/etc.
    if (body.scheduleConfig !== undefined && body.scheduleConfig !== null) {
      const existing = (campaign.scheduleConfig as Record<string, unknown> | null) ?? {};
      const patch    = body.scheduleConfig;
      updateData.scheduleConfig = {
        ...existing,
        ...(patch.weekdays   !== undefined ? { weekdays:   patch.weekdays   } : {}),
        ...(patch.timeWindow !== undefined ? { timeWindow: patch.timeWindow } : {}),
        ...(patch.dailyLimit !== undefined ? { dailyLimit: patch.dailyLimit } : {}),
      };
    }

    if (isDraftOrScheduled) {
      if (body.targetSegment?.trim()) updateData.targetSegment = body.targetSegment.trim();
      if (body.scheduledAt !== undefined) {
        updateData.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
        updateData.status      = body.scheduledAt ? "SCHEDULED" : "DRAFT";
      }
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest("Nenhum campo válido fornecido para atualização");
    }

    const updated = await prisma.campaign.update({
      where:  { id: params.id },
      data:   updateData as never,
      select: { id: true, status: true, scheduledAt: true, name: true, message: true, scheduleConfig: true },
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
