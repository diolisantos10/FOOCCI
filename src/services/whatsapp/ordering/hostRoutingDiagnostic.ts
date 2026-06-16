/**
 * Host-routing diagnostic — for ONE phone + message, answers WHICH host would
 * reply (Text Order, Receptionist, human-blocked, ignored), WHY, and — when the
 * Receptionist is the host — PREVIEWS the reply and classifies it
 * (SAFE_MENU / LINK_CARDAPIO / HANDOFF / LOCATION / UNKNOWN).
 *
 * This closes the observability gap from docs/whatsapp-routing-raiox.md: the
 * existing routing diagnostic only covered the Text Order side. Pure read:
 * never sends WhatsApp, never calls Evolution, never creates an order or Pix,
 * never changes config. The phone is always MASKED in output.
 */

import { prisma } from "@/lib/prisma";
import {
  getMessageAwareRoutingDecision,
  resolveWaConfig,
  type MessageAwareRouteDecision,
} from "./WhatsAppTextOrderingConfigService";
import { maskPhone, isPhoneInList } from "@/lib/wa-text-ordering-flag";
import { getPublicMenuUrl } from "@/lib/public-url";
import { getPeriodsForRow, isInPeriod } from "@/lib/business-hours";
import {
  previewReceptionistResponse,
  type ReceptionistPreview,
  type ReplyContext,
} from "@/services/ai/WhatsAppReceptionistService";
import type { MenuOption } from "@/validators/whatsapp-agent";

export type HostDecision = "TEXT_ORDER" | "RECEPTIONIST" | "HUMAN_BLOCKED" | "IGNORED";

export interface HostRoutingInput {
  restaurantId?: string;
  restaurantSlug?: string;
  phone: string;
  message: string;
}

export interface HostRoutingResult {
  ok: boolean;
  phoneMasked: string | null;
  config: {
    mode: string;
    scope: string;
    enabled: boolean;
    paused: boolean;
    phoneInAllowlist: boolean;
  };
  decision: {
    host: HostDecision;
    reason: string;
    wouldEnterTextOrder: boolean;
    wouldFallbackToReceptionist: boolean;
  };
  receptionistPreview?: ReceptionistPreview;
  safety: { noEvolution: true; noRealOrder: true; noRealPix: true; runtimeTouched: false };
}

interface HumanBlock {
  status: string;
  aiEnabled: boolean;
  aiLocked: boolean;
  reason: string;
}

/**
 * Pure host verdict from the routing decision + any conversation-level human
 * block. Mirrors the webhook contract: a conversation in HUMAN/aiLocked is
 * answered by a human (never the AI); otherwise the effective handler decides
 * Text Order vs Receptionist (DRY_RUN downgrades to the receptionist).
 */
export function decideHost(
  decision: MessageAwareRouteDecision,
  block: HumanBlock | null,
): { host: HostDecision; reason: string } {
  if (block) {
    return { host: "HUMAN_BLOCKED", reason: block.reason };
  }
  if (decision.effectiveFinalHandler === "TEXT_ORDERING") {
    return {
      host: "TEXT_ORDER",
      reason: `Elegível + intenção de pedido/sessão; modo ${decision.config.mode} responde.`,
    };
  }
  // Everything else is handled by the old WhatsApp Agent (the receptionist host).
  return {
    host: "RECEPTIONIST",
    reason:
      decision.declineReason ??
      "Mensagem tratada pelo Agente WhatsApp (host) — sem rota para o Pedido por Texto.",
  };
}

/** Most relevant conversation-level AI block for this phone (read-only). */
async function findHumanBlock(restaurantId: string, phone: string): Promise<HumanBlock | null> {
  const last8 = phone.replace(/\D/g, "").slice(-8);
  if (!last8) return null;
  const convs = await prisma.conversation
    .findMany({
      where: {
        restaurantId,
        channel: "WHATSAPP",
        status: { notIn: ["RESOLVED"] },
        OR: [{ customerPhone: { contains: last8 } }, { customer: { phone: { contains: last8 } } }],
      },
      select: { status: true, aiEnabled: true, aiLocked: true, aiLockedReason: true },
      orderBy: { lastMessageAt: "desc" },
      take: 3,
    })
    .catch(() => []);
  for (const c of convs) {
    if (c.aiLocked) {
      return { status: c.status, aiEnabled: c.aiEnabled, aiLocked: true,
        reason: `IA bloqueada (aiLocked${c.aiLockedReason ? `: ${c.aiLockedReason}` : ""}) — humano responde.` };
    }
    if (c.status === "HUMAN" || c.status === "HUMANO_ASSUMIU" || !c.aiEnabled) {
      return { status: c.status, aiEnabled: c.aiEnabled, aiLocked: false,
        reason: `Conversa em atendimento humano (status=${c.status}, aiEnabled=${c.aiEnabled}).` };
    }
  }
  return null;
}

/** Builds a read-only ReplyContext mirroring the receptionist's deterministic loads. */
async function buildPreviewContext(restaurantId: string): Promise<ReplyContext> {
  const [restaurant, storeProfile, agentCfg, businessHours, menuCatalog] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, slug: true, address: true, timezone: true, isOrderingPaused: true, orderingPausedUntil: true },
    }),
    prisma.storeProfile.findUnique({
      where: { restaurantId },
      select: { street: true, streetNumber: true, neighborhood: true, city: true, state: true, deliveryEnabled: true },
    }).catch(() => null),
    prisma.whatsAppAgentConfig.findUnique({
      where: { restaurantId },
      select: { agentMode: true, agentName: true, welcomeMessage: true, orderPreMessage: true, menuUrl: true, menuOptions: true, handoffMessage: true },
    }).catch(() => null),
    prisma.businessHours.findMany({
      where: { restaurantId },
      select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, periodsJson: true },
      orderBy: { dayOfWeek: "asc" },
    }).catch(() => []),
    prisma.menuCategory.findMany({
      where: { restaurantId, isActive: true, isAvailable: true, showInDelivery: true },
      orderBy: { sortOrder: "asc" },
      select: { name: true, items: { where: { isActive: true, isAvailable: true, showInDelivery: true }, select: { name: true }, take: 5, orderBy: { sortOrder: "asc" } } },
    }).catch(() => [] as { name: string; items: { name: string }[] }[]),
  ]);

  let address: string | null = null;
  if (storeProfile?.street) {
    address = [storeProfile.street, storeProfile.streetNumber, storeProfile.neighborhood, storeProfile.city, storeProfile.state].filter(Boolean).join(", ");
  } else if (restaurant?.address) {
    address = restaurant.address;
  }

  // Open-now (timezone-aware), mirroring run()'s computation.
  const tz = restaurant?.timezone ?? "America/Sao_Paulo";
  const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
  const dow = localNow.getDay();
  const nowMin = localNow.getHours() * 60 + localNow.getMinutes();
  let isCurrentlyOpen = true;
  if (businessHours.length > 0) {
    const todayRow = businessHours.find((h) => h.dayOfWeek === dow);
    const periods = todayRow ? getPeriodsForRow(todayRow) : [];
    isCurrentlyOpen = periods.some((p) => isInPeriod(nowMin, p));
  }
  const isPaused = !!(restaurant?.isOrderingPaused && (restaurant.orderingPausedUntil === null || restaurant.orderingPausedUntil > new Date()));
  const effectivelyOpen = isCurrentlyOpen && !isPaused;

  const rawMenuOptions: MenuOption[] = Array.isArray(agentCfg?.menuOptions)
    ? (agentCfg!.menuOptions as unknown as MenuOption[])
    : [];
  const pedidoUrl = (agentCfg?.menuUrl?.trim() || (restaurant?.slug ? getPublicMenuUrl(restaurant.slug) : null)) ?? null;

  return {
    restaurantName:  restaurant?.name ?? "nossa loja",
    agentName:       agentCfg?.agentName?.trim() || "Assistente",
    customerName:    null,
    pedidoUrl,
    qrMenuUrl:       null,
    address,
    deliveryEnabled: storeProfile?.deliveryEnabled ?? false,
    welcomeMessage:  agentCfg?.welcomeMessage  ?? "Oi! 👋 Como posso te ajudar hoje?",
    orderPreMessage: agentCfg?.orderPreMessage ?? "Acesse nosso cardápio e faça seu pedido:",
    handoffMessage:  agentCfg?.handoffMessage  ?? "Vou deixar nossa equipe te atender. Um momento! 👋",
    agentMode:       agentCfg?.agentMode ?? "RECEPTIONIST_ONLY",
    menuOptions:     rawMenuOptions,
    hoursText:       null,
    isCurrentlyOpen: effectivelyOpen,
    closedMessage:   effectivelyOpen ? null : "No momento estamos fechados.",
    isPaused,
    pauseReason:     null,
    menuCatalog,
    instagramUrl:    null,
    tiktokUrl:       null,
  };
}

export async function runHostRoutingDiagnostic(input: HostRoutingInput): Promise<HostRoutingResult> {
  const base: HostRoutingResult = {
    ok: false,
    phoneMasked: input.phone ? maskPhone(input.phone) : null,
    config: { mode: "?", scope: "?", enabled: false, paused: false, phoneInAllowlist: false },
    decision: { host: "IGNORED", reason: "", wouldEnterTextOrder: false, wouldFallbackToReceptionist: true },
    safety: { noEvolution: true, noRealOrder: true, noRealPix: true, runtimeTouched: false },
  };

  // Resolve restaurant.
  let restaurantId = input.restaurantId ?? null;
  if (!restaurantId && input.restaurantSlug) {
    const r = await prisma.restaurant.findFirst({ where: { slug: input.restaurantSlug }, select: { id: true } }).catch(() => null);
    restaurantId = r?.id ?? null;
  }
  if (!restaurantId) {
    base.decision.reason = "restaurante não encontrado";
    return base;
  }

  // Phone omitted → self-test the FIRST allowlisted number (masked output), so
  // production can validate the allowlisted path without exposing the real phone.
  let phone = (input.phone ?? "").trim();
  if (!phone) {
    const cfg = await resolveWaConfig(restaurantId);
    phone = cfg.allowlistedPhones[0] ?? "";
  }
  if (!phone) {
    base.decision.reason = "telefone não informado e allowlist vazia";
    return base;
  }
  base.phoneMasked = maskPhone(phone);

  const decision = await getMessageAwareRoutingDecision({
    restaurantId,
    phone,
    messageText: input.message ?? "",
  });

  base.ok = true;
  base.config = {
    mode: decision.config.mode,
    scope: decision.config.scope,
    enabled: decision.config.enabledForRestaurant,
    paused: decision.config.paused,
    phoneInAllowlist: decision.config.phoneAllowlisted,
  };
  base.decision.wouldEnterTextOrder = decision.wouldRouteToTextOrdering;
  base.decision.wouldFallbackToReceptionist =
    !decision.wouldRouteToTextOrdering || decision.effectiveFinalHandler === "OLD_WHATSAPP_AGENT";

  const block = await findHumanBlock(restaurantId, phone);
  const { host, reason } = decideHost(decision, block);
  base.decision.host = host;
  base.decision.reason = reason;

  if (host === "RECEPTIONIST") {
    const ctx = await buildPreviewContext(restaurantId);
    base.receptionistPreview = previewReceptionistResponse(input.message ?? "", ctx);
  }

  return base;
}
