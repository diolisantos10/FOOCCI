/**
 * GET  /api/conversations/[id]/messages  — cursor-based message history
 * POST /api/conversations/[id]/messages  — send outbound message
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { MessageService } from "@/services/conversation/MessageService";
import { sendMessageSchema, messageListQuerySchema } from "@/validators/conversation";
import { ok, created, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const parsed = messageListQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries())
    );
    if (!parsed.success) return badRequest("Invalid query", parsed.error.flatten());

    const result = await MessageService.list(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return serverError(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/conversations/[id]/messages]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await MessageService.sendOutbound(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      if (result.status === 400) return badRequest(result.error);
      if (result.status === 502) return serverError(result.error);
      return serverError(result.error);
    }

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/conversations/[id]/messages]", err);
    return serverError();
  }
}
