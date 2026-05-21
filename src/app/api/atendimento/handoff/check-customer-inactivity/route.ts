/**
 * POST /api/atendimento/handoff/check-customer-inactivity
 *
 * Closes idle human conversations when the CUSTOMER stops replying.
 * Called periodically by the /atendimento client (every ~60 s when open).
 *
 * Trigger conditions (ALL must be true):
 *   • Conversation is in human mode (aiEnabled=false, status HUMAN/HUMANO_ASSUMIU)
 *   • A human/team member HAS already sent at least one outbound message
 *   • The customer has NOT sent any message after that human reply
 *   • More than TIMEOUT_MS has elapsed since the last human outbound message
 *   • No customer-inactivity marker already written for this episode
 *
 * Does NOT trigger if:
 *   • Human has not replied yet (customer still waiting — that's check-timeouts)
 *   • Customer sent a message after the human reply (conversation is active)
 *   • Conversation is already in AI mode
 *
 * No schema changes — uses Message.metadata for idempotency markers.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { ConversationStatus } from "@prisma/client";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const CUSTOMER_INACTIVITY_MESSAGE =
  "Como você ficou um tempinho sem responder, vou deixar nosso assistente ativo por aqui 😊 Se precisar de algo, é só mandar uma mensagem.";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { restaurantId } = ctx;

    const humanConvs = await prisma.conversation.findMany({
      where: {
        restaurantId,
        aiEnabled: false,
        status:    { in: [ConversationStatus.HUMAN, ConversationStatus.HUMANO_ASSUMIU] },
        channel:   "WHATSAPP",
      },
      select: {
        id:            true,
        customerPhone: true,
        customer:      { select: { phone: true } },
      },
    });

    if (humanConvs.length === 0) return ok({ checked: 0, timedOut: [] });

    const now          = new Date();
    const timedOutIds: string[] = [];

    for (const conv of humanConvs) {
      const toPhone = (conv.customer?.phone ?? conv.customerPhone ?? "").replace(/^\+/, "");
      if (!toPhone) continue;

      const msgs = await prisma.message.findMany({
        where:   { conversationId: conv.id },
        orderBy: { sentAt: "desc" },
        take:    30,
        select:  { direction: true, senderType: true, sentAt: true, metadata: true },
      });

      // ── Step 1: find the last HUMAN outbound message ────────────────────────
      const lastHumanMsg = msgs.find(
        (m) => m.direction === "OUTBOUND" && m.senderType === "HUMAN",
      );
      // No human reply yet → not this timeout's job (check-timeouts handles that case)
      if (!lastHumanMsg) continue;

      const lastHumanAt = new Date(lastHumanMsg.sentAt);

      // ── Step 2: check if customer replied AFTER that human message ──────────
      const customerRepliedAfter = msgs.some(
        (m) => m.direction === "INBOUND" && new Date(m.sentAt) > lastHumanAt,
      );
      if (customerRepliedAfter) continue;

      // ── Step 3: idempotency — already sent customer-inactivity marker? ──────
      const alreadyHandled = msgs.some((m) => {
        if (m.direction !== "OUTBOUND" || m.senderType !== "SYSTEM") return false;
        if (new Date(m.sentAt) <= lastHumanAt) return false;
        const meta = m.metadata as Record<string, unknown> | null;
        return meta?.isCustomerInactivityMessage === true;
      });
      if (alreadyHandled) continue;

      // ── Step 4: check threshold ─────────────────────────────────────────────
      if (now.getTime() - lastHumanAt.getTime() < TIMEOUT_MS) continue;

      // ── Step 5: send message + return to AI ─────────────────────────────────
      const evolutionResult = await EvolutionConfigService.getSnapshot(restaurantId);
      if (!evolutionResult.ok) continue;

      try {
        await EvolutionClient.sendTextMessage(
          evolutionResult.data,
          toPhone,
          CUSTOMER_INACTIVITY_MESSAGE,
        );
      } catch (err) {
        console.error(
          `[check-customer-inactivity] Failed to send message to conv ${conv.id}:`,
          err,
        );
        continue;
      }

      await prisma.$transaction([
        prisma.message.create({
          data: {
            conversationId: conv.id,
            direction:      "OUTBOUND",
            senderType:     "SYSTEM",
            content:        CUSTOMER_INACTIVITY_MESSAGE,
            type:           "TEXT",
            sentAt:         now,
            metadata:       {
              isCustomerInactivityMessage: true,
              triggeredAt:                now.toISOString(),
            },
          },
        }),
        prisma.conversation.update({
          where: { id: conv.id },
          data: {
            aiEnabled:     true,
            status:        ConversationStatus.AI_ATENDENDO,
            assignedTo:    null,
            lastMessageAt: now,
          },
        }),
      ]);

      timedOutIds.push(conv.id);
      console.info(
        `[check-customer-inactivity] Conversation ${conv.id} returned to AI — customer silent for 5 min`,
      );
    }

    return ok({ checked: humanConvs.length, timedOut: timedOutIds });
  } catch (err) {
    console.error("[POST /api/atendimento/handoff/check-customer-inactivity]", err);
    return serverError();
  }
}
