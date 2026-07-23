/**
 * PATCH  /api/crm/relationship/benefits/[id] — update title/description/isActive
 * DELETE /api/crm/relationship/benefits/[id] — delete benefit
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { RelationshipProgramService } from "@/services/crm/RelationshipProgramService";

const patchSchema = z.object({
  title:          z.string().min(1).max(120).optional(),
  description:    z.string().max(300).nullable().optional(),
  isActive:       z.boolean().optional(),
  isPhysicalGift: z.boolean().optional(),
  stockTotal:     z.number().int().min(0).nullable().optional(),
  /** When set, registers deliveries of the physical gift (decrements stock). */
  deliverQty:     z.number().int().min(1).max(1000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { deliverQty, ...fields } = parsed.data;
    // Registering a delivery decrements the physical stock (guarded server-side).
    if (deliverQty) {
      const r = await RelationshipProgramService.registerGiftDelivery(params.id, ctx.restaurantId, deliverQty);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    }
    if (Object.keys(fields).length > 0) {
      await RelationshipProgramService.updateBenefit(params.id, ctx.restaurantId, fields);
    }
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[PATCH /api/crm/relationship/benefits/:id]", err);
    return NextResponse.json({ error: "Erro ao atualizar benefício" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await RelationshipProgramService.deleteBenefit(params.id, ctx.restaurantId);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[DELETE /api/crm/relationship/benefits/:id]", err);
    return NextResponse.json({ error: "Erro ao excluir benefício" }, { status: 500 });
  }
}
