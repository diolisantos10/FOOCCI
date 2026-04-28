/**
 * /api/chat-sim/session
 *
 * POST  — create a sandboxed chat session (temp Customer + Conversation in DB)
 * DELETE — delete the session and all its temp records
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, badRequest, serverError } from "@/lib/api-response";
import { ChatSimService } from "@/services/ai/ChatSimService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const session = await ChatSimService.createSession(ctx.restaurantId);
    return ok(session, 201);
  } catch (err) {
    console.error("[POST /api/chat-sim/session]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  let body: { sessionId: string; customerId: string };
  try { body = await req.json(); } catch { return badRequest("Invalid JSON."); }

  const { sessionId, customerId } = body;
  if (!sessionId || !customerId) return badRequest("sessionId and customerId required.");

  try {
    await ChatSimService.deleteSession(sessionId, customerId);
    return ok({ deleted: true });
  } catch (err) {
    console.error("[DELETE /api/chat-sim/session]", err);
    return serverError();
  }
}
