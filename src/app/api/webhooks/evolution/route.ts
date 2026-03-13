/**
 * POST /api/webhooks/evolution
 *
 * Single public endpoint that receives all Evolution API webhook events.
 * This route is intentionally NOT authenticated (no JWT required) — it is
 * protected instead by HMAC-SHA256 signature verification on the request body.
 *
 * Evolution sends:
 *   Header: x-evolution-webhook-secret (plain token) or can use HMAC.
 *   We verify against the per-restaurant webhookSecret stored encrypted in DB.
 *
 * Response: always 200 OK within ~3s (Evolution retries on non-200).
 * Processing is synchronous in Phase 3; Phase 4 can move to a queue.
 */

import { NextRequest, NextResponse } from "next/server";
import { WebhookParserService } from "@/services/evolution/WebhookParserService";
import { WebhookProcessorService } from "@/services/evolution/WebhookProcessorService";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { createHmac, timingSafeEqual } from "crypto";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  let rawBody: string;

  try {
    rawBody = await req.text();
    body = JSON.parse(rawBody);
  } catch {
    // Always return 200 to prevent Evolution from retrying malformed payloads.
    console.warn("[webhook/evolution] Invalid JSON body");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Extract instanceName from the payload to look up per-restaurant webhookSecret
  const instanceName = extractInstanceName(body);
  if (!instanceName) {
    console.warn("[webhook/evolution] Missing instance name in payload");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Verify webhook authenticity
  const configResult = await EvolutionConfigService.findRestaurantByInstance(instanceName);
  if (!configResult.ok) {
    // Unknown instance — respond 200 to avoid error loops but do not process.
    console.warn(`[webhook/evolution] Unknown instance: ${instanceName}`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const { webhookSecret } = configResult.data;
  if (!verifySignature(req, rawBody, webhookSecret)) {
    console.warn(`[webhook/evolution] Signature mismatch for instance: ${instanceName}`);
    // Return 200 to not leak whether the instance exists.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Parse and process
  try {
    const event = WebhookParserService.parse(body);
    const result = await WebhookProcessorService.process(event);

    if (!result.handled) {
      console.debug("[webhook/evolution] Event not handled:", result.detail);
    }
  } catch (err) {
    // Log but do not propagate — Evolution must receive 200 to stop retrying.
    console.error("[webhook/evolution] Processing error:", err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

// ─── helpers ─────────────────────────────────────────────────

function extractInstanceName(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  return (raw.instance as string) ?? null;
}

/**
 * Verify the incoming request signature.
 *
 * Strategy 1 (preferred): HMAC-SHA256 of raw body, compared against
 *   the `x-evolution-hmac-sha256` header.
 * Strategy 2 (fallback): plain token comparison via `x-evolution-webhook-secret`.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifySignature(req: NextRequest, rawBody: string, secret: string): boolean {
  const hmacHeader = req.headers.get("x-evolution-hmac-sha256");

  if (hmacHeader) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(hmacHeader, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }

  // Fallback: plain token
  const tokenHeader = req.headers.get("x-evolution-webhook-secret") ?? "";
  try {
    return timingSafeEqual(
      Buffer.from(tokenHeader, "utf8"),
      Buffer.from(secret, "utf8")
    );
  } catch {
    return false;
  }
}
