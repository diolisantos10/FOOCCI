/**
 * GET   /api/conversations/[id]  — fetch conversation + messages
 * PATCH /api/conversations/[id]  — apply action: assign | unassign | resolve | reopen
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ConversationService } from "@/services/conversation/ConversationService";
import { patchConversationSchema } from "@/validators/conversation";
import { ok, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await ConversationService.getById(ctx.restaurantId, params.id);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return serverError(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/conversations/[id]]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = patchConversationSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await ConversationService.applyAction(
      ctx.restaurantId,
      params.id,
      parsed.data
    );
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      if (result.status === 400) return badRequest(result.error);
      return serverError(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/conversations/[id]]", err);
    return serverError();
  }
}
