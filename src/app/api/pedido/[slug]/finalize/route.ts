/**
 * POST /api/pedido/[slug]/finalize
 *
 * Test-mode finalization for the public ordering simulator.
 *
 * This endpoint is intentionally PUBLIC and creates NO database records.
 * It exists only to let the ordering flow reach its natural conclusion
 * during team testing — no real order is placed.
 *
 * For pay_now:   returns a mock payment URL pointing to a test confirmation page.
 * For others:    returns a simulated confirmation immediately.
 */

import { NextRequest, NextResponse } from "next/server";

function uid() { return Math.random().toString(36).slice(2, 10); }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  // Consume params to satisfy Next.js (slug used for routing only)
  await params;

  const body = await req.json().catch(() => ({}));
  const paymentMode: string = body?.paymentMode ?? "pay_on_delivery";

  if (paymentMode === "pay_now") {
    const testOrderId = `test-${uid()}`;
    const expiresAt   = new Date(Date.now() + 30 * 60_000).toISOString();
    return NextResponse.json({
      orderId:           testOrderId,
      paymentUrl:        `/_test/payment-confirmed?orderId=${testOrderId}`,
      providerReference: `test_${testOrderId}`,
      expiresAt,
      isTest:            true,
    });
  }

  return NextResponse.json({
    orderId:   `test-${uid()}`,
    confirmed: true,
    isTest:    true,
  });
}
