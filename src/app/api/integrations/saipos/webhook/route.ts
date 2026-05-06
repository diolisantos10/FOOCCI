/**
 * POST /api/integrations/saipos/webhook
 *
 * Receives order status events from Saipos and maps them to Foocci order states.
 *
 * Expected payload:
 *   { event: string, cod_store: string, order_id: string }
 *
 * Possible events:
 *   CONFIRMED, READY_TO_DELIVER, DISPATCHED, CONCLUDED, CANCELLED
 *
 * The order_id is the Foocci order ID we sent to Saipos at createOrder time.
 * cod_store is used to resolve which restaurant this event belongs to.
 *
 * Always returns HTTP 200 so Saipos does not retry on application-level errors.
 */

import { NextRequest, NextResponse } from "next/server";
import { SaiposIntegrationService } from "@/services/integrations/SaiposIntegrationService";

interface SaiposWebhookPayload {
  event:     string;
  cod_store: string;
  order_id:  string;
}

function isValidPayload(v: unknown): v is SaiposWebhookPayload {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.event     === "string" && p.event.length > 0 &&
    typeof p.cod_store === "string" && p.cod_store.length > 0 &&
    typeof p.order_id  === "string" && p.order_id.length > 0
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // Malformed JSON — return 200 to prevent Saipos retries
    console.warn("[saipos/webhook] Could not parse JSON body");
    return NextResponse.json({ ok: false, error: "Invalid JSON" });
  }

  if (!isValidPayload(body)) {
    console.warn("[saipos/webhook] Unexpected payload shape:", JSON.stringify(body).slice(0, 200));
    return NextResponse.json({ ok: false, error: "Invalid payload shape" });
  }

  console.log(`[saipos/webhook] Received event="${body.event}" cod_store="${body.cod_store}" order_id="${body.order_id}"`);

  try {
    const result = await SaiposIntegrationService.handleWebhook(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Log but always return 200 so Saipos stops retrying
    console.error("[saipos/webhook] Unhandled error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" });
  }
}
