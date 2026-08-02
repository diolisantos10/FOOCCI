/**
 * POST /api/admin/crm/rebuild-metrics — resync a restaurant's CRM segments.
 *
 * WHY THIS EXISTS: `rebuildRestaurantCustomerMetrics` was written but no route ever
 * called it, so nothing could trigger it in production. The consequence was silent and
 * expensive — `audience-breakdown` on 2026-08-02 reported a restaurant whose STORED
 * segments said 0 PERDIDO / 0 FRIO / 0 MORNO while the LIVE query found 3.035 / 166 /
 * 57. Campaigns segment on the stored value, so 3.258 reachable customers were
 * invisible to every campaign — and it looked like a sending-limit problem.
 *
 * The operation recomputes each customer's counters from their real orders. It is
 * idempotent and corrective: running it twice yields the same result, and it can only
 * move stored values towards the truth.
 *
 * Admin-only. Long-running by nature (one pass per customer), so it reports how many
 * it processed rather than pretending to be instant.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, badRequest, serverError } from "@/lib/api-response";
import { CustomerMetricsSyncService } from "@/services/crm/CustomerMetricsSyncService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A full rebuild walks every customer; the default serverless window is not enough.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();

  let body: { restaurantId?: unknown };
  try {
    body = (await req.json()) as { restaurantId?: unknown };
  } catch {
    return badRequest("Corpo inválido — envie { restaurantId }.");
  }

  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId.trim() : "";
  // Scoped to ONE restaurant on purpose. A blind "rebuild everything" would be a long
  // write across every tenant with no way to judge the blast radius from the caller.
  if (!restaurantId) return badRequest("Informe o restaurantId.");

  try {
    const started = Date.now();
    const result = await CustomerMetricsSyncService.rebuildRestaurantCustomerMetrics(restaurantId);
    return ok({
      restaurantId,
      ...result,
      elapsedMs: Date.now() - started,
      hint: "Rode GET /api/admin/diagnostics/audience-breakdown para confirmar que o drift zerou.",
    });
  } catch (err) {
    console.error("[POST /api/admin/crm/rebuild-metrics]", err);
    return serverError("Falha ao recalcular as métricas.");
  }
}
