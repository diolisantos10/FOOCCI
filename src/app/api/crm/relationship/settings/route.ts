/**
 * GET  /api/crm/relationship/settings — fetch tier thresholds
 * PUT  /api/crm/relationship/settings — save tier thresholds
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { RelationshipProgramService } from "@/services/crm/RelationshipProgramService";

const bodySchema = z.object({
  programEnabled:             z.boolean(),
  classificationWindowMonths: z.number().int().min(0).max(12),
  silverMinSpend:   z.number().min(0),
  silverMinOrders:  z.number().int().min(0),
  goldMinSpend:     z.number().min(0),
  goldMinOrders:    z.number().int().min(0),
  diamondMinSpend:  z.number().min(0),
  diamondMinOrders: z.number().int().min(0),
});

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await RelationshipProgramService.getSettings(ctx.restaurantId);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GET /api/crm/relationship/settings]", err);
    return NextResponse.json({ error: "Erro ao carregar configurações" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const data = await RelationshipProgramService.saveSettings(ctx.restaurantId, parsed.data);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PUT /api/crm/relationship/settings]", err);
    return NextResponse.json({ error: "Erro ao salvar configurações" }, { status: 500 });
  }
}
