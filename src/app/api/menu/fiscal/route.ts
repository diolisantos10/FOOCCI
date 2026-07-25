/**
 * PATCH /api/menu/fiscal — edição em lote dos campos fiscais do cardápio.
 * Body: { categories?: [{ id, ncm?, cest?, cfop?, csosn?, cst?, origem?, unidade? }],
 *         items?:      [{ id, ...fiscais, icmsAliquota? }] }
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { updateMenuFiscalSchema } from "@/validators/fiscal";
import { MenuFiscalService } from "@/services/fiscal/MenuFiscalService";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";

export async function PATCH(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
    const parsed = updateMenuFiscalSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());
    const result = await MenuFiscalService.update(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/menu/fiscal]", err);
    return serverError();
  }
}
