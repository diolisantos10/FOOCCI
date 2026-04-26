import { NextRequest, NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";
import { CRMService } from "@/services/crm/CRMService";

export async function GET(req: NextRequest) {
  let restaurantId: string;
  try { restaurantId = getTenantId(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  const dateRange =
    from && to ? { from: new Date(from), to: new Date(to) } : undefined;

  const result = await CRMService.getOverviewStats(restaurantId, dateRange);
  if (!result.ok) return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  return NextResponse.json({ data: result.data });
}
