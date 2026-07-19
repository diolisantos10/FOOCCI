/**
 * POST /api/pedido/[slug]/card/confirm
 *
 * Called by the client after the SumUp card widget reports "success". We do NOT
 * trust that report — confirmSumUpPayment re-fetches the checkout from SumUp and
 * only marks the order paid when SumUp itself says PAID.
 *
 * Public route (customer checkout). Body: { orderId }.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmSumUpPayment } from "@/services/payment/confirmCardPayment";

const bodySchema = z.object({ orderId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await params; // slug not needed — the order scopes itself to its restaurant

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Corpo inválido." }, { status: 400 }); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "orderId obrigatório." }, { status: 400 });

  const result = await confirmSumUpPayment({ orderId: parsed.data.orderId });

  const paid = result === "confirmed" || result === "already_paid";
  const status = paid ? "paid"
    : result === "not_paid" ? "pending"
    : result === "not_found" ? "not_found"
    : "error";

  // Only "not_found" is a hard failure; "pending"/"error" are transient — the
  // client keeps the customer on the payment screen (widget / polling) to retry.
  const httpStatus = result === "not_found" ? 404 : 200;
  return NextResponse.json({ status }, { status: httpStatus });
}
