/**
 * POST /api/whatsapp/simulate/message
 *
 * Dashboard-level WhatsApp conversation simulator.
 * Uses the authenticated tenant's restaurant — no slug input required.
 *
 * HARD INVARIANTS — never violated regardless of input:
 *   ✗ Does NOT send real WhatsApp messages.
 *   ✗ Does NOT create real orders.
 *   ✗ Does NOT generate real Pix.
 *   ✓ allowSideEffects is ALWAYS false.
 *   ✓ mode is ALWAYS DRY_RUN_ONLY.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { processCustomerMessage, newTransientSession } from "@/services/whatsapp/ordering/WhatsAppTextOrderService";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import type { WaPersistedSession } from "@/services/whatsapp/ordering/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  messageText:    z.string().min(1).max(2000),
  currentSession: z.record(z.unknown()).nullish(),
  resetSession:   z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return badRequest(parsed.error.message);

    const { messageText, currentSession, resetSession } = parsed.data;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: ctx.restaurantId },
      select: { slug: true },
    });
    if (!restaurant) return badRequest("Restaurante não encontrado.");

    const session: WaPersistedSession | null =
      !resetSession && currentSession
        ? (currentSession as unknown as WaPersistedSession)
        : null;

    const result = await processCustomerMessage({
      restaurantId:     ctx.restaurantId,
      restaurantSlug:   restaurant.slug,
      phone:            "+5500000000000",
      messageText,
      mode:             "DRY_RUN_ONLY",
      allowSideEffects: false,
      currentSession:   session,
    });

    return ok({
      reply:    result.suggestedReply,
      stage:    result.stage,
      intent:   result.intent,
      handoff:  result.handoff,
      session:  result.session,
      draft:    result.draft,
    });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "erro no simulador");
  }
}
