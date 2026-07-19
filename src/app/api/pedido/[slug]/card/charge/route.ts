/**
 * POST /api/pedido/[slug]/card/charge  — Mercado Pago transparent card charge.
 *
 * The browser tokenizes the card with the MP SDK and sends only the opaque token
 * here (raw PAN/CVV never reach us). We charge it via /v1/payments and, when
 * approved, mark the order paid reusing the proven confirmMpPayment side-effects
 * (order → CONFIRMED, print, coupon, wallet, CRM). Idempotent per order.
 *
 * Public route (customer checkout). Body: { orderId, token, installments, … }.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createCardPayment } from "@/lib/mercadopago";
import { getMercadoPagoCredentials } from "@/services/payment/paymentCredentials";
import { confirmMpPayment } from "@/app/api/payments/mercadopago/webhook/route";
import { getPublicSiteUrl } from "@/lib/public-url";

const bodySchema = z.object({
  orderId:         z.string().min(1),
  token:           z.string().min(1),           // MP SDK card token
  installments:    z.coerce.number().int().min(1).max(24).optional().default(1),
  paymentMethodId: z.string().optional(),       // visa | master | … (from the SDK)
  issuerId:        z.string().optional(),
  payerEmail:      z.string().email().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await params; // the order scopes itself to its restaurant

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Corpo inválido." }, { status: 400 }); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Dados do cartão inválidos." }, { status: 400 });
  const { orderId, token, installments, paymentMethodId, issuerId, payerEmail } = parsed.data;

  const payment = await prisma.payment.findUnique({
    where:   { orderId },
    include: { order: { select: { id: true, restaurantId: true, status: true } } },
  });
  if (!payment || !payment.order || payment.providerName !== "mercadopago") {
    return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
  }
  // Idempotent: an already-paid order short-circuits (retry / double submit).
  if (payment.status === "PAID") return NextResponse.json({ status: "approved" });

  const creds = await getMercadoPagoCredentials(payment.order.restaurantId);
  if (!creds) return NextResponse.json({ error: "Mercado Pago não configurado." }, { status: 503 });

  const appUrl = getPublicSiteUrl();
  let result;
  try {
    result = await createCardPayment(creds.accessToken, {
      orderId,
      amount:          Number(payment.amount),
      description:     `Pedido – ${payment.order.restaurantId}`,
      token,
      installments,
      paymentMethodId,
      issuerId,
      payerEmail,
      notificationUrl: appUrl ? `${appUrl}/api/payments/mercadopago/webhook` : undefined,
    });
  } catch (err) {
    console.error("[card-charge] MP charge failed", { orderId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ status: "error", error: "Não foi possível processar o cartão. Tente novamente." }, { status: 502 });
  }

  // Persist the MP payment id + card metadata so the webhook/reconcile can match it.
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      providerReference: result.paymentId,
      cardBrand:         result.brand ?? null,
      cardLast4:         result.last4 ?? null,
      installments:      result.installments ?? installments,
    },
  });

  if (result.status === "approved") {
    // Reuse the canonical MP confirmation (order → CONFIRMED, print, coupon, CRM…).
    await confirmMpPayment(
      { id: payment.id, status: payment.status, amount: payment.amount, order: payment.order },
      { status: "approved", transaction_amount: Number(payment.amount), id: result.paymentId },
    ).catch((err) => console.error("[card-charge] confirm failed", { orderId, err }));
    return NextResponse.json({ status: "approved", installments: result.installments });
  }

  if (result.status === "in_process" || result.status === "pending") {
    // Under review — the MP webhook will confirm. Client shows "processing".
    return NextResponse.json({ status: "pending" });
  }

  // rejected / cancelled — surface the MP detail so the customer can retry.
  return NextResponse.json({ status: "rejected", detail: result.statusDetail });
}
