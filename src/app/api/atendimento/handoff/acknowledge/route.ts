/**
 * POST /api/atendimento/handoff/acknowledge
 *
 * Persists an operator's "Estou ciente" / "Silenciar" acknowledgement of the
 * human-attention alarm for a batch of conversations. Body: { ids: string[] }.
 *
 * WHY THIS EXISTS: the alarm is app-wide (GlobalAlertEngine runs on every page
 * and every device). Acknowledging used to live only in AtendimentoClient's
 * React state, so the moment the operator moved to Início / CRM / another device,
 * the background poll re-rang the very same conversation with no way to stop it.
 * Writing the acknowledgement to Conversation.handoffAlarmAckAt makes the silence
 * stick EVERYWHERE. A fresh escalation (markConversationNeedsHuman) clears the
 * timestamp, so a genuinely new human request rings again.
 *
 * Never resolves the conversation, never re-enables the AI, never removes the
 * handoff — it only silences the alarm. Any logged-in staff member may ack.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return badRequest("ids inválidos");

    // Tenant-scoped: only ever touches conversations of the caller's restaurant.
    const result = await prisma.conversation.updateMany({
      where: { restaurantId: ctx.restaurantId, id: { in: parsed.data.ids } },
      data:  { handoffAlarmAckAt: new Date() },
    });

    return ok({ acknowledged: result.count });
  } catch (err) {
    console.error("[POST /api/atendimento/handoff/acknowledge]", err);
    return serverError();
  }
}
