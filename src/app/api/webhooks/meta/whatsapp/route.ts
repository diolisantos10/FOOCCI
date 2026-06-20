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

  // Signature check (enforced when the app secret is configured).
  const secret = metaAppSecret();
  if (secret && !validateMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
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

  // Delivery statuses → update the matching OUTBOUND message.
  for (const s of norm.statuses) {
    await prisma.message.updateMany({
      where: { externalMessageId: s.providerMessageId },
      data: {
        externalStatus: s.status,
        ...(s.status === "delivered" ? { deliveredAt: s.timestamp ?? new Date() } : {}),
        ...(s.status === "read"      ? { readAt: s.timestamp ?? new Date() }      : {}),
        ...(s.status === "failed" && s.errorCode ? { errorMessage: `META_${s.errorCode}` } : {}),
      },
    });
  }

  // Inbound customer messages → Central de Conversas.
  for (const m of norm.messages) {
    if (!m.phoneNumberId) continue;
    const cfg = await MetaConfigService.getByPhoneNumberId(m.phoneNumberId);
    if (!cfg) { console.warn("[webhook/meta/whatsapp] unknown phone_number_id"); continue; }

    // Dedupe by wamid — never write the same message twice.
    const existing = await prisma.message.findUnique({
      where:  { externalMessageId: m.providerMessageId },
      select: { id: true },
    });
    if (existing) continue;

    const conv = await findOrCreateConversation(cfg.restaurantId, m.fromPhone, m.profileName);
    await prisma.message.create({
      data: {
        conversationId:    conv.id,
        direction:         "INBOUND",
        senderType:        "CUSTOMER",
        content:           m.text ?? "",
        type:              "TEXT",
        sentAt:            m.timestamp,
        externalMessageId: m.providerMessageId,
        metadata:          { provider: "META_CLOUD_API", phoneNumberId: m.phoneNumberId, messageType: m.type },
      },
    });
    await prisma.conversation.update({
      where: { id: conv.id },
      data:  { lastMessageAt: m.timestamp, unreadCount: { increment: 1 } },
    });
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
    select:  { id: true },
  });
  if (existing) return existing;

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
      customerPhone: customer?.phone ?? fromPhone,
      customerName:  customer?.name ?? profileName ?? fromPhone,
      contextType:   "INBOUND",
    },
    select: { id: true },
  });
}
