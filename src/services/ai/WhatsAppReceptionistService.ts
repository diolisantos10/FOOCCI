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
 *   - For UNKNOWN in RECEPTIONIST_ONLY and for GREETING without menu options: use OpenAI GPT.
 *   - Set conversation.status = HUMAN + aiEnabled = false on handoff via markConversationNeedsHuman.
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
import { openai } from "@/lib/openai";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient } from "@/lib/evolution/EvolutionClient";
import { ConversationStatus } from "@prisma/client";
import type { MenuOption } from "@/validators/whatsapp-agent";
import { RestaurantKnowledgeService } from "@/services/knowledge/RestaurantKnowledgeService";
import { markConversationNeedsHuman } from "@/lib/handoff";
import { getPeriodsForRow, isInPeriod } from "@/lib/business-hours";

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
  restaurantName:   string;
  pedidoUrl:        string | null;
  address:          string | null;
  deliveryEnabled:  boolean;
  welcomeMessage:   string;
  orderPreMessage:  string;
  handoffMessage:   string;
  agentMode:        string;
  menuOptions:      MenuOption[];
  hoursText:        string | null;
  isCurrentlyOpen:  boolean;
}

// ─── GPT reply generation ─────────────────────────────────────

interface GptResult {
  reply:        string;
  needsHandoff: boolean;
}

async function generateGptReply(params: {
  ctx:                 ReplyContext;
  customerName:        string | null;
  currentMessage:      string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  knowledgeItems:      { title: string; answer: string }[];
}): Promise<GptResult> {
  const { ctx, customerName, currentMessage, conversationHistory, knowledgeItems } = params;

  const knowledgeSection = knowledgeItems.length > 0
    ? "\n\nBASE DE CONHECIMENTO:\n" +
      knowledgeItems.map((k) => `P: ${k.title}\nR: ${k.answer}`).join("\n\n")
    : "";

  const greeting = customerName ? `, ${customerName.split(" ")[0]}` : "";

  const systemPrompt =
`Você é o atendente virtual do WhatsApp de "${ctx.restaurantName}". Responda em português brasileiro de forma curta, amigável e natural${greeting ? ` (chame o cliente de ${customerName?.split(" ")[0]})` : ""}.

CONTEXTO:
- Restaurante: ${ctx.restaurantName}
${ctx.pedidoUrl ? `- Cardápio / pedidos online: ${ctx.pedidoUrl}` : ""}
${ctx.address    ? `- Endereço: ${ctx.address}`                    : ""}
- Delivery: ${ctx.deliveryEnabled ? "Sim, fazemos entrega" : "Retirada no local"}
${ctx.hoursText  ? `- Horários:\n${ctx.hoursText}`                 : ""}
${knowledgeSection}

INSTRUÇÕES:
1. Máximo 2 parágrafos curtos. Sem listas longas.
2. Nunca invente preços, produtos ou promoções que não estão no contexto acima.
3. Se o cliente pedir para ver o cardápio ou fazer pedido, manda o link${ctx.pedidoUrl ? ` (${ctx.pedidoUrl})` : ""}.
4. Se houver reclamação, urgência ou o cliente pedir para falar com uma pessoa, retorne needsHandoff=true.
5. Se não souber responder com certeza, retorne needsHandoff=true.
6. Use emoji com moderação 😊.

Responda APENAS com JSON válido: {"reply":"...","needsHandoff":false}`;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6),
    { role: "user", content: currentMessage },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model:           "gpt-4o-mini",
      messages,
      max_tokens:      300,
      temperature:     0.65,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { reply?: string; needsHandoff?: boolean };
    return {
      reply:        (parsed.reply ?? "").trim() || ctx.handoffMessage,
      needsHandoff: parsed.needsHandoff === true,
    };
  } catch (err) {
    console.error("[WhatsAppReceptionistService] GPT error:", err);
    return { reply: ctx.handoffMessage, needsHandoff: true };
  }
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
      return ctx.hoursText ?? ctx.welcomeMessage;
    default:
      return ctx.welcomeMessage;
  }
}

function buildTemplateReply(intent: Intent, ctx: ReplyContext): string | null {
  // Block ordering attempts outside business hours
  if (!ctx.isCurrentlyOpen && (intent === "ORDER" || intent === "MENU_REQUEST")) {
    return ctx.hoursText
      ? `No momento estamos fechados. 😕\n\n${ctx.hoursText}`
      : "No momento estamos fechados. Por favor, tente novamente durante nosso horário de atendimento.";
  }

  switch (intent) {
    case "ORDER":
    case "MENU_REQUEST":
      return ctx.pedidoUrl
        ? `${ctx.orderPreMessage}\n\n${ctx.pedidoUrl}`
        : null;

    case "HOURS_REQUEST":
      if (ctx.hoursText) {
        return ctx.hoursText + (ctx.pedidoUrl ? `\n\n📱 Cardápio: ${ctx.pedidoUrl}` : "");
      }
      return null;

    case "ADDRESS_REQUEST":
      if (ctx.address) {
        return `Estamos em: ${ctx.address}` + (ctx.pedidoUrl ? `\n\nCardápio: ${ctx.pedidoUrl}` : "");
      }
      return null;

    case "PAYMENT_INFO":
      return ctx.pedidoUrl
        ? `As opções de pagamento ficam visíveis ao finalizar o pedido no nosso cardápio:\n${ctx.pedidoUrl}`
        : null;

    default:
      return null;
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

  if (
    !conversation ||
    !conversation.aiEnabled ||
    conversation.status === ConversationStatus.HUMAN ||
    conversation.status === ConversationStatus.HUMANO_ASSUMIU ||
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

  // Load all config in parallel
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
      select:  { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, periodsJson: true },
      orderBy: { dayOfWeek: "asc" },
    }),
  ]);

  if (!evolutionResult.ok) {
    console.warn(`[WhatsAppReceptionistService] No active Evolution config for restaurant ${restaurantId}`);
    return;
  }

  const baseUrl  = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const pedidoUrl =
    agentCfg?.menuUrl ||
    (restaurant?.slug && baseUrl ? `${baseUrl}/pedido/${restaurant.slug}` : null);

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

  const menuOptions: MenuOption[] = Array.isArray(agentCfg?.menuOptions)
    ? (agentCfg.menuOptions as unknown as MenuOption[])
    : [];

  const agentMode = agentCfg?.agentMode ?? "RECEPTIONIST_ONLY";

  const nowDate   = new Date();
  const todayDow  = nowDate.getDay();
  const nowMin    = nowDate.getHours() * 60 + nowDate.getMinutes();
  let hoursText: string | null = null;
  let isCurrentlyOpen = true; // default open when no config
  if (businessHoursRows.length > 0) {
    const todayRow = businessHoursRows.find((h) => h.dayOfWeek === todayDow);
    const todayPeriods = todayRow ? getPeriodsForRow(todayRow) : [];
    isCurrentlyOpen = todayPeriods.some((p) => isInPeriod(nowMin, p));

    const todayPeriodsStr = todayPeriods.map((p) => `${p.open}–${p.close}`).join(", ");
    const todayStatus = todayRow
      ? todayRow.isOpen && todayPeriods.length > 0
        ? `Hoje (${DAY_NAMES_PT[todayDow] ?? ""}) estamos *${isCurrentlyOpen ? "abertos" : "fechados no momento"}*: ${todayPeriodsStr}.\n\n`
        : `Hoje (${DAY_NAMES_PT[todayDow] ?? ""}) estamos *fechados*.\n\n`
      : "";

    const weekLines = businessHoursRows
      .map((h) => {
        const day     = DAY_NAMES_PT[h.dayOfWeek] ?? `Dia ${h.dayOfWeek}`;
        const periods = getPeriodsForRow(h);
        if (!h.isOpen || periods.length === 0) return `${day}: Fechado`;
        return `${day}: ${periods.map((p) => `${p.open}–${p.close}`).join(", ")}`;
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
    isCurrentlyOpen,
  };

  const toPhone = conversation.customer.phone.replace(/^\+/, "");

  // Handle media messages — we cannot process images, audio, or documents.
  if (lastMessage.type !== "TEXT") {
    const mediaReply = ctx.pedidoUrl
      ? `Recebi sua mensagem! 😊 Posso te ajudar melhor por texto. Para fazer seu pedido:\n${ctx.pedidoUrl}`
      : "Recebi sua mensagem! 😊 Posso te ajudar melhor por texto. É só digitar o que você precisa!";
    await sendReply(evolutionResult.data, toPhone, mediaReply, conversationId);
    return;
  }

  // ── Check if customer selected a numbered or named menu option ────────────
  const selectedOpt = detectSelectedOption(lastMessage.content, menuOptions);

  let replyText: string;
  let triggerHandoff: boolean;

  if (selectedOpt) {
    replyText      = buildFlowReply(selectedOpt, ctx);
    triggerHandoff = selectedOpt.flow === "handoff";
  } else {
    const intent = detectIntent(lastMessage.content);

    // Hard handoff intents — never use GPT, always escalate immediately
    if (needsHandoff(intent, agentMode)) {
      replyText      = ctx.handoffMessage;
      triggerHandoff = true;
    } else {
      // Check knowledge base first (takes priority over both templates and GPT)
      const knowledgeMatch =
        intent !== "GREETING" &&
        (await RestaurantKnowledgeService.findMatch(restaurantId, lastMessage.content).catch(() => null));

      if (knowledgeMatch) {
        replyText      = knowledgeMatch.answer;
        triggerHandoff = false;
        RestaurantKnowledgeService.incrementUsage(knowledgeMatch.id).catch(() => {});
      } else {
        // Try deterministic template for data-backed intents (hours, address, menu link, etc.)
        const templateReply = buildTemplateReply(intent, ctx);

        // Use GPT for GREETING (human-like warmth) and UNKNOWN (open-ended questions),
        // and as a fallback when template data is missing.
        const useGpt =
          intent === "GREETING" && menuOptions.length === 0 ||
          intent === "UNKNOWN" && agentMode !== "HUMAN_ASSISTED" ||
          (templateReply === null && intent !== "GREETING");

        if (useGpt) {
          // Load conversation history and knowledge items for GPT context
          const [historyMsgs, knowledgeItems] = await Promise.all([
            prisma.message.findMany({
              where:   { conversationId, type: "TEXT" },
              orderBy: { sentAt: "desc" },
              take:    8,
              select:  { direction: true, content: true },
            }),
            prisma.restaurantKnowledgeItem.findMany({
              where:   { restaurantId, status: "ACTIVE" },
              select:  { title: true, answer: true },
              take:    10,
            }).catch(() => [] as { title: string; answer: string }[]),
          ]);

          // Oldest first; exclude system/handoff messages
          const conversationHistory = historyMsgs
            .reverse()
            .filter((m) => !m.content.startsWith("[handoff:") && !m.content.startsWith("[inactivity"))
            .map((m) => ({
              role:    (m.direction === "INBOUND" ? "user" : "assistant") as "user" | "assistant",
              content: m.content,
            }));

          const gpt = await generateGptReply({
            ctx,
            customerName:        conversation.customer.name,
            currentMessage:      lastMessage.content,
            conversationHistory,
            knowledgeItems,
          });

          replyText      = gpt.reply;
          triggerHandoff = gpt.needsHandoff;

          // Record knowledge gap when GPT also couldn't answer confidently
          if (gpt.needsHandoff && intent === "UNKNOWN") {
            RestaurantKnowledgeService.createGap(
              restaurantId,
              lastMessage.content,
              conversationId,
            ).catch(() => {});
          }
        } else {
          // Use GREETING template (with menu list) or data-backed template
          if (intent === "GREETING") {
            const menuList = buildMenuList(menuOptions);
            replyText = ctx.welcomeMessage + (menuList
              ? menuList + "\n\nResponda com o número da opção 😊"
              : (ctx.pedidoUrl ? `\n\nCardápio: ${ctx.pedidoUrl}` : ""));
          } else {
            replyText = templateReply ?? ctx.welcomeMessage;
          }
          triggerHandoff = false;

          // Record knowledge gap for UNKNOWN when GPT was skipped (HUMAN_ASSISTED mode)
          if (intent === "UNKNOWN") {
            RestaurantKnowledgeService.createGap(
              restaurantId,
              lastMessage.content,
              conversationId,
            ).catch(() => {});
          }
        }
      }
    }
  }

  // Transition conversation to HUMAN via the shared utility (idempotent, records event)
  if (triggerHandoff) {
    const handoffReason =
      selectedOpt?.flow === "handoff"        ? "MENU_OPTION"
      : detectIntent(lastMessage.content) === "COMPLAINT"     ? "COMPLAINT"
      : detectIntent(lastMessage.content) === "HUMAN_REQUEST" ? "CUSTOMER_REQUEST"
      : detectIntent(lastMessage.content) === "ORDER_STATUS"  ? "AI_ESCALATION"
      :                                                          "AI_ESCALATION";
    await markConversationNeedsHuman(conversationId, handoffReason);
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
