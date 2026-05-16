/**
 * GET /api/evolution/webhook-log
 *
 * OWNER-only. Returns the last 20 Evolution webhook events received for
 * the current restaurant's instance. Used to diagnose whether Evolution is
 * sending webhooks and whether they are accepted or rejected.
 *
 * self_test events (written by the webhook-self-test endpoint) are tracked
 * separately so they don't inflate "Mensagens hoje" or "último evento real".
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

    // Real inbound today — exclude self_test synthetic writes
    const inboundToday = await prisma.evolutionWebhookEventLog.count({
      where: {
        restaurantId: ctx.restaurantId,
        direction:    "INBOUND",
        accepted:     true,
        eventName:    { not: "self_test" },
        createdAt:    { gte: todayStart },
      },
    });

    // Separate real vs self_test for summary fields
    const realEvents     = events.filter((e) => e.eventName !== "self_test");
    const selfTestEvents = events.filter((e) => e.eventName === "self_test");

    const lastReal     = realEvents[0]     ?? null;
    const lastSelfTest = selfTestEvents[0] ?? null;
    const lastAccepted = realEvents.find((e) => e.accepted) ?? null;

    // Count accepted real events in log window
    const acceptedRealEvents = realEvents.filter((e) => e.accepted && !e.ignored).length;

    return NextResponse.json({
      success: true,
      summary: {
        totalEvents:       events.length,
        realEvents:        realEvents.length,
        selfTestEvents:    selfTestEvents.length,
        inboundToday,
        acceptedRealEvents,
        lastEventAt:       events[0]?.createdAt     ?? null,  // any event (backwards compat)
        lastRealEventAt:   lastReal?.createdAt       ?? null,
        lastSelfTestAt:    lastSelfTest?.createdAt   ?? null,
        lastAcceptedAt:    lastAccepted?.createdAt   ?? null,
        lastError:         realEvents.find((e) => e.error)?.error ?? null,
      },
      events,
    });
  } catch (err) {
    console.error("[GET /api/evolution/webhook-log]", err);
    return serverError();
  }
}
