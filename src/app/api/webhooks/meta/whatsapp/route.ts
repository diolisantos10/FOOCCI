/**
 * Meta WhatsApp Cloud API webhook — official provider (parallel to Evolution).
 *
 * GET  — Meta verification handshake (hub.challenge) using the app verify token.
 * POST — signed events: validates X-Hub-Signature-256, normalizes, dedupes by
 *        wamid (Message.externalMessageId @unique), maps phone_number_id → restaurant,
 *        and writes inbound messages into Central de Conversas + applies delivery
 *        statuses to outbound messages.
 *
 * Additive: does NOT touch the Evolution webhook (/api/webhooks/evolution). Always
 * returns 200 quickly so Meta does not disable the subscription.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ConversationStatus } from "@prisma/client";
import { metaWebhookVerifyToken, metaAppSecret } from "@/services/whatsapp/metaFlag";
import { verifyMetaChallenge, validateMetaSignature, normalizeMetaWebhook } from "@/services/whatsapp/providers/metaWebhook";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { WhatsAppBrainRuntimeService, isWhatsAppBrainEnabled } from "@/services/whatsapp/brain/WhatsAppBrainRuntimeService";
import { isSupportPhoneNumberId, handleInboundSupport } from "@/services/support/SupportWhatsAppService";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const challenge = verifyMetaChallenge(
    { mode: sp.get("hub.mode"), token: sp.get("hub.verify_token"), challenge: sp.get("hub.challenge") },
    metaWebhookVerifyToken(),
  );
  if (challenge != null) return new NextResponse(challenge, { status: 200 });
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();

  // Signature check — FAIL CLOSED. A missing app secret must reject (not accept
  // unsigned, spoofable payloads that could inject inbound messages into any tenant).
  const secret = metaAppSecret();
  if (!secret) {
    console.error("[webhook/meta/whatsapp] META_APP_SECRET not set — rejecting unsigned webhook");
    return NextResponse.json({ ok: false, error: "webhook not configured" }, { status: 401 });
  }
  if (!validateMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    console.warn("[webhook/meta/whatsapp] invalid signature — rejected");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }, { status: 200 }); }

  try {
    await processMetaWebhook(payload);
  } catch (err) {
    console.error("[webhook/meta/whatsapp] processing error", err);
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}

const ACTIVE_STATUSES: ConversationStatus[] = [
  ConversationStatus.OPEN, ConversationStatus.BOT, ConversationStatus.HUMAN,
  ConversationStatus.AI_ATENDENDO, ConversationStatus.HUMANO_ASSUMIU,
];

async function processMetaWebhook(payload: unknown): Promise<void> {
  const norm = normalizeMetaWebhook(payload);

  // Coexistence events (history / app-state sync / message echoes) start arriving once a
  // number is onboarded via Business App Onboarding. We don't ingest them yet — log their
  // arrival so the real payload shape can be validated against a live event before we wire
  // echoes (the agent's phone-sent replies) into the Central. Safe + additive.
  try {
    const body = payload as { entry?: Array<{ changes?: Array<{ field?: string }> }> };
    const coex = (body?.entry ?? [])
      .flatMap((e) => e.changes ?? [])
      .map((c) => c.field)
      .filter((f): f is string => f === "history" || f === "smb_app_state_sync" || f === "smb_message_echoes");
    if (coex.length) console.info(`[webhook/meta/whatsapp] coexistence event(s): ${coex.join(",")}`);
  } catch { /* best-effort — never block the webhook */ }

  // Delivery statuses → update the matching OUTBOUND message.
  for (const s of norm.statuses) {
    const failed = s.status === "failed";
    await prisma.message.updateMany({
      where: { externalMessageId: s.providerMessageId },
      data: {
        externalStatus: s.status,
        providerStatus: s.status,
        ...(failed && s.errorCode ? { providerError: `META_${s.errorCode}` } : {}),
        ...(s.status === "delivered" ? { deliveredAt: s.timestamp ?? new Date() } : {}),
        ...(s.status === "read"      ? { readAt: s.timestamp ?? new Date() }      : {}),
        ...(failed && s.errorCode ? { errorMessage: `META_${s.errorCode}` } : {}),
      },
    });
  }

  // Inbound customer messages → Central de Conversas.
  for (const m of norm.messages) {
    if (!m.phoneNumberId) continue;

    // Número DEDICADO do Agente de TI: desvia ANTES do fluxo de restaurante — a
    // equipe fala com o suporte técnico, não com o garçom. Gated: se o número de
    // suporte não estiver configurado, isSupportPhoneNumberId é sempre false e o
    // fluxo abaixo segue idêntico (aditivo, zero risco). Shadow-safe: só diagnostica.
    if (isSupportPhoneNumberId(m.phoneNumberId)) {
      void handleInboundSupport({ fromPhone: m.fromPhone, text: m.text ?? null, isText: m.type === "text" })
        .catch((err) => console.error("[webhook/meta/whatsapp] support dispatch failed", err));
      continue;
    }

    const cfg = await MetaConfigService.getByPhoneNumberId(m.phoneNumberId);
    if (!cfg) { console.warn(`[webhook/meta/whatsapp] unknown phone_number_id=${m.phoneNumberId} — no restaurant matched`); continue; }

    // Dedupe by wamid — never write the same message twice.
    const existing = await prisma.message.findUnique({
      where:  { externalMessageId: m.providerMessageId },
      select: { id: true },
    });
    if (existing) continue;

    const conv = await findOrCreateConversation(cfg.restaurantId, m.fromPhone, m.profileName);
    // Media (image/audio/video/document/sticker): store the Meta media id so the
    // authenticated attachment proxy can download the bytes on demand. whatsappMedia
    // flags the viewer; metaMediaId routes it to the Meta (not Evolution) download path.
    const mediaType: "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT" =
      m.media?.kind === "image" || m.media?.kind === "sticker" ? "IMAGE" :
      m.media?.kind === "audio" ? "AUDIO" :
      m.media ? "DOCUMENT" : "TEXT"; // video/document → DOCUMENT (viewer uses real mime)
    await prisma.message.create({
      data: {
        conversationId:    conv.id,
        direction:         "INBOUND",
        senderType:        "CUSTOMER",
        content:           m.text ?? "",
        type:              mediaType,
        sentAt:            m.timestamp,
        externalMessageId: m.providerMessageId,
        externalStatus:    "received",
        provider:          "META_CLOUD_API",
        providerMessageId: m.providerMessageId,
        providerStatus:    "received",
        metadata:          {
          provider:      "META_CLOUD_API",
          phoneNumberId: m.phoneNumberId,
          messageType:   m.type,
          ...(m.media ? {
            whatsappMedia: true,
            metaMediaId:   m.media.id,
            mimetype:      m.media.mimeType,
            fileName:      m.media.filename,
          } : {}),
        },
      },
    });
    await prisma.conversation.update({
      where: { id: conv.id },
      data:  { lastMessageAt: m.timestamp, unreadCount: { increment: 1 } },
    });

    // Feed the same agent pipeline Evolution uses: the Brain (default front door)
    // answers TEXT messages and replies THROUGH the selected provider (Meta here).
    // Fire-and-forget and self-guarding (Brain skips human-handled / AI-locked
    // conversations). Order intent / Pix logic is unchanged.
    if (isWhatsAppBrainEnabled() && m.type === "text" && (m.text ?? "").trim()) {
      void WhatsAppBrainRuntimeService.respond(conv.id).catch((err) =>
        console.error("[webhook/meta/whatsapp] brain dispatch failed", err),
      );
    }
  }
}

async function findOrCreateConversation(
  restaurantId: string,
  fromPhone:    string,
  profileName:  string | null,
): Promise<{ id: string }> {
  const tail = fromPhone.slice(-8);
  const existing = await prisma.conversation.findFirst({
    where: {
      restaurantId,
      channel: "WHATSAPP",
      status:  { in: ACTIVE_STATUSES },
      OR: [
        { customerPhone: { contains: tail } },
        { customer: { phone: { contains: tail } } },
      ],
    },
    orderBy: { lastMessageAt: "desc" },
    select:  { id: true, customerPhone: true },
  });
  if (existing) {
    // Self-heal the channel phone: Meta's wa_id (fromPhone) is the authoritative,
    // deliverable recipient for /messages. Conversations created earlier (or matched
    // via a malformed CRM Customer.phone) can carry a number the Cloud API rejects
    // (seen live: 12-digit local without the 55 country code → INVALID_PHONE, bot
    // silently mute). Overwrite whenever it differs so replies always target the
    // exact number that just messaged us.
    if (existing.customerPhone !== fromPhone) {
      await prisma.conversation.update({
        where: { id: existing.id },
        data:  { customerPhone: fromPhone },
      }).catch(() => { /* best-effort — reply still uses stored phone if this fails */ });
    }
    return existing;
  }

  const customer = await prisma.customer.findFirst({
    where:  { restaurantId, phone: { contains: tail } },
    select: { id: true, name: true, phone: true },
  });

  return prisma.conversation.create({
    data: {
      restaurantId,
      channel:       "WHATSAPP",
      status:        "OPEN",
      customerId:    customer?.id ?? null,
      // Channel phone = Meta's wa_id, NOT Customer.phone: the CRM value can be in a
      // format the Cloud API rejects; wa_id is exactly what /messages accepts back.
      customerPhone: fromPhone,
      customerName:  customer?.name ?? profileName ?? fromPhone,
      contextType:   "INBOUND",
    },
    select: { id: true },
  });
}
