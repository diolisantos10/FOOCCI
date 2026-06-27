/**
 * GET /api/crm/conversions
 *
 * CRM social proof — proven conversions (campaign messages that led to a real
 * order). Read-only, tenant-scoped. Powers the "Conversões" tab in the CRM.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";
import { CRMService } from "@/services/crm/CRMService";

export async function GET(req: NextRequest) {
  let restaurantId: string;
  try { restaurantId = getTenantId(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

  const result = await CRMService.getConversions(restaurantId, limit);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }
  return NextResponse.json({ data: result.data });
}
