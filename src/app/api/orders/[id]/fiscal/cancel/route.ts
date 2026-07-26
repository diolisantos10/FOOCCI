/**
 * POST /api/orders/[id]/fiscal/cancel — cancel an authorized NFC-e.
 * Body: { justificativa: string }  (SEFAZ exige ≥ 15 caracteres)
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { FiscalEmissionService } from "@/services/fiscal/FiscalEmissionService";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
    const body = (await req.json().catch(() => ({}))) as { justificativa?: string };
    const justificativa = (body.justificativa ?? "").trim();
    if (justificativa.length < 15) {
      return badRequest("A justificativa precisa ter ao menos 15 caracteres.");
    }
    const result = await FiscalEmissionService.cancelForOrder(ctx.restaurantId, params.id, justificativa);
    return ok(result);
  } catch (err) {
    console.error("[POST /api/orders/[id]/fiscal/cancel]", err);
    return serverError();
  }
}
