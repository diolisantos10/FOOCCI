/**
 * POST /api/atendimento/handoff/check-timeouts
 *
 * PRODUCT DECISION (2026-05-28): Human handoff is PERSISTENT. The AI never
 * auto-returns; IA returns ONLY by explicit staff action ("Devolver para IA").
 * This endpoint does NOT change that — it performs no mutation.
 *
 * What it does now (alert-only, added 2026-06-22): it reports the conversations
 * where the customer's last message has gone unanswered by a human for at least
 * WHATSAPP_HANDOFF_ALERT_MINUTES (default 10). The standard handoff alarm goes
 * silent once a conversation is assumed/acknowledged, so this re-surfaces the
 * "assumed but never actually answered" dropped-ball case to the Atendimento UI.
 *
 * The /atendimento client polls this every ~60 s and raises a visible/audible
 * alert for the returned `overdue` list. `timedOut` is kept as an empty array for
 * backwards compatibility (no auto-return ever happens here).
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { ConversationStatus, ConversationType } from "@prisma/client";
import { selectOverdueHandoffs } from "@/lib/handoff-overdue";

const DEFAULT_ALERT_MINUTES = 10;
const RECENCY_CAP_MS = 24 * 60 * 60 * 1000; // ignore ancient/abandoned threads

function alertMinutes(): number {
  const raw = Number(process.env.WHATSAPP_HANDOFF_ALERT_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ALERT_MINUTES;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { restaurantId } = ctx;
    const now = new Date();
    const thresholdMinutes = alertMinutes();
    const thresholdMs = thresholdMinutes * 60_000;

    // Candidates: WhatsApp customer conversations in human mode that have been idle
    // for at least the threshold (and not ancient). Staff/supplier locks excluded.
    const candidates = await prisma.conversation.findMany({
      where: {
        restaurantId,
        channel:          "WHATSAPP",
        aiLocked:         false,
        conversationType: ConversationType.CUSTOMER,
        status:           { in: [ConversationStatus.HUMAN, ConversationStatus.HUMANO_ASSUMIU] },
        lastMessageAt: {
          lte: new Date(now.getTime() - thresholdMs),
          gte: new Date(now.getTime() - RECENCY_CAP_MS),
        },
      },
      select: {
        id:                true,
        customerName:      true,
        lastMessageAt:     true,
        handoffAlarmAckAt: true,
        customer:          { select: { name: true } },
        messages: {
          orderBy: { sentAt: "desc" },
          take:    1,
          select:  { direction: true, senderType: true },
        },
      },
      orderBy: { lastMessageAt: "asc" },
      take: 200,
    });

    const overdue = selectOverdueHandoffs(
      candidates.map((c) => ({
        id:                c.id,
        customerName:      c.customerName ?? c.customer?.name ?? null,
        lastMessageAt:     c.lastMessageAt,
        lastDirection:     c.messages[0]?.direction ?? null,
        lastSenderType:    c.messages[0]?.senderType ?? null,
        handoffAlarmAckAt: c.handoffAlarmAckAt,
      })),
      now,
      thresholdMs,
    );

    // No mutation — alert only. `timedOut` stays empty (no auto-return).
    return ok({ checked: candidates.length, thresholdMinutes, overdue, timedOut: [] });
  } catch (err) {
    console.error("[POST /api/atendimento/handoff/check-timeouts]", err);
    return serverError();
  }
}
