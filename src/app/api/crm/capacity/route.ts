/**
 * GET /api/crm/capacity — CRM send-budget forecast for the restaurant:
 * caps + consumed + remaining, the distribution policy, and a balanced+priority
 * allocation forecast across active campaigns (forecast only; the real scheduler
 * is unchanged). Tenant-scoped, read-only.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { getCapacityForecast } from "@/services/crm/CrmCapacityService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const forecast = await getCapacityForecast(ctx.restaurantId);
    return ok(forecast);
  } catch (err) {
    console.error("[GET /api/crm/capacity]", err);
    return serverError();
  }
}
