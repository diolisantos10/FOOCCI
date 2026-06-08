/**
 * POST /api/admin/diagnostics/whatsapp-text-ordering/routing
 *
 * Live-routing READINESS check. Admin-only. Pure read-only: it never sends a
 * WhatsApp message, never creates an order, and never creates a Pix. It answers
 * a single question for a real test phone + restaurant:
 *
 *   "Would this inbound message route into WhatsApp Text Ordering, and if not,
 *    exactly which guard declined it?"
 *
 * This is the tool to run when a real allowlisted test message still falls back
 * to the old WhatsApp Agent flow. It resolves the restaurant slug → ID (the
 * allowlist is keyed by ID, not slug), normalises the phone the same way the
 * live webhook does, and reports the exact decision.
 *
 * Body:
 *   restaurantSlug  string   (or restaurantId — slug is resolved to ID)
 *   phone           string   any common BR format (+5511…, 5511…, 11…)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { maskPhone } from "@/lib/wa-text-ordering-flag";
import {
  getRoutingDecisionForRestaurant,
  getMessageAwareRoutingDecision,
  getRestaurantConfig,
} from "@/services/whatsapp/ordering/WhatsAppTextOrderingConfigService";

const bodySchema = z.object({
  restaurantSlug: z.string().min(1).max(100),
  phone:          z.string().min(4).max(40),
  // Optional sample message — when provided, the full message-aware routing
  // contract is evaluated (order intent OR active session), exactly as the live
  // webhook does. When omitted, only config-level eligibility is reported.
  message:        z.string().max(1000).optional(),
});

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

  const { restaurantSlug, phone, message } = parsed.data;

  // Allowlist is keyed by restaurant ID — resolve the slug so the admin can type
  // the human-friendly slug while we compare against the real ID.
  const restaurant = await prisma.restaurant.findFirst({
    where:  { OR: [{ slug: restaurantSlug }, { id: restaurantSlug }] },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    return NextResponse.json(
      { error: `Restaurante não encontrado: "${restaurantSlug}"` },
      { status: 404 },
    );
  }

  // The live webhook receives the phone as an E.164 JID (e.g. "+5511999990000").
  // We accept any format and report what the DB-aware gate sees.
  const decision = await getRoutingDecisionForRestaurant(restaurant.id, phone);
  const dbConfig = await getRestaurantConfig(restaurant.id);

  // Message-aware verdict — the FULL live routing contract. Only computed when a
  // sample message is supplied. This is the part that distinguishes "Bom dia"
  // (→ old agent) from "Quero 1 yakisoba" (→ Text Ordering).
  const messageAware = message !== undefined && message.trim().length > 0
    ? await getMessageAwareRoutingDecision({
        restaurantId:   restaurant.id,
        phone,
        messageText:    message,
        conversationId: null,
      })
    : null;

  return NextResponse.json({
    restaurant,
    input: {
      phone,
      phoneMasked: maskPhone(phone),
      message:     message ?? null,
    },
    flags: {
      masterEnabled:         decision.masterEnabled,
      globalKillSwitch:      decision.globalKillSwitch ?? false,
      paused:                decision.paused,
      mode:                  decision.mode,
      scope:                 decision.scope,
      restaurantAllowlisted: decision.restaurantAllowlisted,
      enabledForRestaurant:  decision.enabledForRestaurant,
      phoneAllowlisted:      decision.phoneAllowlisted,
      source:                decision.source ?? "env",
      dbConfigPresent:       decision.dbConfigPresent ?? false,
    },
    dbConfig: dbConfig
      ? {
          enabled: dbConfig.enabled,
          mode:    dbConfig.mode,
          scope:   dbConfig.scope,
          paused:  dbConfig.paused,
          phones:  dbConfig.allowlistedPhones.length,
        }
      : null,
    // Config-level eligibility (restaurant+phone only). NOT the final routing
    // verdict when a message is provided — see `messageAware` below.
    configEligible: decision.shouldUseTextOrdering,
    declineReason:  decision.declineReason,
    // Full message-aware contract result. When present, this is the authoritative
    // live verdict; identical logic to the Evolution webhook gate.
    messageAware: messageAware
      ? {
          routingEligible:          messageAware.routingEligible,
          activeSession:            messageAware.hasActiveSession,
          detectedIntent:           messageAware.detectedIntent,
          messageHasOrderIntent:    messageAware.messageHasOrderIntent,
          wouldRouteToTextOrdering: messageAware.wouldRouteToTextOrdering,
          finalHandler:             messageAware.finalHandler,
          declineReason:            messageAware.declineReason,
        }
      : null,
    // Backward-compatible top-level verdict: message-aware when a message was
    // supplied, else config-level eligibility.
    wouldRouteToTextOrdering: messageAware
      ? messageAware.wouldRouteToTextOrdering
      : decision.shouldUseTextOrdering,
    finalHandler: messageAware
      ? messageAware.finalHandler
      : (decision.shouldUseTextOrdering ? "TEXT_ORDERING" : "OLD_WHATSAPP_AGENT"),
    hint: buildHint(decision, messageAware),
    sideEffects: "none — this check never sends WhatsApp, creates orders, or generates Pix",
  });
}

function buildHint(
  decision: { shouldUseTextOrdering: boolean; globalKillSwitch?: boolean; source?: string; declineReason: string | null },
  messageAware: { wouldRouteToTextOrdering: boolean; finalHandler: string; detectedIntent: string; hasActiveSession: boolean; declineReason: string | null } | null,
): string {
  // When a sample message is supplied, the message-aware contract is authoritative.
  if (messageAware) {
    if (messageAware.wouldRouteToTextOrdering) {
      return "Pronto — esta mensagem entraria no Pedido por Texto (intenção de pedido ou sessão ativa).";
    }
    if (!decision.shouldUseTextOrdering) {
      // Config-level decline — surface the config reason (kill switch / paused / etc.).
      return decision.declineReason
        ?? "Configuração não elegível — ajuste no painel de controle acima.";
    }
    // Config is eligible, but the message is not order-like and there is no session.
    return `Mensagem tratada pelo Agente WhatsApp (host). Intenção detectada: ${messageAware.detectedIntent}; sessão ativa: ${messageAware.hasActiveSession ? "sim" : "não"}. Só entra no Pedido por Texto com intenção de pedido ou sessão ativa.`;
  }
  if (decision.shouldUseTextOrdering) {
    return "Configuração elegível. Envie uma mensagem de exemplo para ver o veredito final (pedido vs. saudação).";
  }
  if (decision.globalKillSwitch) {
    return "Bloqueado pelo kill switch global no Railway. Remova WHATSAPP_TEXT_ORDERING_ENABLED=false para liberar.";
  }
  if (decision.source === "env") {
    return "Nenhuma configuração salva no painel para este restaurante — usando variáveis de ambiente (Railway). Use o painel de controle abaixo para ativar sem mexer no Railway.";
  }
  return decision.declineReason ?? "Ajuste a configuração no painel de controle acima.";
}
