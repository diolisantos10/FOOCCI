/**
 * POST /api/integrations/saipos/mark-manual
 *
 * Marks an order as manually registered in Saipos (fallback when API auth is blocked).
 * Does NOT call the Saipos API. Updates saiposStatus only.
 *
 * Access: authenticated session — OWNER or MANAGER role.
 * Body:   { orderId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  orderId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") {
    return NextResponse.json({ error: "Permissão insuficiente — requer OWNER ou MANAGER." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "orderId é obrigatório." }, { status: 422 });
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, restaurantId: true, saiposSentAt: true },
  });

  if (!order || order.restaurantId !== ctx.restaurantId) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  }

  if (order.saiposSentAt) {
    return NextResponse.json(
      { success: false, message: "Pedido já foi enviado à Saipos via API com sucesso." },
      { status: 409 }
    );
  }

  await prisma.order.update({
    where: { id: parsed.data.orderId },
    data: {
      saiposStatus:        "MANUALLY_REGISTERED",
      saiposError:         "Pedido lançado manualmente no Saipos.",
      saiposLastAttemptAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    message: "Pedido marcado como lançado manualmente na Saipos.",
  });
}
