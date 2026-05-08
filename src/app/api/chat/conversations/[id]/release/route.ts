/**
 * POST /api/chat/conversations/[id]/release
 *
 * Return conversation to AI:
 * • aiEnabled  = true
 * • status     = AI_ATENDENDO
 * • assignedTo = null
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";
import { ConversationStatus } from "@prisma/client";

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

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        aiEnabled:  true,
        status:     ConversationStatus.AI_ATENDENDO,
        assignedTo: null,
      },
      select: { id: true, aiEnabled: true, status: true, assignedTo: true },
    });

    return ok(updated);
  } catch (err) {
    console.error("[POST /api/chat/conversations/[id]/release]", err);
    return serverError();
  }
}
