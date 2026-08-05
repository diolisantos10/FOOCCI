/**
 * Routing diagnostic — answers, for ONE specific phone, whether a real WhatsApp
 * message would enter the Text Order engine or fall back to the receptionist,
 * and why. Pure read: never sends WhatsApp, never creates
 * an order or Pix, never changes config. The phone is always MASKED in output.
 *
 * When no phone is given, it self-tests the FIRST allowlisted phone — letting
 * production validate the real test number without exposing it.
 */

import { prisma } from "@/lib/prisma";
import {
  resolveWaConfig,
  getMessageAwareRoutingDecision,
} from "./WhatsAppTextOrderingConfigService";
import { isPhoneInList, maskPhone } from "@/lib/wa-text-ordering-flag";

export interface RoutingDiagnosticInput {
  restaurantId?: string;
  restaurantSlug?: string;
  /** Phone to test (E.164-ish). Omitted → first allowlisted phone (self-test). */
  phone?: string;
}

export interface ConversationBlock {
  conversationId: string;
  status: string;
  aiEnabled: boolean;
  aiLocked: boolean;
  reason: string;
  /** Safe manual fix — never executed automatically. */
  suggestedUnblock: string;
}

export interface RoutingDiagnosticResult {
  ok: boolean;
  restaurantSlug: string | null;
  restaurantName: string | null;
  phoneMasked: string | null;
  phoneSource: "input" | "allowlist" | "none";
  enabled: boolean;
  paused: boolean;
  scope: string;
  mode: string;
  phoneInAllowlist: boolean;
  wouldEnterTextOrder: boolean;
  wouldFallbackToReceptionist: boolean;
  declineReason: string | null;
  /** First machine stage when entering fresh (always IDLE for a new session). */
  firstStage: "IDLE" | null;
  /** True when an ACTIVE ordering session already exists for this phone. */
  hasActiveSession: boolean;
  conversationBlocks: ConversationBlock[];
  effectiveDecision:
    | "TEXT_ORDER_FULL_TEST"
    | "TEXT_ORDER_REPLY_ONLY"
    | "TEXT_ORDER_SILENT_DRY_RUN"
    | "RECEPTIONIST"
    | "UNKNOWN_RESTAURANT"
    | "NO_PHONE_TO_TEST";
  /** Exact payload to add the phone — returned ONLY, never applied. */
  addAllowlistPayload: { allowlistedPhones: string[] } | null;
  runtimeTouched: false;
  noWhatsAppSend: true;
  noRealOrder: true;
  noRealPix: true;
}

/** Conversation states that stop the AI from replying on the receptionist side. */
async function findConversationBlocks(restaurantId: string, phone: string): Promise<ConversationBlock[]> {
  const last8 = phone.replace(/\D/g, "").slice(-8);
  if (!last8) return [];
  const conversations = await prisma.conversation
    .findMany({
      where: {
        restaurantId,
        channel: "WHATSAPP",
        status: { notIn: ["RESOLVED"] },
        OR: [
          { customerPhone: { contains: last8 } },
          { customer: { phone: { contains: last8 } } },
        ],
      },
      select: { id: true, status: true, aiEnabled: true, aiLocked: true, aiLockedReason: true },
      orderBy: { lastMessageAt: "desc" },
      take: 3,
    })
    .catch(() => []);

  const blocks: ConversationBlock[] = [];
  for (const c of conversations) {
    if (c.aiLocked) {
      blocks.push({
        conversationId: c.id, status: c.status, aiEnabled: c.aiEnabled, aiLocked: true,
        reason: `IA bloqueada permanentemente (aiLocked${c.aiLockedReason ? `: ${c.aiLockedReason}` : ""})`,
        suggestedUnblock: "Desbloquear manualmente na Central de Atendimento (ação humana — remove o aiLocked).",
      });
    } else if (c.status === "HUMAN" || c.status === "HUMANO_ASSUMIU" || !c.aiEnabled) {
      blocks.push({
        conversationId: c.id, status: c.status, aiEnabled: c.aiEnabled, aiLocked: false,
        reason: `Conversa em atendimento humano (status=${c.status}, aiEnabled=${c.aiEnabled})`,
        suggestedUnblock: "Resolver/encerrar a conversa na Central (ou devolver para a IA) antes do teste.",
      });
    }
  }
  return blocks;
}

export async function runRoutingDiagnostic(input: RoutingDiagnosticInput): Promise<RoutingDiagnosticResult> {
  const base: RoutingDiagnosticResult = {
    ok: false, restaurantSlug: input.restaurantSlug ?? null, restaurantName: null,
    phoneMasked: null, phoneSource: "none",
    enabled: false, paused: false, scope: "?", mode: "?", phoneInAllowlist: false,
    wouldEnterTextOrder: false, wouldFallbackToReceptionist: true, declineReason: null,
    firstStage: null, hasActiveSession: false, conversationBlocks: [],
    effectiveDecision: "UNKNOWN_RESTAURANT", addAllowlistPayload: null,
    runtimeTouched: false, noWhatsAppSend: true, noRealOrder: true, noRealPix: true,
  };

  // Resolve restaurant.
  let restaurantId = input.restaurantId ?? null;
  if (!restaurantId && input.restaurantSlug) {
    const r = await prisma.restaurant
      .findFirst({ where: { slug: input.restaurantSlug }, select: { id: true, name: true } })
      .catch(() => null);
    restaurantId = r?.id ?? null;
    base.restaurantName = r?.name ?? null;
  }
  if (!restaurantId) {
    base.declineReason = "restaurante não encontrado";
    return base;
  }

  const config = await resolveWaConfig(restaurantId);
  base.enabled = config.enabled;
  base.paused = config.paused;
  base.scope = config.scope;
  base.mode = config.mode;

  // Resolve the phone under test (input or allowlist self-test).
  let phone = (input.phone ?? "").trim();
  if (phone) {
    base.phoneSource = "input";
  } else if (config.allowlistedPhones.length > 0) {
    phone = config.allowlistedPhones[0]!;
    base.phoneSource = "allowlist";
  } else {
    base.declineReason = "nenhum telefone informado e allowlist vazia";
    base.effectiveDecision = "NO_PHONE_TO_TEST";
    return base;
  }
  base.phoneMasked = maskPhone(phone);
  base.phoneInAllowlist = isPhoneInList(phone, config.allowlistedPhones);

  // The REAL webhook gate, message-aware (synthetic order message, read-only).
  const decision = await getMessageAwareRoutingDecision({
    restaurantId,
    phone,
    messageText: "quero fazer um pedido",
  });

  base.ok = true;
  base.hasActiveSession = decision.hasActiveSession;
  base.wouldEnterTextOrder = decision.wouldRouteToTextOrdering;
  base.wouldFallbackToReceptionist = !decision.wouldRouteToTextOrdering || decision.effectiveFinalHandler === "OLD_WHATSAPP_AGENT";
  base.declineReason = decision.declineReason;
  base.firstStage = decision.wouldRouteToTextOrdering ? "IDLE" : null;

  if (!decision.wouldRouteToTextOrdering) {
    base.effectiveDecision = "RECEPTIONIST";
    if (!base.phoneInAllowlist && config.scope === "PHONE_ALLOWLIST") {
      base.declineReason =
        "O número testado não está na allowlist. Por isso ele cairá no recepcionista normal.";
      // Suggestion ONLY — never applied here.
      base.addAllowlistPayload = { allowlistedPhones: [...config.allowlistedPhones, phone] };
    }
  } else if (config.mode === "ALLOWLIST_FULL_TEST") {
    base.effectiveDecision = "TEXT_ORDER_FULL_TEST";
  } else if (config.mode === "ALLOWLIST_REPLY_ONLY") {
    base.effectiveDecision = "TEXT_ORDER_REPLY_ONLY";
  } else {
    base.effectiveDecision = "TEXT_ORDER_SILENT_DRY_RUN";
  }

  // Conversation-level blocks (receptionist AI locks) — reported, never changed.
  base.conversationBlocks = await findConversationBlocks(restaurantId, phone);

  return base;
}
