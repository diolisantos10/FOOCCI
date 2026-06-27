/**
 * Instagram Direct webhook — Meta Messaging.
 *
 * GET  — Meta verification handshake (hub.mode/hub.verify_token/hub.challenge).
 * POST — inbound events. Verifies the X-Hub-Signature-256 when an app secret is
 *        configured, normalizes the payload and persists inbound messages into the
 *        central (Customer/Conversation/Message). NEVER auto-replies, NEVER sends,
 *        NEVER creates an order/Pix. Always answers 200 quickly so Meta won't retry
 *        storms; unknown accounts/events are ignored with a safe log (no PII/token).
 *
 * Public endpoint (no JWT) — protected by verify token + optional signature.
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidWebhookVerifyToken } from "@/services/instagram/InstagramConfigService";
import { handleWebhookEvent, handleCommentWebhookEvent } from "@/services/instagram/InstagramChannelService";
import { verifyInstagramSignature } from "@/services/instagram/InstagramWebhookParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge") ?? "";

  if (mode === "subscribe" && (await isValidWebhookVerifyToken(token))) {
    // Meta expects the raw challenge echoed back as text.
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  // Read the RAW body for signature verification.
  const rawBody = await req.text();
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? null;
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyInstagramSignature(rawBody, signature, appSecret)) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Malformed body — acknowledge so Meta doesn't retry, but do nothing.
    return NextResponse.json({ ok: true, ignored: "malformed" }, { status: 200 });
  }

  try {
    // A payload is either DMs (entry[].messaging) or comments (entry[].changes);
    // each handler no-ops on the other's event type, so running both is safe.
    const [dm, comments] = await Promise.all([
      handleWebhookEvent(payload),
      handleCommentWebhookEvent(payload),
    ]);
    // Safe summary only — no message content, no PII, no token.
    return NextResponse.json({
      ok: true,
      resolved: dm.resolved || comments.resolved,
      persisted: dm.persisted + comments.persisted,
      persistedComments: comments.persisted,
      skippedDuplicates: dm.skippedDuplicates + comments.skippedDuplicates,
      skippedNonMessage: dm.skippedNonMessage + comments.skippedNonMessage,
      skippedNotAllowlisted: dm.skippedNotAllowlisted + comments.skippedNotAllowlisted,
      noRealInstagramSend: true,
    }, { status: 200 });
  } catch (err) {
    console.error("[instagram-webhook] processing error", err instanceof Error ? err.message : "unknown");
    // Never fail the webhook — Meta would retry aggressively.
    return NextResponse.json({ ok: true, ignored: "error" }, { status: 200 });
  }
}
