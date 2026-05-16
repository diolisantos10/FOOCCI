/**
 * GET /api/evolution/webhook-log
 *
 * OWNER-only. Returns the last 20 Evolution webhook events received for
 * the current restaurant's instance. Used to diagnose whether Evolution is
 * sending webhooks and whether they are accepted or rejected.
 *
 * Never exposes: message content, phone numbers (only masked), secrets.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { unauthorized, forbidden, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Log restrito ao proprietário.");

    const events = await prisma.evolutionWebhookEventLog.findMany({
      where:   { restaurantId: ctx.restaurantId },
      orderBy: { createdAt: "desc" },
      take:    20,
      select: {
        id:                  true,
        instanceName:        true,
        eventName:           true,
        normalizedEventName: true,
        accepted:            true,
        ignored:             true,
        error:               true,
        bodyKeys:            true,
        dataKeys:            true,
        messageId:           true,
        remoteJidMasked:     true,
        direction:           true,
        createdAt:           true,
      },
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const inboundToday = await prisma.evolutionWebhookEventLog.count({
      where: {
        restaurantId: ctx.restaurantId,
        direction:    "INBOUND",
        accepted:     true,
        createdAt:    { gte: todayStart },
      },
    });

    const lastAccepted = events.find((e) => e.accepted);

    return NextResponse.json({
      success: true,
      summary: {
        totalEvents:    events.length,
        inboundToday,
        lastEventAt:    events[0]?.createdAt ?? null,
        lastAcceptedAt: lastAccepted?.createdAt ?? null,
        lastError:      events.find((e) => e.error)?.error ?? null,
      },
      events,
    });
  } catch (err) {
    console.error("[GET /api/evolution/webhook-log]", err);
    return serverError();
  }
}
