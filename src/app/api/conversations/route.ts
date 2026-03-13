/**
 * GET /api/conversations
 *
 * Paginated conversation list.
 * Query params: page, limit, status, assignedTo, search
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ConversationService } from "@/services/conversation/ConversationService";
import { conversationListQuerySchema } from "@/validators/conversation";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const parsed = conversationListQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries())
    );
    if (!parsed.success) return badRequest("Invalid query", parsed.error.flatten());

    const result = await ConversationService.list(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/conversations]", err);
    return serverError();
  }
}
