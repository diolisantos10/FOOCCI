/**
 * POST /api/chat-sim/message
 *
 * Sends one user message to the sandboxed chat session and returns
 * the AI's text response, the tool calls it made, and the current cart state.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, badRequest, serverError } from "@/lib/api-response";
import { ChatSimService } from "@/services/ai/ChatSimService";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  let body: { sessionId: string; customerId: string; message: string };
  try { body = await req.json(); } catch { return badRequest("Invalid JSON."); }

  const { sessionId, customerId, message } = body;
  if (!sessionId || !customerId || !message?.trim()) {
    return badRequest("sessionId, customerId, and message are required.");
  }

  try {
    const result = await ChatSimService.runTurn({
      conversationId: sessionId,
      restaurantId:   ctx.restaurantId,
      customerId,
      message:        message.trim(),
    });
    return ok(result);
  } catch (err) {
    console.error("[POST /api/chat-sim/message]", err);
    return serverError("Erro ao processar mensagem.");
  }
}
