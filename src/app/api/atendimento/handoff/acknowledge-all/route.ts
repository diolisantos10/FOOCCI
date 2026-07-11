/**
 * POST /api/atendimento/handoff/acknowledge-all
 *
 * One-click "silence the human-attention alarm" for the WHOLE restaurant. Sets
 * handoffAlarmAckAt on every conversation that is currently driving the alarm
 * (unassumed HUMAN or assumed-but-overdue HUMANO_ASSUMIU, not Staff/locked, not
 * already acknowledged). This is what the app-wide "🔇 Silenciar alarme" button
 * calls, so the operator can stop the noise from ANY page and ANY device with a
 * single tap — no hunting for the conversation, no navigating to Atendimento.
 *
 * Silences only — never resolves, never re-enables the AI, never removes the
 * handoff. Conversations stay visible (red) in the inbox; a fresh escalation or
 * a new customer message re-arms the alarm.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { ConversationStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await prisma.conversation.updateMany({
      where: {
        restaurantId:      ctx.restaurantId,
        status:            { in: [ConversationStatus.HUMAN, ConversationStatus.HUMANO_ASSUMIU] },
        aiLocked:          false,
        handoffAlarmAckAt: null,
      },
      data: { handoffAlarmAckAt: new Date() },
    });

    return ok({ acknowledged: result.count });
  } catch (err) {
    console.error("[POST /api/atendimento/handoff/acknowledge-all]", err);
    return serverError();
  }
}
