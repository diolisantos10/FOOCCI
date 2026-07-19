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

    // Custom window: from/to as YYYY-MM-DD. `from` opens the day, `to` closes it
    // (23:59:59.999), so a same-day range still spans the whole day.
    const parseDay = (v: string | null, endOfDay: boolean): Date | undefined => {
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
      const d = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const from = parseDay(req.nextUrl.searchParams.get("from"), false);
    const to   = parseDay(req.nextUrl.searchParams.get("to"),   true);

    const data = await CrmBaseMigrationService.getMigration(
      ctx.restaurantId,
      from && to && from < to ? { from, to } : { days },
    );
    return ok(data);
  } catch (err) {
    console.error("[GET /api/crm/migration]", err);
    return serverError();
  }
}
