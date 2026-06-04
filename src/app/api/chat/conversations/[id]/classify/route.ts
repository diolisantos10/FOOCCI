/**
 * POST /api/chat/conversations/[id]/classify
 *
 * Classify a conversation as a customer or a non-customer context (staff,
 * supplier, partner, internal, other). Non-customer classifications apply a
 * PERMANENT AI lock (P0-A): the AI will never auto-reply and is not re-enabled
 * by any auto-return rule until an operator reclassifies it back to CUSTOMER.
 *
 * Body: { type: "CUSTOMER" | "STAFF" | "SUPPLIER" | "PARTNER" | "INTERNAL" | "OTHER_NON_CUSTOMER", reason?: string }
 *
 *  - type === CUSTOMER  → unlock + restore normal AI behavior
 *  - any other type     → lock + classify
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, badRequest, notFound, serverError } from "@/lib/api-response";
import { ConversationType } from "@prisma/client";
import {
  lockAiForConversation,
  unlockAiForConversation,
} from "@/services/conversation/ConversationAiPolicyService";

const VALID_TYPES = new Set<string>([
  "CUSTOMER", "STAFF", "SUPPLIER", "PARTNER", "INTERNAL", "OTHER_NON_CUSTOMER",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { type?: string; reason?: string };

    if (!body.type || !VALID_TYPES.has(body.type)) {
      return badRequest("Campo 'type' inválido");
    }
    const type = body.type as ConversationType;

    const result = type === ConversationType.CUSTOMER
      ? await unlockAiForConversation(ctx.restaurantId, id, ctx.userId)
      : await lockAiForConversation(ctx.restaurantId, id, type, body.reason ?? null, ctx.userId);

    if (!result.ok) return notFound(result.error ?? "Conversa não encontrada");

    return ok({
      id,
      conversationType: type,
      aiLocked: type !== ConversationType.CUSTOMER,
    });
  } catch (err) {
    console.error("[POST /api/chat/conversations/[id]/classify]", err);
    return serverError();
  }
}
