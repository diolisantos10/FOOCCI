/**
 * POST /api/chat/conversations/[id]/messages
 *
 * Dashboard operator sends a human reply.
 *
 * The message is stored as senderType=HUMAN in the database.
 *
 * IMPORTANT: This message is NOT delivered to the customer's browser yet.
 * The public ordering UI does not poll for human messages in this sprint.
 * Delivery to customer will be wired in the next sprint (WebSocket / polling).
 *
 * The response includes a `delivered: false` flag and a notice so the
 * dashboard UI can show an honest disclaimer.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, notFound, badRequest, serverError } from "@/lib/api-response";

const bodySchema = z.object({
  content: z.string().min(1).max(4000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { id } = await params;

    const conv = await prisma.conversation.findUnique({
      where:  { id },
      select: { id: true, restaurantId: true },
    });
    if (!conv || conv.restaurantId !== ctx.restaurantId) return notFound();

    const raw    = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return badRequest("content is required");

    const now = new Date();

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: id,
          direction:      "OUTBOUND",
          senderType:     "HUMAN",
          content:        parsed.data.content,
          type:           "TEXT",
          sentAt:         now,
          metadata:       { sentByUserId: ctx.userId },
        },
        select: { id: true, senderType: true, content: true, sentAt: true },
      }),
      prisma.conversation.update({
        where: { id },
        data:  { lastMessageAt: now },
      }),
    ]);

    return ok({
      message,
      delivered: false,
      notice: "Resposta registrada internamente. Envio ao cliente será conectado na próxima etapa.",
    });
  } catch (err) {
    console.error("[POST /api/chat/conversations/[id]/messages]", err);
    return serverError();
  }
}
