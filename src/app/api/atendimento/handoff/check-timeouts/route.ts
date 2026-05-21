/**
 * POST /api/atendimento/handoff/check-timeouts
 *
 * MVP inactivity-timeout runner for human-assigned WhatsApp conversations.
 * Called periodically by the /atendimento client (every ~60 s when the page is open).
 *
 * Logic per conversation (aiEnabled=false, status HUMAN/HUMANO_ASSUMIU):
 *   1. Find the last INBOUND message from the customer.
 *   2. Find the last OUTBOUND message sent by a human team member.
 *   3. If no human reply exists AFTER the last customer message, and the
 *      customer has been waiting more than TIMEOUT_MS, trigger inactivity:
 *        a. Send a WhatsApp message to the customer.
 *        b. Create a SYSTEM message (marker for idempotency + audit).
 *        c. Return conversation to AI mode.
 *   4. Already-timed-out conversations (SYSTEM inactivity marker found) are skipped.
 *
 * No schema changes required — uses Message.metadata for idempotency markers.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { ConversationStatus } from "@prisma/client";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const INACTIVITY_MESSAGES = [
  "Ainda estamos verificando aqui e vou continuar tentando te ajudar! 😊 Em breve alguém da nossa equipe entra em contato.",
  "A equipe pode estar ocupada agora, mas vou seguir te ajudando por aqui. Se precisar de algo, é só falar! 😊",
] as const;

function pickInactivityMessage(): string {
  return INACTIVITY_MESSAGES[Math.floor(Math.random() * INACTIVITY_MESSAGES.length)]!;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { restaurantId } = ctx;

    // Find all conversations currently in human mode for this restaurant
    const humanConvs = await prisma.conversation.findMany({
      where: {
        restaurantId,
        aiEnabled: false,
        status: { in: [ConversationStatus.HUMAN, ConversationStatus.HUMANO_ASSUMIU] },
        channel: "WHATSAPP",
      },
      select: {
        id: true,
        customerPhone: true,
        customer: { select: { phone: true } },
      },
    });

    if (humanConvs.length === 0) return ok({ checked: 0, timedOut: [] });

    const now = new Date();
    const timedOutIds: string[] = [];

    for (const conv of humanConvs) {
      const toPhone = (conv.customer?.phone ?? conv.customerPhone ?? "").replace(/^\+/, "");
      if (!toPhone) continue;

      // Load the last 20 messages (enough to determine inactivity)
      const msgs = await prisma.message.findMany({
        where:   { conversationId: conv.id },
        orderBy: { sentAt: "desc" },
        take:    20,
        select:  { direction: true, senderType: true, sentAt: true, content: true, metadata: true },
      });

      // Find last customer message
      const lastCustomerMsg = msgs.find((m) => m.direction === "INBOUND");
      if (!lastCustomerMsg) continue;

      const customerWaitingSince = new Date(lastCustomerMsg.sentAt);

      // Check if a human team member replied AFTER the customer's last message
      const humanReplied = msgs.some(
        (m) =>
          m.direction === "OUTBOUND" &&
          m.senderType === "HUMAN" &&
          new Date(m.sentAt) > customerWaitingSince,
      );
      if (humanReplied) continue;

      // Check if we already sent an inactivity message after the customer's last message
      const alreadyTimedOut = msgs.some((m) => {
        if (m.direction !== "OUTBOUND" || m.senderType !== "SYSTEM") return false;
        if (new Date(m.sentAt) <= customerWaitingSince) return false;
        const meta = m.metadata as Record<string, unknown> | null;
        return meta?.isInactivityMessage === true;
      });
      if (alreadyTimedOut) continue;

      // Check timeout threshold
      if (now.getTime() - customerWaitingSince.getTime() < TIMEOUT_MS) continue;

      // ── Trigger inactivity ──────────────────────────────────────────────────
      const evolutionResult = await EvolutionConfigService.getSnapshot(restaurantId);
      if (!evolutionResult.ok) continue;

      const inactivityText = pickInactivityMessage();

      try {
        await EvolutionClient.sendTextMessage(evolutionResult.data, toPhone, inactivityText);
      } catch (err) {
        console.error(`[check-timeouts] Failed to send inactivity message to conv ${conv.id}:`, err);
        continue;
      }

      // Persist system marker + return to AI atomically
      await prisma.$transaction([
        prisma.message.create({
          data: {
            conversationId: conv.id,
            direction:      "OUTBOUND",
            senderType:     "SYSTEM",
            content:        inactivityText,
            type:           "TEXT",
            sentAt:         now,
            metadata:       { isInactivityMessage: true, triggeredAt: now.toISOString() },
          },
        }),
        prisma.conversation.update({
          where: { id: conv.id },
          data: {
            aiEnabled:    true,
            status:       ConversationStatus.AI_ATENDENDO,
            assignedTo:   null,
            lastMessageAt: now,
          },
        }),
      ]);

      timedOutIds.push(conv.id);
      console.info(`[check-timeouts] Conversation ${conv.id} returned to AI after inactivity`);
    }

    return ok({ checked: humanConvs.length, timedOut: timedOutIds });
  } catch (err) {
    console.error("[POST /api/atendimento/handoff/check-timeouts]", err);
    return serverError();
  }
}
