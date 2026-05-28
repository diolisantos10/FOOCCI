/**
 * POST /api/atendimento/handoff/check-customer-inactivity
 *
 * Previously auto-returned conversations to AI after 5 min of customer silence.
 *
 * PRODUCT DECISION (2026-05-28): Human handoff is now persistent.
 * IA returns ONLY by explicit staff action via the Atendimento UI ("Devolver para IA").
 * Auto-resume on customer inactivity has been permanently removed.
 *
 * Endpoint kept for backwards compatibility — the /atendimento client polls it every ~60 s.
 * It is now a safe no-op that reports how many conversations are in human mode.
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

    const { restaurantId } = ctx;

    const checked = await prisma.conversation.count({
      where: {
        restaurantId,
        aiEnabled: false,
        status: { in: [ConversationStatus.HUMAN, ConversationStatus.HUMANO_ASSUMIU] },
        channel: "WHATSAPP",
      },
    });

    // Human handoff is persistent; IA returns only by explicit staff action.
    return ok({ checked, timedOut: [] });
  } catch (err) {
    console.error("[POST /api/atendimento/handoff/check-customer-inactivity]", err);
    return serverError();
  }
}
