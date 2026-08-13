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
import { OrderService } from "@/services/order/OrderService";

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

  // Allow manual payment confirmation even if the kitchen already started preparing
  // (operator may have moved the card before the webhook arrived).
  if (!["PENDING", "AWAITING_PAYMENT", "PREPARING"].includes(order.status)) {
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

  // ── Passo 1: o dinheiro (atômico) ─────────────────────────────────────────
  // Registra o pagamento e a justificativa. NÃO mexe no status do pedido: quem
  // avança status é o passo 2, pelo ponto único.
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
      data: { notes: order.notes ? `${order.notes}\n${noteAppend}` : noteAppend },
    });
  });

  // ── Passo 2: o status, pelo MESMO caminho de sempre ───────────────────────
  //
  // ESTA É A CORREÇÃO DE 13/08/2026. Antes, esta rota escrevia
  // `status: "CONFIRMED"` direto no banco — e por isso NÃO enfileirava a
  // comanda nem emitia a NFC-e. Era o pior defeito do sistema: o lojista
  // socorria um Pix cujo aviso não chegou, o pedido sumia da fila de
  // pendentes, e a cozinha nunca ficava sabendo. Quem descobria era o cliente.
  //
  // `OrderService.updateStatus` é o ponto único: valida a transição, dispara
  // Saipos, roda as obrigações do pedido confirmado (comanda + nota) e avisa o
  // cliente. O pagamento já está PAID acima, então a trava anti-"pedido aceito
  // com Pix não pago" do updateStatus deixa a notificação passar — corretamente.
  //
  // PREPARING continua PREPARING (só o pagamento foi reconciliado): a comanda
  // desse pedido já saiu quando ele virou CONFIRMED.
  if (["PENDING", "AWAITING_PAYMENT"].includes(order.status)) {
    const advanced = await OrderService.updateStatus(restaurantId, orderId, { status: "CONFIRMED" });
    if (!advanced.ok) {
      // O dinheiro está registrado, o pedido não avançou. Isso se REPORTA — não
      // vira sucesso silencioso, que é exatamente o defeito que esta rota tinha.
      console.error("[confirm-manual-payment] pagamento registrado mas o pedido não avançou", {
        restaurantId, orderId, fromStatus: order.status, error: advanced.error,
      });
      return NextResponse.json(
        {
          error: "Pagamento registrado, mas o pedido não avançou para Confirmado. Verifique a comanda na tela de impressoras.",
          paymentRecorded: true,
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
