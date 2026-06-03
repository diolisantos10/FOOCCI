/**
 * POST /api/customers/[id]/send-whatsapp
 *
 * Send a one-off manual WhatsApp message to a single customer.
 * Creates or reuses the customer's WhatsApp conversation and records
 * the outbound message so it appears in Central de Conversas.
 *
 * This is NOT a campaign — no CampaignExecution is created.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { isGuestIdentifier } from "@/lib/guest";
import { isInternalCommandText } from "@/services/buildos/BuildCommandRouter";
import { ok, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";
import { ConversationStatus } from "@prisma/client";

const bodySchema = z.object({
  message: z.string().min(1).max(4096),
});

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Mensagem inválida ou vazia.");

    const { message } = parsed.data;

    if (isInternalCommandText(message)) {
      return badRequest("Comandos internos (/build, /cmd, /prompt) não podem ser enviados via WhatsApp manual.");
    }

    // ── Load & validate customer ───────────────────────────────────────────────
    const customer = await prisma.customer.findUnique({
      where:  { id: params.id },
      select: { id: true, name: true, phone: true, restaurantId: true, contactStatus: true },
    });

    if (!customer || customer.restaurantId !== ctx.restaurantId) {
      return notFound("Cliente não encontrado.");
    }

    const phone = customer.phone;

    if (!phone || isGuestIdentifier(phone) || phone.length < 8) {
      return badRequest("Cliente sem telefone válido.");
    }

    if (customer.contactStatus === "OPT_OUT") {
      return badRequest("Cliente optou por não receber mensagens (opt-out).");
    }

    // ── Load Evolution config ──────────────────────────────────────────────────
    const configResult = await EvolutionConfigService.getSnapshot(ctx.restaurantId);
    if (!configResult.ok) {
      return badRequest("WhatsApp não configurado para este restaurante.");
    }
    const evoConfig = configResult.data;

    // ── Find or create WhatsApp conversation ──────────────────────────────────
    const toPhone = phone.replace(/^\+/, "");

    const existingConv = await prisma.conversation.findFirst({
      where: {
        restaurantId: ctx.restaurantId,
        customerId:   customer.id,
        channel:      "WHATSAPP",
        status:       { in: [ConversationStatus.OPEN, ConversationStatus.BOT, ConversationStatus.HUMAN] },
      },
      orderBy: { lastMessageAt: "desc" },
      select:  { id: true },
    });

    const conversationId = existingConv?.id ?? (await prisma.conversation.create({
      data: {
        restaurantId:  ctx.restaurantId,
        customerId:    customer.id,
        channel:       "WHATSAPP",
        status:        ConversationStatus.OPEN,
        customerPhone: phone,
        customerName:  customer.name,
      },
      select: { id: true },
    })).id;

    // ── Send via Evolution ─────────────────────────────────────────────────────
    const evoResult = await EvolutionClient.sendTextMessage(evoConfig, toPhone, message);

    // ── Record outbound message in conversation ────────────────────────────────
    const now = new Date();
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          direction:         "OUTBOUND",
          senderType:        "HUMAN",
          content:           message,
          type:              "TEXT",
          sentAt:            now,
          externalMessageId: evoResult.key.id,
          externalStatus:    "sent",
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data:  { lastMessageAt: now },
      }),
    ]);

    return ok({ conversationId, externalMessageId: evoResult.key.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    console.error("[POST /api/customers/[id]/send-whatsapp]", err);
    if (msg.toLowerCase().includes("not configured") || msg.toLowerCase().includes("evolution")) {
      return badRequest("WhatsApp não conectado. Verifique a integração.");
    }
    return serverError("Falha ao enviar mensagem via WhatsApp.");
  }
}
