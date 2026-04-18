/**
 * POST /api/payments/mercadopago/create-link
 *
 * Creates (or re-uses) a Mercado Pago checkout preference for an order.
 * Mirrors the Stone equivalent at /api/payments/stone/create-link.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { createMPPaymentLink } from "@/lib/mercadopago";
import { decrypt } from "@/lib/crypto";
import { Decimal } from "@prisma/client/runtime/library";

const bodySchema = z.object({ orderId: z.string().min(1) });

async function getMpAccessToken(restaurantId: string): Promise<string | null> {
  const cfg = await prisma.integrationConfig.findUnique({
    where: { restaurantId_provider: { restaurantId, provider: "mercadopago" } },
    select: { configBlob: true, isActive: true },
  });
  if (!cfg || !cfg.isActive) return null;
  try {
    const raw = JSON.parse(decrypt(cfg.configBlob)) as { accessToken: string };
    return raw.accessToken ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "orderId obrigatório" }, { status: 400 });
  }

  const { orderId } = parsed.data;
  const { restaurantId } = ctx;

  // Verify order belongs to this restaurant
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    select: { id: true, total: true, status: true },
  });
  if (!order) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  // Idempotency: if there's already a non-expired link, return it
  const existing = await prisma.payment.findUnique({
    where: { orderId },
    select: { status: true, paymentUrl: true, providerReference: true, expiresAt: true },
  });
  if (
    existing?.status === "LINK_SENT" &&
    existing.paymentUrl &&
    existing.expiresAt &&
    existing.expiresAt > new Date()
  ) {
    return NextResponse.json({
      orderId,
      paymentUrl: existing.paymentUrl,
      providerReference: existing.providerReference,
      expiresAt: existing.expiresAt.toISOString(),
    });
  }

  // Get MP access token
  const accessToken = await getMpAccessToken(restaurantId);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Mercado Pago não configurado ou inativo. Configure em Integrações." },
      { status: 503 }
    );
  }

  // Create preference (payment link)
  let mpResult;
  try {
    mpResult = await createMPPaymentLink(accessToken, {
      orderId,
      amount: Number(order.total),
      description: `Pedido #${orderId.slice(-6).toUpperCase()}`,
      expiresInMinutes: 30,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "MP error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Upsert payment record
  await prisma.payment.upsert({
    where: { orderId },
    create: {
      orderId,
      method: "ONLINE",
      status: "LINK_SENT",
      amount: new Decimal(Number(order.total)),
      paymentMode: "PAY_NOW",
      providerName: "mercadopago",
      providerReference: mpResult.providerReference,
      paymentUrl: mpResult.paymentUrl,
      expiresAt: new Date(mpResult.expiresAt),
    },
    update: {
      status: "LINK_SENT",
      providerName: "mercadopago",
      providerReference: mpResult.providerReference,
      paymentUrl: mpResult.paymentUrl,
      expiresAt: new Date(mpResult.expiresAt),
    },
  });

  // Advance order to AWAITING_PAYMENT if still PENDING
  if (order.status === "PENDING") {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "AWAITING_PAYMENT" },
    });
  }

  return NextResponse.json({
    orderId,
    paymentUrl: mpResult.paymentUrl,
    providerReference: mpResult.providerReference,
    expiresAt: mpResult.expiresAt,
  });
}
