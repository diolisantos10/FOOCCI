/**
 * PUT /api/crm/relationship/tier-coupon — set (or clear) the coupon a tier earns.
 *
 * Writes to the "Mimo mensal por nível" campaign behind the scenes, so the owner
 * configures tier rewards straight from the Programa panel. { coupon: null } clears.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { RelationshipProgramService } from "@/services/crm/RelationshipProgramService";

const couponSchema = z.object({
  type:         z.enum(["PERCENTAGE", "FIXED", "CUSTOM", "FREE_SHIPPING"]),
  value:        z.number().min(0).max(100000),
  description:  z.string().max(80).optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
}).refine(
  // A percentage discount can never exceed 100%. (UI already caps this; the API
  // must too, so a crafted request can't create a 500% coupon.)
  (c) => c.type !== "PERCENTAGE" || c.value <= 100,
  { message: "Desconto percentual não pode passar de 100%", path: ["value"] },
);

const bodySchema = z.object({
  tier:   z.enum(["PRATA", "OURO", "DIAMANTE"]),
  coupon: couponSchema.nullable(),
});

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
    const r = await RelationshipProgramService.setTierCoupon(ctx.restaurantId, parsed.data.tier, parsed.data.coupon);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ data: r });
  } catch (err) {
    console.error("[PUT /api/crm/relationship/tier-coupon]", err);
    return NextResponse.json({ error: "Erro ao salvar cupom do nível" }, { status: 500 });
  }
}
