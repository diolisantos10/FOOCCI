import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

// DELETE /api/crm/import/mapping-templates/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const template = await prisma.importMappingTemplate.findFirst({
    where: { id: params.id, restaurantId: ctx.restaurantId },
    select: { id: true },
  });

  if (!template) {
    return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
  }

  await prisma.importMappingTemplate.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
