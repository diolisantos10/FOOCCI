/**
 * GET /api/pedido/[slug]/operator-messages?conversationId=...&after=ISO
 *
 * Customer-facing polling endpoint so operator replies sent from Atendimento
 * appear inside the customer's /pedido (Cardápio) chat.
 *
 * Returns only OUTBOUND operator/store messages (HUMAN) for the given
 * conversation after the `after` timestamp. The customer already holds the
 * conversationId (returned by the chat POST), and results are scoped to the
 * restaurant identified by the slug — no other conversation data is exposed.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-op-msgs:${ip}`, limit: 60, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  const { slug } = await params;
  const conversationId = req.nextUrl.searchParams.get("conversationId");
  const afterRaw       = req.nextUrl.searchParams.get("after");

  if (!conversationId) {
    return NextResponse.json({ messages: [] });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where:  { slug },
    select: { id: true },
  });
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurante não encontrado" }, { status: 404 });
  }

  // Verify the conversation belongs to this restaurant before returning anything.
  const conv = await prisma.conversation.findFirst({
    where:  { id: conversationId, restaurantId: restaurant.id },
    select: { id: true, aiEnabled: true, channel: true },
  });
  if (!conv) {
    return NextResponse.json({ messages: [], aiActive: true });
  }

  // aiActive: false only when an operator took over a Cardápio (QR/WEB) session.
  // Lets the /pedido client toggle human-mode UI even while the customer is idle.
  const isCardapioConv = conv.channel === "QR_AGENT" || conv.channel === "WEB_AGENT";
  const aiActive = !(conv.aiEnabled === false && isCardapioConv);

  const after = afterRaw ? new Date(afterRaw) : null;
  const validAfter = after && !Number.isNaN(after.getTime()) ? after : null;

  // Only operator/store messages. AI Cardápio replies are already shown locally
  // in the chat, so returning them here would duplicate them.
  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      direction:  "OUTBOUND",
      senderType: "HUMAN",
      type:       "TEXT",
      ...(validAfter ? { sentAt: { gt: validAfter } } : {}),
    },
    orderBy: { sentAt: "asc" },
    take:    20,
    select:  { id: true, content: true, sentAt: true },
  });

  return NextResponse.json({
    aiActive,
    messages: rows.map((m) => ({
      id:      m.id,
      content: m.content,
      sentAt:  m.sentAt.toISOString(),
    })),
  });
}
