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
import { MetaAppCredentialsService } from "@/services/meta/MetaAppCredentialsService";

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
  const signature = req.headers.get("x-hub-signature-256");

  // Instagram DMs (object:"instagram") are signed by the Instagram app; Facebook Messenger
  // (object:"page") is signed by the Meta/Facebook app. Both can arrive on this endpoint,
  // so accept a signature that matches ANY of our configured app secrets. HMAC comparison
  // stays constant-time per candidate; an attacker still can't forge either secret.
  //
  // ⚠️ A CREDENCIAL SALVA NA TELA `/admin/meta` TAMBÉM ENTRA — e essa foi a correção.
  // A regra da casa é "banco primeiro, ambiente depois" (`MetaAppCredentialsService`),
  // e este era um dos três lugares que liam `process.env` direto. Consequência real:
  // rotacionar o segredo do app pela tela, sem atualizar o Railway, fazia ESTE webhook
  // devolver 403 para toda DM — sem erro na tela, sem log óbvio, e com o painel ainda
  // dizendo "Conectado". A lista é ADITIVA de propósito: o que já funcionava por env
  // continua funcionando, então subir isto não pode quebrar um deploy que estava bom.
  const resolvidas = await MetaAppCredentialsService.getResolved().catch(() => ({} as { appSecret?: string; igAppSecret?: string }));
  const candidateSecrets = Array.from(new Set([
    resolvidas.igAppSecret,
    resolvidas.appSecret,
    process.env.INSTAGRAM_APP_SECRET,
    process.env.META_APP_SECRET,
    process.env.FACEBOOK_APP_SECRET,
  ].filter((s): s is string => !!s)));

  const signatureOk = candidateSecrets.some((secret) => verifyInstagramSignature(rawBody, signature, secret));
  if (!signatureOk) {
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
    // TEMP DIAG [ig-wh]: why an inbound DM did/didn't land in the central. No PII/content.
    console.log(`[ig-wh] dm{resolved:${dm.resolved} persisted:${dm.persisted} nonMsg:${dm.skippedNonMessage} notAllow:${dm.skippedNotAllowlisted} dup:${dm.skippedDuplicates}} comments{persisted:${comments.persisted}}`);
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
