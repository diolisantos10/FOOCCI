/**
 * GET /api/crm/relationship/overview
 * Returns tier stats and "close to next tier" customers.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { RelationshipProgramService } from "@/services/crm/RelationshipProgramService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await RelationshipProgramService.getOverview(ctx.restaurantId);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GET /api/crm/relationship/overview]", err);
    return NextResponse.json({ error: "Erro ao carregar programa" }, { status: 500 });
  }
}
