/**
 * POST /api/payments/sumup/webhook
 *
 * Async confirmation from SumUp when a checkout changes status. We only use the
 * webhook to identify WHICH checkout changed — confirmSumUpPayment then re-fetches
 * it from the SumUp API before marking anything paid, so an unauthenticated or
 * spoofed webhook can never confirm an unpaid order (the API re-check is the gate).
 *
 * Always responds 200 (except on nothing-to-do) so SumUp doesn't retry forever.
 * Public route (SumUp servers carry no JWT).
 */

import { NextRequest, NextResponse } from "next/server";
import { confirmSumUpPayment } from "@/services/payment/confirmCardPayment";

const LOG = "[sumup-webhook]";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    // Non-JSON body — nothing to act on
  }

  // SumUp may wrap the changed resource under `payload`, or post the checkout
  // resource directly. checkout_reference is our orderId; id is the checkout id.
  const payload = (body.payload as Record<string, unknown> | undefined) ?? body;
  const reference =
    (payload.reference as string | undefined) ??
    (payload.checkout_reference as string | undefined) ??
    (body.reference as string | undefined);
  const checkoutId =
    (payload.id as string | undefined) ??
    (payload.checkout_id as string | undefined) ??
    (body.checkout_id as string | undefined);

  if (!reference && !checkoutId) {
    console.info(LOG, "no checkout identifier in webhook", { keys: Object.keys(body) });
    return NextResponse.json({ received: true });
  }

  try {
    const result = await confirmSumUpPayment(reference ? { orderId: reference } : { checkoutId });
    console.info(LOG, "processed", { reference, checkoutId, result });
  } catch (e) {
    console.error(LOG, "confirm failed", { error: e instanceof Error ? e.message : String(e) });
  }

  return NextResponse.json({ received: true });
}

// SumUp may GET the URL to validate it during setup.
export async function GET() {
  return NextResponse.json({ ok: true });
}
