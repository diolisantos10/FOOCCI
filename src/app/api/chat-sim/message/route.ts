/**
 * POST /api/chat-sim/message
 *
 * Sends one user message to the sandboxed chat session and returns
 * the AI's text response, the tool calls it made, and the current cart state.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, badRequest, notFound, serverError } from "@/lib/api-response";
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
    /*
      Mesmo portão do encerramento. Sem ele, o restaurante A mandava mensagem para
      dentro de uma conversa REAL do restaurante B usando o `sessionId` dele: a
      mensagem entrava como INBOUND, o operador do B via no painel de atendimento
      como se o cliente tivesse escrito, e a chamada de IA saía na conta.
      `runTurn` recebia `restaurantId` do contexto e nunca conferia que a conversa
      era dele — parecia escopado e não era.
    */
    const recusa = await ChatSimService.checkSession({
      restaurantId: ctx.restaurantId,
      sessionId,
      customerId,
    });
    if (recusa) {
      console.warn(`[POST /api/chat-sim/message] recusado (${recusa}) — restaurante ${ctx.restaurantId}`);
      return notFound("Sessão de simulação não encontrada.");
    }

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
