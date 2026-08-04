/**
 * POST /api/help/escalate
 * "Falar com a FOOD" — last resort. Abre um CHAMADO numerado (com evidência),
 * avisa o time por e-mail e vira a conversa para HUMAN. Tenant-scoped.
 * Body opcional: { reason } — por que o agente não resolveu.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { HelpThreadService } from "@/services/help/HelpThreadService";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : undefined;

    const result = await HelpThreadService.escalate(ctx.restaurantId, ctx.userId, reason);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/help/escalate]", err);
    return serverError();
  }
}
