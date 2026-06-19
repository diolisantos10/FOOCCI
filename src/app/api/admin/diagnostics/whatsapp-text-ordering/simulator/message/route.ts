/**
 * POST /api/admin/diagnostics/whatsapp-text-ordering/simulator/message
 *
 * Safe WhatsApp conversation simulator. Admin-only.
 * HARD INVARIANTS — never violated regardless of input:
 *   ✗ Does NOT send real WhatsApp messages.
 *   ✗ Does NOT create real orders.
 *   ✗ Does NOT generate real Pix.
 *   ✗ Does NOT call Evolution send.
 *   ✗ Does NOT affect real customers.
 *   ✓ allowSideEffects=false always.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  processCustomerMessage,
  newTransientSession,
} from "@/services/whatsapp/ordering/WhatsAppTextOrderService";
import {
  getMessageAwareRoutingDecision,
} from "@/services/whatsapp/ordering/WhatsAppTextOrderingConfigService";
import { buildFullDraft } from "@/services/whatsapp/ordering/WhatsAppOrderDraftBuilder";
import type { WaPersistedSession } from "@/services/whatsapp/ordering/types";

const bodySchema = z.object({
  restaurantSlug: z.string().min(1).max(100),
  customerName:   z.string().min(1).max(100).default("Cliente"),
  customerPhone:  z.string().min(8).max(20).default("+5511999990000"),
  messageText:    z.string().min(1).max(2000),
  currentSession: z.record(z.unknown()).optional(),
  resetSession:   z.boolean().optional(),
  simulationMode: z.enum(["ROUTING_SIMULATION", "TEXT_ORDERING_ONLY"]).optional(),
});

// ── Old-agent simulation (safe canned responses, no real WA send) ─────────────

function simulateOldAgent(customerName: string, messageText: string): string {
  const t = messageText.toLowerCase().trim();
  const name = customerName.trim() || "Cliente";

  if (/^(oi+|ol[aá]+|bom\s+dia|boa\s+tarde|boa\s+noite|hey|hi|e\s*a[íi]|eai|opa|tudo\s+bem)[\s!.,?]*$/i.test(t)) {
    return (
      `Olá, ${name}! Tudo bem? 😊 Como posso te ajudar hoje?\n\n` +
      `1️⃣ Já sei o que quero pedir\n` +
      `2️⃣ Ver cardápio\n\n` +
      `────────────\n\n` +
      `Outras opções:\n` +
      `3️⃣ Rodízio presencial\n` +
      `4️⃣ Horário de funcionamento\n` +
      `5️⃣ Promoções\n` +
      `6️⃣ Cazza Club\n` +
      `7️⃣ Falar com atendente\n\n` +
      `0. menu`
    );
  }

  if (/\b(card[aá]pio|menu|^2$)\b/i.test(t)) {
    return (
      `Perfeito! 😊 Clique no link abaixo para ver nosso cardápio e fazer seu pedido:\n\n` +
      `🍣 https://foocci.com.br/pedido/sushi-cazza\n\n` +
      `Assim que finalizar, me manda o pedido aqui e eu confirmo pra você! 🙌`
    );
  }

  if (/\b(hor[aá]rio|funciona(mento)?|abre|fecha|^4$)\b/i.test(t)) {
    return (
      `⏰ *Horários de funcionamento:*\n\n` +
      `Terça a Sexta: 18h às 23h\n` +
      `Sábado e Domingo: 12h às 23h\n\n` +
      `Qualquer dúvida, é só chamar! 😊`
    );
  }

  if (/\b(rod[ií]zio|^3$)\b/i.test(t)) {
    return (
      `🥢 *Rodízio Presencial*\n\n` +
      `Disponível aos sábados e domingos no almoço a partir das 12h.\n` +
      `Reservas pelo telefone ou DM no Instagram.\n\n` +
      `Quer saber mais? Responda "7" para falar com um atendente! 😊`
    );
  }

  if (/\b(promo[çc][oõ]e?s?|promo|desconto|^5$)\b/i.test(t)) {
    return `Confira nossas promoções no cardápio! 🎉\n\nhttps://foocci.com.br/pedido/sushi-cazza`;
  }

  if (/\b(cazza\s*club|^6$)\b/i.test(t)) {
    return `🏆 *Cazza Club*\n\nO programa de fidelidade do Sushi Cazza!\n\nAcumule pontos a cada pedido e troque por desconto. Entre em contato para saber mais! 😊`;
  }

  if (/\b(atendente|humano|pessoa|falar|^7$)\b/i.test(t)) {
    return `Claro! Vou te transferir para um atendente agora. 🤝\n\nAguarda um momentinho...`;
  }

  // Generic fallback
  return (
    `Olá, ${name}! 😊 Como posso te ajudar?\n\n` +
    `1️⃣ Já sei o que quero pedir\n` +
    `2️⃣ Ver cardápio\n\n` +
    `────────────\n\n` +
    `Outras opções:\n` +
    `3️⃣ Rodízio presencial\n` +
    `4️⃣ Horário de funcionamento\n` +
    `5️⃣ Promoções\n` +
    `6️⃣ Cazza Club\n` +
    `7️⃣ Falar com atendente\n\n` +
    `0. menu`
  );
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Entrada inválida.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    restaurantSlug,
    customerName,
    customerPhone,
    messageText,
    currentSession,
    resetSession,
    simulationMode,
  } = parsed.data;

  // Tenant isolation: slug → restaurantId (never trust client tenant)
  const restaurant = await prisma.restaurant.findFirst({
    where:  { slug: restaurantSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    return NextResponse.json(
      { error: `Restaurante não encontrado: "${restaurantSlug}"` },
      { status: 404 },
    );
  }

  // ── Routing decision (pure read, no side effects) ─────────────────────────────
  const routing = await getMessageAwareRoutingDecision({
    restaurantId: restaurant.id,
    phone:        customerPhone,
    messageText,
  });

  const safetyNotes: string[] = [
    "simulator=true — nenhuma mensagem WhatsApp enviada",
    "allowSideEffects=false (hard-coded, não configurável)",
    "nenhum pedido real criado",
    "nenhum Pix real gerado",
    "nenhuma campanha disparada",
    "Evolution send nunca chamado",
  ];
  const sideEffectsPerformed: string[] = [];

  // ── Session hydration (client passes JSON, server rehydrates dates) ──────────
  // Simulator uses ALLOWLIST_REPLY_ONLY so the UI shows realistic replies.
  const mode = "ALLOWLIST_REPLY_ONLY" as const;

  let session: WaPersistedSession | null = null;
  if (!resetSession && currentSession && Object.keys(currentSession).length > 0) {
    const s = currentSession as Record<string, unknown>;
    session = {
      ...(newTransientSession({ restaurantId: restaurant.id, phone: customerPhone, mode })),
      ...(s as object),
      restaurantId:  restaurant.id,    // never trust client tenant claim
      phone:         customerPhone,
      lastMessageAt: new Date(),
    } as WaPersistedSession;
  }

  const stageBefore = session?.stage ?? "IDLE";

  // ── Route to text-ordering engine or old-agent simulation ────────────────────
  const useTextOrdering =
    routing.effectiveFinalHandler === "TEXT_ORDERING" ||
    simulationMode === "TEXT_ORDERING_ONLY";

  let botReply: string;
  let processResult = null;
  const finalHandler = useTextOrdering ? "TEXT_ORDERING" : "OLD_WHATSAPP_AGENT";

  if (useTextOrdering) {
    processResult = await processCustomerMessage({
      restaurantId:     restaurant.id,
      restaurantSlug:   restaurant.slug,
      phone:            customerPhone,
      messageText,
      mode,
      currentSession:   session,
      allowSideEffects: false,          // ← never changes
    });

    botReply = processResult.suggestedReply;
    session  = processResult.session;
    safetyNotes.push(...(processResult.safetyNotes ?? []));
  } else {
    // Old WhatsApp Agent: safe canned simulation, no live infrastructure
    botReply = simulateOldAgent(customerName, messageText);
    // Session not advanced by old agent
  }

  const stageAfter = session?.stage ?? "IDLE";

  // ── Build comanda from session ────────────────────────────────────────────────
  let comanda = null;
  if (session && session.selectedItems.length > 0) {
    try {
      comanda = buildFullDraft(session);
    } catch {
      // non-critical — draft build failures don't abort the turn
    }
  }

  return NextResponse.json({
    restaurant:           { id: restaurant.id, name: restaurant.name, slug: restaurant.slug },
    botReply,
    finalHandler,
    detectedIntent:       processResult?.intent ?? routing.detectedIntent,
    stageBefore,
    stageAfter,
    session:              session ?? null,
    comanda:              comanda ?? null,
    missingInfo:          processResult?.missingQuestions ?? session?.missingQuestions ?? [],
    paymentInfo:          processResult?.payment ?? null,
    deliveryType:         session?.deliveryType ?? null,
    sideEffectsPerformed,
    safetyNotes,
    routing: {
      routingEligible:          routing.routingEligible,
      hasActiveSession:         routing.hasActiveSession,
      detectedIntent:           routing.detectedIntent,
      messageHasOrderIntent:    routing.messageHasOrderIntent,
      wouldRouteToTextOrdering: routing.wouldRouteToTextOrdering,
      finalHandler:             routing.finalHandler,
      effectiveFinalHandler:    routing.effectiveFinalHandler,
      replyCapable:             routing.replyCapable,
      declineReason:            routing.declineReason,
      mode:                     routing.config.mode,
      scope:                    routing.config.scope,
    },
    rawDebug: {
      processResult:   processResult ?? null,
      routingFull:     routing,
    },
  });
}
