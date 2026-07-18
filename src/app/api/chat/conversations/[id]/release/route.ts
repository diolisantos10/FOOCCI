/**
 * POST /api/chat/conversations/[id]/release
 *
 * Return conversation to AI:
 * • aiEnabled  = true
 * • status     = AI_ATENDENDO
 * • assignedTo = null
 *
 * After the DB update, sends a WhatsApp message with the configured menu options
 * so the customer always sees the menu when the AI resumes.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";
import { ConversationStatus } from "@prisma/client";
import { sendWhatsAppText } from "@/services/whatsapp/activeProvider";
import { buildReturnToAiMessage } from "@/lib/return-to-ai-message";
import { getPublicMenuUrl } from "@/lib/public-url";
import type { MenuOption } from "@/validators/whatsapp-agent";

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
      select: {
        id:            true,
        restaurantId:  true,
        channel:       true,
        customerPhone: true,
        customer:      { select: { phone: true, name: true } },
      },
    });

    if (!conv || conv.restaurantId !== ctx.restaurantId) return notFound();

    const now = new Date();

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        aiEnabled:   true,
        status:      ConversationStatus.AI_ATENDENDO,
        assignedTo:  null,
        contextType: null, // clear CART_RECOVERY / CRM attribution so AI gate works on next inbound
      },
      select: { id: true, aiEnabled: true, status: true, assignedTo: true },
    });

    // Send return-to-AI message with menu options (WhatsApp only)
    if (conv.channel === "WHATSAPP") {
      // Channel phone (customerPhone) is the authoritative recipient (Meta wa_id, self-healed).
      const toPhone = (conv.customerPhone ?? conv.customer?.phone ?? "").replace(/^\+/, "");
      if (toPhone) {
        try {
          const [agentCfgData, restaurantData] = await Promise.all([
            prisma.whatsAppAgentConfig.findUnique({
              where:  { restaurantId: conv.restaurantId },
              select: { menuOptions: true, menuUrl: true },
            }),
            prisma.restaurant.findUnique({
              where:  { id: conv.restaurantId },
              select: { slug: true },
            }),
          ]);

          const menuOptions: MenuOption[] = Array.isArray(agentCfgData?.menuOptions)
            ? (agentCfgData.menuOptions as unknown as MenuOption[])
            : [];
          const baseMenuUrl =
            agentCfgData?.menuUrl?.trim() ||
            (restaurantData?.slug ? getPublicMenuUrl(restaurantData.slug) : null);

          const returnText = buildReturnToAiMessage({
            preamble:    "Estou de volta para te ajudar! 😊",
            menuOptions,
            baseMenuUrl,
            phone:       toPhone,
            name:        conv.customer?.name ?? null,
          });

          // Route through the ACTIVE provider (Meta or Evolution) — a migrated number has
          // no live Evolution instance, so the old hardcoded Evolution send returned HTTP 500.
          const sendRes = await sendWhatsAppText(conv.restaurantId, toPhone, returnText);
          if (sendRes.ok) {
            await prisma.$transaction([
              prisma.message.create({
                data: {
                  conversationId: id,
                  direction:      "OUTBOUND",
                  senderType:     "AI",
                  content:        returnText,
                  type:           "TEXT",
                  sentAt:         now,
                  provider:       sendRes.provider,
                  ...(sendRes.providerMessageId
                    ? { externalMessageId: sendRes.providerMessageId, providerMessageId: sendRes.providerMessageId }
                    : {}),
                },
              }),
              prisma.conversation.update({
                where: { id },
                data:  { lastMessageAt: now },
              }),
            ]);
          } else {
            console.error("[POST /api/chat/conversations/[id]/release] return message send failed", sendRes.provider, sendRes.errorCode, sendRes.error);
          }
        } catch (sendErr) {
          console.error("[POST /api/chat/conversations/[id]/release] Failed to send return message:", sendErr);
        }
      }
    }

    return ok(updated);
  } catch (err) {
    console.error("[POST /api/chat/conversations/[id]/release]", err);
    return serverError();
  }
}
