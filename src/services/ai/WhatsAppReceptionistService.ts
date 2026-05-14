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
  /veio errado|vei errado|reclamação|reclamacao|problema com|atrasou|não gostei|nao gostei|insatisfeito|cancelar pedido|reembolso|errou|está errado|ta errado|tá errado/i;
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
  /pix|cartão|cartao|como pago|forma de pagamento|aceita.*pagamento|parcela/i;
const ORDER_STATUS_RE =
  /cadê (meu|o) pedido|cadê meu|status do pedido|acompanhar (meu )?pedido|onde está meu|quanto tempo (falta|demora)|previsão de entrega|previsao de entrega/i;

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
}

// ─── reply builders ───────────────────────────────────────────

/** Formats the configured menu options as a numbered text list. */
function buildMenuList(options: MenuOption[]): string {
  if (options.length === 0) return "";
  return "\n\n" + options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
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
      return opt.message?.trim() || ctx.welcomeMessage;
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
        return ctx.welcomeMessage + menuList + "\n\nResponda com o número da opção desejada 😊";
      }
      return ctx.welcomeMessage + (pedidoUrl ? `\n\nCardápio: ${pedidoUrl}` : "");
    }

    case "ORDER":
    case "MENU_REQUEST":
      return pedidoUrl
        ? `${ctx.orderPreMessage}\n\n${pedidoUrl}`
        : "Para ver nosso cardápio, entre em contato com a loja. 😊";

    case "HOURS_REQUEST":
      return pedidoUrl
        ? `Para conferir nossos horários atualizados, acesse nosso cardápio ou entre em contato com a loja:\n${pedidoUrl}`
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
        ? `As formas de pagamento aceitas estão disponíveis no nosso cardápio online:\n${pedidoUrl}`
        : "Para informações sobre formas de pagamento, entre em contato com a loja.";

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
        return `Não entendi bem. Você pode escolher uma das opções:${menuList}\n\nOu responda com o número da opção desejada 😊`;
      }
      return pedidoUrl
        ? `Não entendi bem, mas posso te ajudar! Acesse nosso cardápio ou peça para falar com nossa equipe:\n\nCardápio: ${pedidoUrl}`
        : `Não entendi bem. Se precisar de ajuda, é só pedir que chamarei alguém da equipe.`;
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
    select:  { content: true },
  });

  if (!lastMessage) return;

  const { restaurantId } = conversation;

  // Load all config in parallel — no sequential round-trips
  const [restaurant, storeProfile, agentCfg, evolutionResult] = await Promise.all([
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

  const ctx: ReplyContext = {
    restaurantName:  restaurant?.name ?? "nossa loja",
    pedidoUrl,
    address,
    deliveryEnabled: storeProfile?.deliveryEnabled ?? false,
    welcomeMessage:  agentCfg?.welcomeMessage  ?? "Olá! Sou o assistente da loja 😊 Posso te enviar o cardápio ou conectar com nossa equipe.",
    orderPreMessage: agentCfg?.orderPreMessage ?? "Você pode fazer seu pedido pelo nosso cardápio aqui:",
    handoffMessage:  agentCfg?.handoffMessage  ?? "Claro. Vou deixar essa conversa para a equipe da loja te atender. 👋",
    agentMode,
    menuOptions,
  };

  // Check if customer selected a numbered or named menu option first
  const selectedOpt = detectSelectedOption(lastMessage.content, menuOptions);

  let replyText: string;
  let triggerHandoff: boolean;

  if (selectedOpt) {
    replyText     = buildFlowReply(selectedOpt, ctx);
    triggerHandoff = selectedOpt.flow === "handoff";
  } else {
    const intent  = detectIntent(lastMessage.content);
    replyText     = buildReply(intent, ctx);
    triggerHandoff = needsHandoff(intent, agentMode);
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

  // Send reply and log the outbound message
  const toPhone = conversation.customer.phone.replace(/^\+/, "");
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
