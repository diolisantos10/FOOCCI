/**
 * WhatsAppReceptionistService
 *
 * Receptionist / triage agent for WhatsApp.
 * Default WhatsApp behavior — active when agentMode = "RECEPTIONIST_ONLY" or "HUMAN_ASSISTED".
 *
 * Responsibilities:
 *   - Greet customer.
 *   - Answer basic questions (menu link, address, delivery availability).
 *   - Route customer to /pedido/[slug] for ordering.
 *   - Hand off to human operator when requested.
 *   - Log all outbound replies to Conversation.
 *
 * Intentionally does NOT:
 *   - Run a full sales/checkout flow.
 *   - Add items to an OrderDraft.
 *   - Ask for payment, address collection, or order confirmation.
 *   - Call OpenAI (fully deterministic, zero AI cost).
 */

import { prisma } from "@/lib/prisma";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { ConversationStatus } from "@prisma/client";

// ─── intent detection ─────────────────────────────────────────

type Intent =
  | "GREETING"
  | "MENU_REQUEST"
  | "HUMAN_REQUEST"
  | "HOURS_REQUEST"
  | "ADDRESS_REQUEST"
  | "DELIVERY_REQUEST"
  | "UNKNOWN";

const GREETING_RE =
  /^(oi|olá|ola|oii|bom dia|boa tarde|boa noite|hey|hi|hello|e aí|eai|tudo bem|tudo bom|pode ajudar|boas|fala)\b/i;
const MENU_RE =
  /cardápio|cardapio|menu|ver (o )?menu|quero (ver|pedir|comprar)|fazer pedido|como (peço|fa[çc]o pedido)|link do pedido|ver produtos/i;
const HUMAN_RE =
  /atendente|atendimento humano|falar com (alguém|alguem|pessoa|humano)|quero ser atendido|chamar (a )?equipe|responsável|responsavel|gerente|quero falar com/i;
const HOURS_RE =
  /horário|horario|que horas|quando (abre|fecha|funciona)|funcionamento|horários de/i;
const ADDRESS_RE =
  /endereço|endereco|onde fica|localização|localizacao|como chegar|qual (é|e) o endere/i;
const DELIVERY_RE =
  /entrega|delivery|entregam|faz entrega|vocês entregam|voces entregam|área de entrega|area de entrega/i;

function detectIntent(text: string): Intent {
  const t = text.toLowerCase().trim();
  if (GREETING_RE.test(t)) return "GREETING";
  if (MENU_RE.test(t))     return "MENU_REQUEST";
  if (HUMAN_RE.test(t))    return "HUMAN_REQUEST";
  if (HOURS_RE.test(t))    return "HOURS_REQUEST";
  if (ADDRESS_RE.test(t))  return "ADDRESS_REQUEST";
  if (DELIVERY_RE.test(t)) return "DELIVERY_REQUEST";
  return "UNKNOWN";
}

// ─── context types ────────────────────────────────────────────

interface ReplyContext {
  restaurantName: string;
  pedidoUrl:      string | null;
  address:        string | null;
  deliveryEnabled: boolean;
  welcomeMessage: string;
  orderPreMessage: string;
  handoffMessage: string;
}

// ─── reply builder ────────────────────────────────────────────

function buildReply(intent: Intent, ctx: ReplyContext): string {
  const { restaurantName, pedidoUrl, address, deliveryEnabled } = ctx;
  const menuLine = pedidoUrl
    ? `\n\nVeja nosso cardápio e faça seu pedido aqui: ${pedidoUrl}`
    : "";

  switch (intent) {
    case "GREETING":
      return `${ctx.welcomeMessage}${menuLine ? `\n\nPosso te enviar o cardápio ou te conectar com nossa equipe. 😊` : ""}`;

    case "MENU_REQUEST":
      if (pedidoUrl) {
        return `${ctx.orderPreMessage}\n\n${pedidoUrl}`;
      }
      return "Para ver nosso cardápio, entre em contato com a loja. 😊";

    case "HUMAN_REQUEST":
      return ctx.handoffMessage;

    case "HOURS_REQUEST":
      return pedidoUrl
        ? `Para conferir nossos horários atualizados, acesse nosso cardápio ou entre em contato com a loja: ${pedidoUrl}`
        : "Para saber nossos horários, entre em contato diretamente com a loja.";

    case "ADDRESS_REQUEST":
      if (address) return `Estamos em: ${address}${menuLine}`;
      return pedidoUrl
        ? `Para mais informações sobre nossa localização, acesse: ${pedidoUrl}`
        : "Para informações de endereço, entre em contato com a loja.";

    case "DELIVERY_REQUEST":
      if (deliveryEnabled) {
        return pedidoUrl
          ? `Sim, fazemos entrega! 🛵 Faça seu pedido aqui: ${pedidoUrl}`
          : `Sim, fazemos entrega! Entre em contato com a loja para mais detalhes.`;
      }
      return pedidoUrl
        ? `No momento trabalhamos com retirada no local. 😊 Veja nosso cardápio: ${pedidoUrl}`
        : "No momento trabalhamos com retirada no local. Entre em contato para mais informações.";

    case "UNKNOWN":
    default:
      return pedidoUrl
        ? `Olá! Posso te ajudar com informações sobre ${restaurantName} ou te enviar o cardápio para fazer seu pedido. 😊\n\nCardápio: ${pedidoUrl}\n\nSe preferir falar com nossa equipe, é só me dizer!`
        : `Olá! Posso te ajudar com informações sobre ${restaurantName}. Se preferir falar com nossa equipe, é só me dizer!`;
  }
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
  // Load conversation
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id:           true,
      restaurantId: true,
      customerId:   true,
      status:       true,
      customer:     { select: { phone: true, name: true } },
    },
  });

  if (
    !conversation ||
    conversation.status === ConversationStatus.HUMAN ||
    conversation.status === ConversationStatus.RESOLVED
  ) {
    return;
  }

  if (!conversation.customer) {
    console.warn(`[WhatsAppReceptionistService] Conversation ${conversationId} has no customer`);
    return;
  }

  // Load last inbound message
  const lastMessage = await prisma.message.findFirst({
    where:   { conversationId, direction: "INBOUND" },
    orderBy: { sentAt: "desc" },
    select:  { content: true },
  });

  if (!lastMessage) return;

  const { restaurantId } = conversation;

  // Load config in parallel
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
      select: { welcomeMessage: true, orderPreMessage: true, menuUrl: true, handoffMessage: true, agentName: true },
    }),
    EvolutionConfigService.getSnapshot(restaurantId),
  ]);

  if (!evolutionResult.ok) {
    console.warn(`[WhatsAppReceptionistService] No Evolution config for ${restaurantId}`);
    return;
  }

  // Build pedido URL
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const pedidoUrl =
    agentCfg?.menuUrl ||
    (restaurant?.slug && baseUrl ? `${baseUrl}/pedido/${restaurant.slug}` : null);

  // Build address string
  let address: string | null = null;
  if (storeProfile?.street) {
    const parts = [
      storeProfile.street,
      storeProfile.streetNumber,
      storeProfile.neighborhood,
      storeProfile.city,
      storeProfile.state,
    ].filter(Boolean);
    address = parts.join(", ");
  } else if (restaurant?.address) {
    address = restaurant.address;
  }

  const ctx: ReplyContext = {
    restaurantName:  restaurant?.name ?? "nossa loja",
    pedidoUrl,
    address,
    deliveryEnabled: storeProfile?.deliveryEnabled ?? false,
    welcomeMessage:  agentCfg?.welcomeMessage  ?? "Olá! Sou o assistente da loja 😊 Posso te passar informações ou te enviar o cardápio para fazer seu pedido.",
    orderPreMessage: agentCfg?.orderPreMessage ?? "Você pode fazer seu pedido pelo nosso cardápio aqui:",
    handoffMessage:  agentCfg?.handoffMessage  ?? "Claro. Vou deixar essa conversa para a equipe da loja te atender por aqui. 👋",
  };

  // Detect intent and build reply
  const intent = detectIntent(lastMessage.content);
  const replyText = buildReply(intent, ctx);

  // If human handoff requested, transition conversation before sending reply
  if (intent === "HUMAN_REQUEST") {
    await prisma.conversation.update({
      where: { id: conversationId },
      data:  { status: ConversationStatus.HUMAN },
    });
  }

  // Send via Evolution API and log
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
