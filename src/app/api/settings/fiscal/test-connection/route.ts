import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { testFiscalConnectionSchema } from "@/validators/fiscal";
import { FiscalConfigService } from "@/services/fiscal/FiscalConfigService";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
    const parsed = testFiscalConnectionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());
    const result = await FiscalConfigService.testConnection(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);
    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/settings/fiscal/test-connection]", err);
    return serverError();
  }
}
