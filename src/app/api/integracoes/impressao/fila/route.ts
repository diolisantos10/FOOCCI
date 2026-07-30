/**
 * /api/integracoes/impressao/fila — o que a fila de impressão está fazendo.
 *
 * Existe porque o lojista era cego: quando a comanda não saía, não havia tela,
 * número nem erro em lugar nenhum — só o papel que não veio. Agora a fila é
 * visível, e o que precisa de gente aparece com o motivo escrito.
 *
 * GET  → contagem da fila + as comandas que esgotaram as tentativas.
 * POST → recoloca as travadas na fila (o "tentar de novo" da tela).
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { lerFila, reenfileirarMortos } from "@/services/print/PrintJobLease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  try {
    return ok(await lerFila(ctx.restaurantId));
  } catch (err) {
    console.error("[GET integracoes/impressao/fila]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER")
    return forbidden("Apenas o proprietário ou gerente pode reenviar comandas.");

  try {
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((i): i is string => typeof i === "string" && i.length > 0)
      : undefined;

    const reenfileiradas = await reenfileirarMortos(ctx.restaurantId, ids);
    return ok({ reenfileiradas, ...(await lerFila(ctx.restaurantId)) });
  } catch (err) {
    console.error("[POST integracoes/impressao/fila]", err);
    return serverError();
  }
}
