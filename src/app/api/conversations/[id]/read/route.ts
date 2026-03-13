/**
 * POST /api/conversations/[id]/read
 *
 * Resets the unread message counter for a conversation.
 * Called when an agent opens the conversation thread.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ConversationService } from "@/services/conversation/ConversationService";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await ConversationService.markRead(ctx.restaurantId, params.id);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return serverError(result.error);
    }

    return ok({ marked: true });
  } catch (err) {
    console.error("[POST /api/conversations/[id]/read]", err);
    return serverError();
  }
}
