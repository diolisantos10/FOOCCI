/**
 * GET  /api/crm/relationship/benefits — list benefits for the restaurant
 * POST /api/crm/relationship/benefits — create a new benefit
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { RelationshipProgramService } from "@/services/crm/RelationshipProgramService";

const VALID_TIERS = ["BRONZE", "PRATA", "OURO", "DIAMANTE"] as const;

const createSchema = z.object({
  tier:        z.enum(VALID_TIERS),
  title:       z.string().min(1).max(120),
  description: z.string().max(300).optional(),
});

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await RelationshipProgramService.getBenefits(ctx.restaurantId);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GET /api/crm/relationship/benefits]", err);
    return NextResponse.json({ error: "Erro ao carregar benefícios" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const data = await RelationshipProgramService.createBenefit(ctx.restaurantId, parsed.data);
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/crm/relationship/benefits]", err);
    return NextResponse.json({ error: "Erro ao criar benefício" }, { status: 500 });
  }
}
