/**
 * GET /api/dashboard/cockpit
 *
 * Returns a CockpitReport: urgent alerts, recommended actions, health
 * indicators, and CRM opportunities for the owner command center (W4).
 *
 * Read-only. Tenant-scoped. No side effects.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { getCockpitReport } from "@/services/dashboard/DashboardCockpitService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const report = await getCockpitReport(ctx.restaurantId);
    return NextResponse.json({ data: report });
  } catch (err) {
    console.error("[GET /api/dashboard/cockpit]", err);
    return NextResponse.json({ error: "Erro ao gerar cockpit" }, { status: 500 });
  }
}
