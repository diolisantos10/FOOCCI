/**
 * POST /api/chat/conversations/[id]/takeover
 *
 * Human operator takes over the conversation:
 * • aiEnabled = false  → AI will not auto-reply to new customer messages
 * • status    = HUMANO_ASSUMIU
 * • assignedTo = current user (if available from tenant context)
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";
import { ConversationStatus } from "@prisma/client";
import { markConversationNeedsHuman } from "@/lib/handoff";

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

    // Record handoff event (idempotent; creates SYSTEM message for inactivity tracking)
    await markConversationNeedsHuman(id, "AI_ESCALATION");

    // Takeover sets a more specific status and assigns the operator
    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        aiEnabled:  false,
        status:     ConversationStatus.HUMANO_ASSUMIU,
        assignedTo: ctx.userId,
      },
      select: { id: true, aiEnabled: true, status: true, assignedTo: true },
    });

    return ok(updated);
  } catch (err) {
    console.error("[POST /api/chat/conversations/[id]/takeover]", err);
    return serverError();
  }
}
