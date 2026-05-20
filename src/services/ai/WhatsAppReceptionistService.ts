/**
 * WhatsAppReceptionistService
 *
 * Receptionist / host agent for WhatsApp.
 * Default WhatsApp behavior — active when agentMode = "RECEPTIONIST_ONLY" or "HUMAN_ASSISTED".
 *
 * Responsibilities:
 *   - Greet customer and display the configured menu options.
 *   - Detect intent from free-text messages using deterministic keyword rules.
 *   - Handle numeric/label menu option selection.
 *   - Route ORDER / MENU requests to the /pedido/[slug] link.
 *   - Hand off to human operator on: HUMAN_REQUEST, COMPLAINT, ORDER_STATUS.
 *   - In HUMAN_ASSISTED mode: also hand off on UNKNOWN.
 *   - Set conversation.status = HUMAN + aiEnabled = false on handoff.
 *   - Log all outbound replies to Conversation.
 *
 * Intentionally does NOT:
 *   - Run a full sales/checkout flow inside WhatsApp.
 *   - Add items to an OrderDraft.
 *   - Ask for payment, address collection, or order confirmation.
 *   - Hallucinate product names, prices, or promotions.
 *   - Act as the Waiter Agent.
 */

import { prisma } from "@/lib/prisma";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { ConversationStatus } from "@prisma/client";
import type { MenuOption } from "@/validators/whatsapp-agent";
import { RestaurantKnowledgeService } from "@/services/knowledge/RestaurantKnowledgeService";

// ─── constants ────────────────────────────────────────────────

const EMOJI_NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"] as const;
const DAY_NAMES_PT  = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

// ─── intent detection ─────────────────────────────────────────

type Intent =
  | "GREETING"
  | "ORDER"
  | "MENU_REQUEST"
  | "HUMAN_REQUEST"
  | "HOURS_REQUEST"
  | "ADDRESS_REQUEST"
  | "DELIVERY_REQUEST"
  | "PAYMENT_INFO"
  | "ORDER_STATUS"
  | "COMPLAINT"
  | "UNKNOWN";

const COMPLAINT_RE =
  /veio errado|vei errado|reclamação|reclamacao|problema com|atrasou|não gostei|nao gostei|insatisfeito|cancel(a|ar)|reembolso|errou|está errado|ta errado|tá errado/i;
const HUMAN_RE =
  /atendente|atendimento humano|falar com (alguém|alguem|pessoa|humano)|quero ser atendido|chamar (a )?equipe|responsável|responsavel|gerente|quero falar com/i;
const GREETING_RE =
  /^(oi|olá|ola|oii|bom dia|boa tarde|boa noite|hey|hi|hello|e aí|eai|tudo bem|tudo bom|pode ajudar|boas|fala)\b/i;
const ORDER_RE =
  /quero (pedir|comprar)|fazer (um )?pedido|como (peço|fa[çc]o pedido)|link do pedido|quero fazer pedido/i;
const MENU_RE =
  /cardápio|cardapio|menu|ver (o )?menu|ver produtos/i;
const HOURS_RE =
  /horário|horario|que horas|quando (abre|fecha|funciona)|funcionamento|horários de/i;
const ADDRESS_RE =
  /endereço|endereco|onde fica|localização|localizacao|como chegar|qual (é|e) o endere/i;
const DELIVERY_RE =
  /entrega|delivery|entregam|faz entrega|vocês entregam|voces entregam|área de entrega|area de entrega/i;
const PAYMENT_RE =
  /pix|cartão|cartao|como pago|formas? de pagamento|aceita.*pagamento|parcela/i;
const ORDER_STATUS_RE =
  /cadê (meu|o) pedido|cadê meu|status (do|de) (meu |o )?pedido|acompanhar (meu )?pedido|onde está meu|quanto tempo (falta|demora)|previsão de entrega|previsao de entrega/i;

function detectIntent(text: string): Intent {
  const t = text.toLowerCase().trim();
  // Complaint and human request take priority — never silently ignore them.
  if (COMPLAINT_RE.test(t))    return "COMPLAINT";
  if (HUMAN_RE.test(t))        return "HUMAN_REQUEST";
  if (GREETING_RE.test(t))     return "GREETING";
  if (ORDER_RE.test(t))        return "ORDER";
  if (MENU_RE.test(t))         return "MENU_REQUEST";
  if (HOURS_RE.test(t))        return "HOURS_REQUEST";
  if (ADDRESS_RE.test(t))      return "ADDRESS_REQUEST";
  if (DELIVERY_RE.test(t))     return "DELIVERY_REQUEST";
  if (PAYMENT_RE.test(t))      return "PAYMENT_INFO";
  if (ORDER_STATUS_RE.test(t)) return "ORDER_STATUS";
  return "UNKNOWN";
}

/**
 * Detects if the customer selected a numbered or named menu option.
 * Supports: "1", "2", "3" (by position) or exact label match.
 */
function detectSelectedOption(text: string, options: MenuOption[]): MenuOption | null {
  if (options.length === 0) return null;
  const t = text.trim();
  if (/^\d+$/.test(t)) {
    const idx = parseInt(t, 10) - 1;
    return options[idx] ?? null;
  }
  const lower = t.toLowerCase();
  return options.find((o) => o.label.toLowerCase() === lower) ?? null;
}

// ─── context ──────────────────────────────────────────────────

interface ReplyContext {
  restaurantName:  string;
  pedidoUrl:       string | null;
  address:         string | null;
  deliveryEnabled: boolean;
  welcomeMessage:  string;
  orderPreMessage: string;
  handoffMessage:  string;
  agentMode:       string;
  menuOptions:     MenuOption[];
  hoursText:       string | null;
}

// ─── reply builders ───────────────────────────────────────────

/** Formats the configured menu options as an emoji-numbered text list. */
function buildMenuList(options: MenuOption[]): string {
  if (options.length === 0) return "";
  return "\n\n" + options.map((o, i) => `${EMOJI_NUMBERS[i] ?? `${i + 1}.`} ${o.label}`).join("\n");
}

/** Builds the reply for a specific selected menu option (by number or label). */
function buildFlowReply(opt: MenuOption, ctx: ReplyContext): string {
  const { orderPreMessage, pedidoUrl, handoffMessage } = ctx;
  switch (opt.flow) {
    case "order":
      return orderPreMessage + (pedidoUrl ? `\n${pedidoUrl}` : "");
    case "handoff":
      return handoffMessage;
    case "menu":
      return pedidoUrl
        ? `Aqui está nosso cardápio:\n${pedidoUrl}`
        : "Entre em contato com a loja para acessar o cardápio.";
    case "promotions":
      return pedidoUrl
        ? `Confira nossas promoções atuais:\n${pedidoUrl}`
        : "Entre em contato com a loja para saber sobre nossas promoções.";
    case "custom":
      if (opt.message?.trim()) return opt.message.trim();
      // No static message set — fall back to hours text (hours option) or welcome
      return ctx.hoursText ?? ctx.welcomeMessage;
    default:
      return ctx.welcomeMessage;
  }
}

function buildReply(intent: Intent, ctx: ReplyContext): string {
  const { pedidoUrl, address, deliveryEnabled, restaurantName, menuOptions, agentMode } = ctx;

  switch (intent) {
    case "GREETING": {
      const menuList = buildMenuList(menuOptions);
      if (menuList) {
        return ctx.welcomeMessage + menuList + "\n\nResponda com o número da opção 😊";
      }
      return ctx.welcomeMessage + (pedidoUrl ? `\n\nCardápio: ${pedidoUrl}` : "");
    }

    case "ORDER":
    case "MENU_REQUEST":
      return pedidoUrl
        ? `${ctx.orderPreMessage}\n\n${pedidoUrl}`
        : "Para ver nosso cardápio, entre em contato com a loja. 😊";

    case "HOURS_REQUEST":
      if (ctx.hoursText) {
        return ctx.hoursText + (pedidoUrl ? `\n\n📱 Cardápio: ${pedidoUrl}` : "");
      }
      return pedidoUrl
        ? `Para conferir nossos horários, acesse nosso cardápio:\n${pedidoUrl}`
        : "Para saber nossos horários, entre em contato diretamente com a loja.";

    case "ADDRESS_REQUEST":
      if (address) {
        return `Estamos em: ${address}` + (pedidoUrl ? `\n\nCardápio: ${pedidoUrl}` : "");
      }
      return pedidoUrl
        ? `Para mais informações sobre nossa localização, acesse:\n${pedidoUrl}`
        : "Para informações de endereço, entre em contato com a loja.";

    case "DELIVERY_REQUEST":
      if (deliveryEnabled) {
        return pedidoUrl
          ? `Sim, fazemos entrega! 🛵 Faça seu pedido aqui:\n${pedidoUrl}`
          : "Sim, fazemos entrega! Entre em contato com a loja para mais detalhes.";
      }
      return pedidoUrl
        ? `No momento trabalhamos com retirada no local. 😊 Veja nosso cardápio:\n${pedidoUrl}`
        : "No momento trabalhamos com retirada no local. Entre em contato para mais informações.";

    case "PAYMENT_INFO":
      return pedidoUrl
        ? `As opções de pagamento ficam visíveis ao finalizar o pedido no nosso cardápio:\n${pedidoUrl}`
        : "Para saber as formas de pagamento aceitas, entre em contato com a loja. Nossa equipe vai te ajudar! 😊";

    // ORDER_STATUS and COMPLAINT always hand off — message matches handoffMessage.
    case "ORDER_STATUS":
    case "HUMAN_REQUEST":
    case "COMPLAINT":
      return ctx.handoffMessage;

    case "UNKNOWN":
    default: {
      // HUMAN_ASSISTED mode escalates faster — any unrecognized message goes to human.
      if (agentMode === "HUMAN_ASSISTED") {
        return ctx.handoffMessage;
      }
      const menuList = buildMenuList(menuOptions);
      if (menuList) {
        return `Desculpe, não entendi. Como posso te ajudar?${menuList}\n\nResponda com o número da opção 😊`;
      }
      return pedidoUrl
        ? `Desculpe, não entendi. Posso te enviar nosso cardápio ou conectar com nossa equipe:\n\nCardápio: ${pedidoUrl}`
        : `Desculpe, não entendi. Se precisar de ajuda, é só pedir que chamo alguém da equipe. 😊`;
    }
  }
}

/** Returns true when the conversation must be handed off to a human. */
function needsHandoff(intent: Intent, agentMode: string): boolean {
  return (
    intent === "HUMAN_REQUEST" ||
    intent === "COMPLAINT" ||
    intent === "ORDER_STATUS" ||
    (agentMode === "HUMAN_ASSISTED" && intent === "UNKNOWN")
  );
}

// ─── main service ─────────────────────────────────────────────

export class WhatsAppReceptionistService {
  static async respond(conversationId: string): Promise<void> {
    try {
      await run(conversationId);
    } catch (err) {
      console.error("[WhatsAppReceptionistService] Unhandled error:", err);
    }
  }
}

async function run(conversationId: string): Promise<void> {
  // Load conversation — include aiEnabled so we respect human takeovers
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id:           true,
      restaurantId: true,
      status:       true,
      aiEnabled:    true,
      customer:     { select: { phone: true, name: true } },
    },
  });

  // Skip if human is handling or AI has been disabled for this conversation
  if (
    !conversation ||
    !conversation.aiEnabled ||
    conversation.status === ConversationStatus.HUMAN ||
    conversation.status === ConversationStatus.RESOLVED
  ) {
    return;
  }

  if (!conversation.customer?.phone) {
    console.warn(`[WhatsAppReceptionistService] Conversation ${conversationId} has no customer phone`);
    return;
  }

  // Load the most recent inbound message to detect intent
  const lastMessage = await prisma.message.findFirst({
    where:   { conversationId, direction: "INBOUND" },
    orderBy: { sentAt: "desc" },
    select:  { content: true, type: true },
  });

  if (!lastMessage) return;

  const { restaurantId } = conversation;

  // Load all config in parallel — no sequential round-trips
  const [restaurant, storeProfile, agentCfg, evolutionResult, businessHoursRows] = await Promise.all([
    prisma.restaurant.findUnique({
      where:  { id: restaurantId },
      select: { name: true, slug: true, address: true },
    }),
    prisma.storeProfile.findUnique({
      where:  { restaurantId },
      select: { street: true, streetNumber: true, neighborhood: true, city: true, state: true, deliveryEnabled: true },
    }),
    prisma.whatsAppAgentConfig.findUnique({
      where:  { restaurantId },
      select: {
        agentMode:       true,
        welcomeMessage:  true,
        orderPreMessage: true,
        menuUrl:         true,
        menuOptions:     true,
        handoffMessage:  true,
      },
    }),
    EvolutionConfigService.getSnapshot(restaurantId),
    prisma.businessHours.findMany({
      where:   { restaurantId },
      select:  { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true },
      orderBy: { dayOfWeek: "asc" },
    }),
  ]);

  if (!evolutionResult.ok) {
    console.warn(`[WhatsAppReceptionistService] No active Evolution config for restaurant ${restaurantId}`);
    return;
  }

  // Build pedido URL — prefer explicit menuUrl from config, fall back to /pedido/[slug]
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const pedidoUrl =
    agentCfg?.menuUrl ||
    (restaurant?.slug && baseUrl ? `${baseUrl}/pedido/${restaurant.slug}` : null);

  // Build address string from structured StoreProfile, fall back to flat field
  let address: string | null = null;
  if (storeProfile?.street) {
    address = [
      storeProfile.street,
      storeProfile.streetNumber,
      storeProfile.neighborhood,
      storeProfile.city,
      storeProfile.state,
    ]
      .filter(Boolean)
      .join(", ");
  } else if (restaurant?.address) {
    address = restaurant.address;
  }

  // Parse menuOptions from JSON — cast is safe because the API validates with Zod
  const menuOptions: MenuOption[] = Array.isArray(agentCfg?.menuOptions)
    ? (agentCfg.menuOptions as unknown as MenuOption[])
    : [];

  const agentMode = agentCfg?.agentMode ?? "RECEPTIONIST_ONLY";

  // Build human-readable hours from BusinessHours rows
  const todayDow = new Date().getDay(); // 0 = Sunday … 6 = Saturday
  let hoursText: string | null = null;
  if (businessHoursRows.length > 0) {
    const todayRow = businessHoursRows.find((h) => h.dayOfWeek === todayDow);
    const todayStatus = todayRow
      ? todayRow.isOpen
        ? `Hoje (${DAY_NAMES_PT[todayDow] ?? ""}) estamos *abertos* das ${todayRow.openTime} às ${todayRow.closeTime}.\n\n`
        : `Hoje (${DAY_NAMES_PT[todayDow] ?? ""}) estamos *fechados*.\n\n`
      : "";
    const weekLines = businessHoursRows
      .map((h) => {
        const day = DAY_NAMES_PT[h.dayOfWeek] ?? `Dia ${h.dayOfWeek}`;
        return h.isOpen ? `${day}: ${h.openTime} – ${h.closeTime}` : `${day}: Fechado`;
      })
      .join("\n");
    hoursText = `${todayStatus}*Horários de funcionamento:*\n${weekLines}`;
  }

  const ctx: ReplyContext = {
    restaurantName:  restaurant?.name ?? "nossa loja",
    pedidoUrl,
    address,
    deliveryEnabled: storeProfile?.deliveryEnabled ?? false,
    welcomeMessage:  agentCfg?.welcomeMessage  ?? `Oi! 👋 Sou o atendimento de ${restaurant?.name ?? "nossa loja"}. Como posso te ajudar hoje?`,
    orderPreMessage: agentCfg?.orderPreMessage ?? "Acesse nosso cardápio e faça seu pedido diretamente:",
    handoffMessage:  agentCfg?.handoffMessage  ?? "Vou deixar nossa equipe te atender. Um momento! 👋",
    agentMode,
    menuOptions,
    hoursText,
  };

  const toPhone = conversation.customer.phone.replace(/^\+/, "");

  // Handle media messages gracefully — we cannot process images, audio, or documents.
  if (lastMessage.type !== "TEXT") {
    const mediaReply = ctx.pedidoUrl
      ? `Recebi sua mensagem! 😊 Posso te ajudar melhor por texto. Para fazer seu pedido:\n${ctx.pedidoUrl}`
      : "Recebi sua mensagem! 😊 Posso te ajudar melhor por texto. É só digitar o que você precisa!";
    await sendReply(evolutionResult.data, toPhone, mediaReply, conversationId);
    return;
  }

  // Check if customer selected a numbered or named menu option first
  const selectedOpt = detectSelectedOption(lastMessage.content, menuOptions);

  let replyText: string;
  let triggerHandoff: boolean;

  if (selectedOpt) {
    replyText      = buildFlowReply(selectedOpt, ctx);
    triggerHandoff = selectedOpt.flow === "handoff";
  } else {
    const intent = detectIntent(lastMessage.content);

    // Before using a template reply, check if the restaurant has an ACTIVE
    // knowledge item that better answers this specific question.
    // Knowledge answers take priority over generic templates for non-handoff intents.
    const knowledgeMatch =
      !needsHandoff(intent, agentMode) &&
      intent !== "GREETING" &&
      (await RestaurantKnowledgeService.findMatch(restaurantId, lastMessage.content).catch(() => null));

    if (knowledgeMatch) {
      replyText      = knowledgeMatch.answer;
      triggerHandoff = false;
      // Async — do not await to avoid blocking the reply
      RestaurantKnowledgeService.incrementUsage(knowledgeMatch.id).catch(() => {});
    } else {
      replyText      = buildReply(intent, ctx);
      triggerHandoff = needsHandoff(intent, agentMode);

      // When intent is UNKNOWN and no knowledge covers it, create a gap suggestion
      // so the owner can later fill in the correct answer.
      if (intent === "UNKNOWN" && !triggerHandoff) {
        RestaurantKnowledgeService.createGap(
          restaurantId,
          lastMessage.content,
          conversationId,
        ).catch(() => {});
      }
    }
  }

  // Transition conversation to HUMAN — set both status and aiEnabled so the
  // conversation appears correctly in Central de Conversas and AI does not
  // respond again until a human explicitly re-enables it.
  if (triggerHandoff) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data:  { status: ConversationStatus.HUMAN, aiEnabled: false },
    });
  }

  await sendReply(evolutionResult.data, toPhone, replyText, conversationId);
}

// ─── outbound helper ──────────────────────────────────────────

async function sendReply(
  config: { instanceName: string; baseUrl: string; apiKey: string },
  toPhone: string,
  text: string,
  conversationId: string
): Promise<void> {
  try {
    const result = await EvolutionClient.sendTextMessage(config, toPhone, text);
    const now = new Date();

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          direction:         "OUTBOUND",
          senderType:        "AI",
          content:           text,
          type:              "TEXT",
          sentAt:            now,
          externalMessageId: result.key.id,
          externalStatus:    "sent",
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data:  { lastMessageAt: now },
      }),
    ]);
  } catch (err) {
    console.error("[WhatsAppReceptionistService] Failed to send reply:", err);
  }
}
