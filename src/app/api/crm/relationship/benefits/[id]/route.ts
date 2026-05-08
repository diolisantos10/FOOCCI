/**
 * PATCH  /api/crm/relationship/benefits/[id] — update title/description/isActive
 * DELETE /api/crm/relationship/benefits/[id] — delete benefit
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { RelationshipProgramService } from "@/services/crm/RelationshipProgramService";

const patchSchema = z.object({
  title:       z.string().min(1).max(120).optional(),
  description: z.string().max(300).nullable().optional(),
  isActive:    z.boolean().optional(),
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
    await RelationshipProgramService.updateBenefit(params.id, ctx.restaurantId, parsed.data);
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
