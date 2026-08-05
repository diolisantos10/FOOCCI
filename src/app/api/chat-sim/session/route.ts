/**
 * /api/chat-sim/session
 *
 * POST  — create a sandboxed chat session (temp Customer + Conversation in DB)
 * DELETE — delete the session and all its temp records
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, badRequest, notFound, serverError } from "@/lib/api-response";
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
    /*
      O `restaurantId` vem do CONTEXTO autenticado, nunca do corpo — se viesse do
      corpo a trava seria decorativa, porque quem escolhe o alvo escolheria também
      o escopo. Este era o P0: `customerId` do corpo ia direto para o `delete`.
    */
    const r = await ChatSimService.deleteSession({
      restaurantId: ctx.restaurantId,
      sessionId,
      customerId,
    });

    if (r.reason) {
      // Mesmo texto para "não existe" e "não é simulação": a resposta não conta
      // ao chamador se o id existe em outro restaurante.
      console.warn(`[DELETE /api/chat-sim/session] recusado (${r.reason}) — restaurante ${ctx.restaurantId}`);
      return notFound("Sessão de simulação não encontrada.");
    }
    return ok({ deleted: r.deleted });
  } catch (err) {
    console.error("[DELETE /api/chat-sim/session]", err);
    return serverError();
  }
}
