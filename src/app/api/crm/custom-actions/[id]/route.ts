import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { ok, notFound, unauthorized, serverError } from "@/lib/api-response";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { id } = await params;

    const row = await prisma.cRMCustomAction.findUnique({
      where: { id },
      select: { id: true, restaurantId: true },
    });

    if (!row || row.restaurantId !== ctx.restaurantId) {
      return notFound("Modelo não encontrado");
    }

    await prisma.cRMCustomAction.delete({ where: { id } });

    return ok({ deleted: true });
  } catch (err) {
    console.error("[DELETE /api/crm/custom-actions/[id]]", err);
    return serverError();
  }
}
