/**
 * GET /api/crm/automations — as automações do restaurante.
 *
 * Duas plateias: o lojista (tenant) na tela de Promoções, e o admin
 * (`?restaurantId=…`) na escada do agente, onde ficam os interruptores.
 */

import { NextRequest } from "next/server";
import { resolverEscopoDoAgente } from "@/lib/agent-admin-scope";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { CRMService } from "@/services/crm/CRMService";

export async function GET(req: NextRequest) {
  try {
    const escopo = resolverEscopoDoAgente(req, req.nextUrl.searchParams.get("restaurantId"));
    if (!escopo) return unauthorized();

    const result = await CRMService.getAutomations(escopo.restaurantId);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/crm/automations]", err);
    return serverError();
  }
}
