/**
 * POST /api/crm/relationship/recalculate
 * Recalculates Customer.tier for every non-guest customer in the restaurant
 * using the current TierSettings (or defaults if none configured).
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { RelationshipProgramService } from "@/services/crm/RelationshipProgramService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await RelationshipProgramService.recalculateTiers(ctx.restaurantId);
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[POST /api/crm/relationship/recalculate]", err);
    return NextResponse.json({ error: "Erro ao recalcular níveis" }, { status: 500 });
  }
}
