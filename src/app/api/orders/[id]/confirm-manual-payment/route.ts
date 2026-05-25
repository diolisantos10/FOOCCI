/**
 * POST /api/orders/[id]/confirm-manual-payment
 *
 * Manually marks a Pix/online order as PAID and advances it to CONFIRMED.
 * Restricted to OWNER and MANAGER roles.
 * This is an operational escape hatch for when the Mercado Pago webhook
 * was not delivered; it is NOT a replacement for fixing webhook delivery.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { Decimal } from "@prisma/client/runtime/library";

const bodySchema = z.object({
  reason: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["OWNER", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json(
      { error: "Sem permissão. Apenas OWNER ou MANAGER pode confirmar pagamento manualmente." },
      { status: 403 }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Motivo é obrigatório" }, { status: 400 });
  }

  const { reason } = parsed.data;
  const { restaurantId } = ctx;
  const orderId = params.id;

  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { payment: true },
  });

  if (!order) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  if (!["PENDING", "AWAITING_PAYMENT"].includes(order.status)) {
    return NextResponse.json(
      { error: `Pedido está ${order.status} — confirmação manual não aplicável` },
      { status: 400 }
    );
  }

  // Idempotent: already PAID → return success without re-writing
  if (order.payment?.status === "PAID") {
    return NextResponse.json({ success: true, alreadyPaid: true });
  }

  const now = new Date();
  const stamp = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const noteAppend = `[${stamp} — Confirmação manual] ${reason}`;

  await prisma.$transaction(async (tx) => {
    if (order.payment) {
      await tx.payment.update({
        where: { orderId },
        data: { status: "PAID", paidAt: now },
      });
    } else {
      await tx.payment.create({
        data: {
          orderId,
          method: "PIX",
          status: "PAID",
          amount: new Decimal(Number(order.total)),
          paymentMode: "PAY_NOW",
          paidAt: now,
        },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "CONFIRMED",
        notes: order.notes ? `${order.notes}\n${noteAppend}` : noteAppend,
      },
    });
  });

  return NextResponse.json({ success: true });
}
