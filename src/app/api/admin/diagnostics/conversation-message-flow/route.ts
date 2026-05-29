/**
 * GET /api/admin/diagnostics/conversation-message-flow
 *
 * Inspects the unified message timeline for one conversation so we can verify
 * source/channel labelling, delivery behaviour, and media availability.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params:
 *   conversationId — the conversation to inspect (required)
 *   limit          — number of recent messages (default 20, max 100)
 *
 * Response (read-only, no secrets):
 *   conversation: { id, channel, status, aiEnabled, customer }
 *   sourcesPresent: { whatsapp, cardapio, ai, operator, system, media }
 *   messages[]: { senderType, source, direction, customerVisible,
 *                 deliveredVia, type, hasMedia, mediaProxyAvailable, preview }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";

interface MsgMeta {
  source?: string;
  whatsappMedia?: boolean;
  mimetype?: string;
}

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp             = req.nextUrl.searchParams;
  const conversationId = sp.get("conversationId");
  const limit          = Math.min(Number(sp.get("limit") ?? 20) || 20, 100);

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where:  { id: conversationId },
    select: {
      id: true, channel: true, status: true, aiEnabled: true,
      customer: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const rows = await prisma.message.findMany({
    where:   { conversationId },
    orderBy: { sentAt: "desc" },
    take:    limit,
    select: {
      id: true, direction: true, senderType: true, type: true,
      content: true, mediaUrl: true, metadata: true,
      externalMessageId: true, externalStatus: true, sentAt: true,
    },
  });

  const sourcesPresent = {
    whatsapp: false, cardapio: false, ai: false,
    operator: false, system: false, media: false,
  };

  const messages = rows.reverse().map((m) => {
    const meta = (m.metadata ?? {}) as MsgMeta;
    const source = meta.source
      ?? (m.senderType === "CUSTOMER_CARDAPIO" ? "CARDAPIO"
        : m.senderType === "HUMAN_EXTERNAL" || m.senderType === "CUSTOMER" ? "WHATSAPP"
        : null);

    const isMedia = m.type !== "TEXT";
    const customerVisible =
      m.senderType === "AI" || m.senderType === "HUMAN" ||
      m.senderType === "HUMAN_EXTERNAL" ||
      m.senderType === "CUSTOMER" || m.senderType === "CUSTOMER_CARDAPIO";

    // Track presence
    if (source === "WHATSAPP") sourcesPresent.whatsapp = true;
    if (source === "CARDAPIO") sourcesPresent.cardapio = true;
    if (m.senderType === "AI") sourcesPresent.ai = true;
    if (m.senderType === "HUMAN" || m.senderType === "HUMAN_EXTERNAL") sourcesPresent.operator = true;
    if (m.senderType === "SYSTEM") sourcesPresent.system = true;
    if (isMedia) sourcesPresent.media = true;

    const deliveredVia =
      m.senderType === "HUMAN_EXTERNAL" || m.externalMessageId ? "WHATSAPP"
      : source === "CARDAPIO" && m.direction === "OUTBOUND" ? "CARDAPIO"
      : m.direction === "INBOUND" && m.senderType === "CUSTOMER" ? "WHATSAPP"
      : m.direction === "INBOUND" && m.senderType === "CUSTOMER_CARDAPIO" ? "CARDAPIO"
      : null;

    return {
      id:                  m.id,
      senderType:          m.senderType,
      source,
      direction:           m.direction,
      type:                m.type,
      customerVisible,
      deliveredVia,
      hasMedia:            isMedia,
      mediaProxyAvailable: isMedia && meta.whatsappMedia === true && !!m.externalMessageId,
      mimetype:            meta.mimetype ?? null,
      externalStatus:      m.externalStatus,
      sentAt:              m.sentAt.toISOString(),
      preview:             m.content.slice(0, 80),
    };
  });

  return NextResponse.json({
    conversation: {
      id:        conversation.id,
      channel:   conversation.channel,
      status:    conversation.status,
      aiEnabled: conversation.aiEnabled,
      customer:  conversation.customer,
    },
    sourcesPresent,
    multichannel: sourcesPresent.whatsapp && sourcesPresent.cardapio,
    messageCount: messages.length,
    messages,
  });
}
