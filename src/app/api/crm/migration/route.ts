/**
 * GET /api/crm/migration?days=7
 *
 * Base-migration panel data: how customers moved between relationship bases
 * (QUENTE/MORNO/FRIO/PERDIDO) over the last N days, plus exclusions. Read-only,
 * tenant-scoped. Reconstructed live — see CrmBaseMigrationService.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { CrmBaseMigrationService } from "@/services/crm/CrmBaseMigrationService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const raw  = Number(req.nextUrl.searchParams.get("days"));
    const days = Number.isFinite(raw) && raw > 0 ? Math.min(90, Math.floor(raw)) : 7;

    const data = await CrmBaseMigrationService.getMigration(ctx.restaurantId, { days });
    return ok(data);
  } catch (err) {
    console.error("[GET /api/crm/migration]", err);
    return serverError();
  }
}
