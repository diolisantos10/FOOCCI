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
import { getPeriodsForRow, isInPeriod, getNextOpenAt, buildClosedMessage } from "@/lib/business-hours";
import { getPublicMenuUrl, getPublicQrUrl, sanitizeCustomerUrl } from "@/lib/public-url";
import { signWaToken } from "@/lib/wa-token";

// ─── constants ────────────────────────────────────────────────

const EMOJI_NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"] as const;
const DAY_NAMES_PT  = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

// "0" / "voltar" / "menu" / "menu principal" → re-render the WhatsApp host menu.
const BACK_TO_MENU_RE =
  /^(0|voltar|menu|menu\s+principal|voltar\s+menu|in[ií]cio|inicio)$/i;

// Footer appended to every non-handoff branch reply so the customer always
// has a clear exit from any menu sub-branch.
const BACK_TO_MENU_FOOTER = "\n\n0️⃣ Voltar ao menu principal";

// Shown when menuOptions is null/empty in DB — ensures the menu is always visible.
const FALLBACK_MENU_OPTIONS: MenuOption[] = [
  { id: "fallback-menu",    label: "Ver cardápio",             flow: "menu"    },
  { id: "fallback-hours",   label: "Horário de funcionamento", flow: "custom"  },
  { id: "fallback-handoff", label: "Falar com atendente",      flow: "handoff" },
];

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
  /^(oi|olá|ola|oii|bom dia|boa tarde|boa noite|hey|hi|hello|e aí|eai|tudo bem|tudo bom|pode ajudar|boas|fala|test(e)?|começar|inicio|ajuda|help)\b/i;
const ORDER_RE =
  /quero (pedir|comprar)|fazer (um )?pedido|como (peço|fa[çc]o pedido)|link do pedido|quero fazer pedido/i;
const MENU_RE =
  /cardápio|cardapio|menu|ver (o )?menu|ver produtos|opções|opcoes|opção|opcao/i;
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
  agentName:        string;        // configured WhatsApp Host name
  customerName:     string | null; // from CRM customer record
  pedidoUrl:        string | null; // delivery/ordering link (foocci.com.br/pedido/slug)
  qrMenuUrl:        string | null; // dine-in/QR link (foocci.com.br/qr/slug)
  address:          string | null;
  deliveryEnabled:  boolean;
  welcomeMessage:   string;
  orderPreMessage:  string;
  handoffMessage:   string;
  agentMode:        string;
  menuOptions:      MenuOption[];
  hoursText:        string | null;
  isCurrentlyOpen:  boolean;
  closedMessage:    string | null; // rich closed message with today's hours + next opening
  isPaused:         boolean;       // emergency store pause overrides business hours
  pauseReason:      string | null;
  menuCatalog:      { name: string; items: { name: string }[] }[];
  instagramUrl:     string | null;
  tiktokUrl:        string | null;
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

  const catalogSection = ctx.menuCatalog.length > 0
    ? "\n\nCARDÁPIO (categorias disponíveis):\n" +
      ctx.menuCatalog
        .map((c) =>
          c.items.length > 0
            ? `- ${c.name} (ex.: ${c.items.slice(0, 3).map((i) => i.name).join(", ")})`
            : `- ${c.name}`
        )
        .join("\n")
    : "";

  const greeting = customerName ? `, ${customerName.split(" ")[0]}` : "";

  const socialSection = [
    ctx.instagramUrl ? `- Instagram: ${ctx.instagramUrl}` : "",
    ctx.tiktokUrl    ? `- TikTok: ${ctx.tiktokUrl}`       : "",
  ].filter(Boolean).join("\n");

  const systemPrompt =
`Você é ${ctx.agentName}, o atendente virtual do WhatsApp de "${ctx.restaurantName}". Responda em português brasileiro de forma curta, amigável e natural${greeting ? ` (chame o cliente de ${customerName?.split(" ")[0]})` : ""}.

CONTEXTO DO RESTAURANTE:
- Nome: ${ctx.restaurantName}
${ctx.pedidoUrl ? `- Cardápio / pedidos online: ${ctx.pedidoUrl}` : ""}
${ctx.qrMenuUrl && ctx.qrMenuUrl !== ctx.pedidoUrl ? `- Menu salão/QR: ${ctx.qrMenuUrl}` : ""}
${ctx.address    ? `- Endereço: ${ctx.address}`                    : ""}
- Delivery: ${ctx.deliveryEnabled ? "Sim, fazemos entrega" : "Retirada no local"}
${ctx.hoursText  ? `- Horários:\n${ctx.hoursText}`                 : ""}
${socialSection   ? socialSection                                   : ""}
${catalogSection}
${ctx.isPaused ? `🚫 STATUS ATUAL: Pedidos PAUSADOS temporariamente. ${ctx.pauseReason ? `Motivo: ${ctx.pauseReason}.` : ""}` : (!ctx.isCurrentlyOpen && ctx.closedMessage ? `⚠️ STATUS ATUAL: O restaurante está FECHADO agora. ${ctx.closedMessage}` : "")}
${knowledgeSection}

INSTRUÇÕES:
1. Máximo 2 parágrafos curtos. Sem listas longas.
2. Nunca invente preços, produtos ou promoções que não estão no contexto acima.
3. Se o cliente pedir para ver o cardápio, pode enviar o link${ctx.pedidoUrl ? ` (${ctx.pedidoUrl})` : ""}, mas deixe claro que${!ctx.isCurrentlyOpen ? " os pedidos estão pausados e" : ""} ele deve finalizar durante o horário de funcionamento.
${!ctx.isCurrentlyOpen ? "4. Não ofereça o link de pedido como se estivesse aberto. Informe o horário de reabertura quando disponível.\n5." : "4."}Se houver reclamação, urgência ou o cliente pedir para falar com uma pessoa, retorne needsHandoff=true.
${!ctx.isCurrentlyOpen ? "6." : "5."}Se o cliente perguntar sobre categoria ou item que aparece no CARDÁPIO acima, confirme que sim (ex.: "Temos X sim 😊") e indique o link do cardápio. Não retorne needsHandoff=true para perguntas sobre existência de produtos do cardápio.
${!ctx.isCurrentlyOpen ? "7." : "6."}Se não souber responder com certeza e não for possível redirecionar para o cardápio, retorne needsHandoff=true.
${!ctx.isCurrentlyOpen ? "8." : "7."}Use emoji com moderação 😊.
${!ctx.isCurrentlyOpen ? "9." : "8."}NUNCA inclua domínios Railway (crmrestaurante-production.up.railway.app ou qualquer .up.railway.app) em mensagens para clientes. Use exclusivamente os links do contexto acima.
${!ctx.isCurrentlyOpen ? "10." : "9."}NÃO utilize seu conhecimento de treinamento sobre este restaurante específico. Use APENAS as informações fornecidas neste prompt.
${!ctx.isCurrentlyOpen ? "11." : "10."}NÃO forneça preços de rodízio, regras, descontos por idade, itens incluídos ou disponibilidade a menos que essas informações estejam explicitamente na BASE DE CONHECIMENTO acima.
${!ctx.isCurrentlyOpen ? "12." : "11."}Se o cliente perguntar sobre rodízio e essas informações não estiverem no contexto: responda "Vou confirmar certinho com a equipe e te passo as informações do rodízio 😊" e retorne needsHandoff=true.

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

/**
 * Appends a signed WhatsApp identity token + src=whatsapp to the pedido URL
 * so /pedido/[slug] can skip the phone-identification step.
 * Falls back gracefully if signing is unavailable.
 */
function buildIdentifiedPedidoUrl(
  baseUrl: string | null,
  phone: string,
  name: string | null,
): string | null {
  if (!baseUrl) return null;
  try {
    const token = signWaToken({
      phone,
      ...(name ? { name: name.trim().split(/\s+/)[0] } : {}),
    });
    const url = new URL(baseUrl);
    url.searchParams.set("waToken", token);
    url.searchParams.set("src", "whatsapp");
    return url.toString();
  } catch (err) {
    console.error(
      "[buildIdentifiedPedidoUrl] failed — falling back to unsigned URL",
      {
        errorMessage:  err instanceof Error ? err.message : String(err),
        errorName:     err instanceof Error ? err.name    : "unknown",
        phoneLen:      phone?.length ?? 0,
        phoneTrimLen:  phone?.trim().length ?? 0,
        hasSecret:     !!(process.env.NEXTAUTH_SECRET ?? process.env.APP_SECRET),
        secretLen:     (process.env.NEXTAUTH_SECRET ?? process.env.APP_SECRET)?.length ?? 0,
        baseUrlLen:    baseUrl?.length ?? 0,
        isAbsoluteUrl: baseUrl?.startsWith("http") ?? false,
      },
    );
    try {
      const url = new URL(baseUrl);
      url.searchParams.set("src", "whatsapp");
      return url.toString();
    } catch {
      return baseUrl;
    }
  }
}

/** Formats the configured menu options as an emoji-numbered text list. */
function buildMenuList(options: MenuOption[]): string {
  if (options.length === 0) return "";
  return "\n\n" + options.map((o, i) => `${EMOJI_NUMBERS[i] ?? `${i + 1}.`} ${o.label}`).join("\n");
}

/**
 * Checks if the customer's message mentions a known menu category.
 * Returns a ready-to-send reply confirming the category exists + menu link,
 * or null if no catalog match was found.
 * Used to short-circuit GPT for simple existence questions like "Vcs tem combos?".
 */
function findCatalogMatch(
  message: string,
  catalog: { name: string; items: { name: string }[] }[],
  pedidoUrl: string | null,
): string | null {
  if (catalog.length === 0) return null;
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const msgNorm = norm(message);

  for (const cat of catalog) {
    const catNorm = norm(cat.name);
    if (!msgNorm.includes(catNorm)) continue;

    // Skip if the category name is negated right before it (e.g., "não tem combos")
    const catIdx = msgNorm.indexOf(catNorm);
    const before = msgNorm.slice(Math.max(0, catIdx - 20), catIdx);
    if (/\bn[aã]o\b/.test(before)) continue;

    const catDisplay = cat.name.charAt(0).toUpperCase() + cat.name.slice(1);
    return pedidoUrl
      ? `Temos ${catDisplay} sim 😊 Você pode ver as opções e fazer seu pedido diretamente pelo cardápio:\n${pedidoUrl}`
      : `Temos ${catDisplay} sim 😊 É só nos perguntar mais detalhes!`;
  }
  return null;
}

/** Builds the reply for a specific selected menu option (by number or label). */
function buildFlowReply(opt: MenuOption, ctx: ReplyContext): string {
  const { orderPreMessage, pedidoUrl, handoffMessage } = ctx;
  switch (opt.flow) {
    case "order":
      if (!ctx.isCurrentlyOpen) {
        const base = ctx.closedMessage ?? "No momento estamos fechados.";
        return pedidoUrl
          ? `${base}\n\nVeja nosso cardápio (pedidos pausados até reabrirmos):\n${pedidoUrl}`
          : base;
      }
      return orderPreMessage + (pedidoUrl ? `\n${pedidoUrl}` : "");
    case "handoff":
      if (!ctx.isCurrentlyOpen) {
        const base = ctx.closedMessage ?? "No momento estamos fechados.";
        const menuList = buildMenuList(ctx.menuOptions);
        return (
          base +
          "\n\nNosso atendimento humano retorna quando estivermos abertos." +
          (menuList
            ? `\n\nEnquanto isso, posso te ajudar:${menuList}\n\nResponda com o número da opção 😊`
            : "")
        );
      }
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

function appendBackToMainMenu(text: string): string {
  return text + BACK_TO_MENU_FOOTER;
}

function renderMainMenu(ctx: ReplyContext): string {
  const menuList = buildMenuList(ctx.menuOptions);
  if (!menuList) return ctx.welcomeMessage;
  return "Claro 😊 Voltando ao menu principal:" + menuList + "\n\nResponda com o número da opção 😊";
}

function buildTemplateReply(intent: Intent, ctx: ReplyContext): string | null {
  // Block ordering attempts outside business hours — reply with details + allow browsing
  if (!ctx.isCurrentlyOpen && (intent === "ORDER" || intent === "MENU_REQUEST")) {
    const base = ctx.closedMessage ?? "No momento estamos fechados.";
    const menuLine = ctx.pedidoUrl
      ? `\n\nVocê pode consultar o cardápio à vontade (pedidos ficam pausados até reabrirmos) 😊\n${ctx.pedidoUrl}`
      : "";
    return `${base}${menuLine}`;
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
      customer:     { select: { id: true, phone: true, name: true } },
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
    select:  { content: true, type: true, sentAt: true },
  });

  if (!lastMessage) return;

  // Idempotency guard: skip if bot already replied after this inbound message.
  // Prevents duplicate replies when Evolution retries webhooks or the service
  // is triggered concurrently for the same conversation.
  const alreadyReplied = await prisma.message.findFirst({
    where: {
      conversationId,
      direction:  "OUTBOUND",
      senderType: "AI",
      sentAt:     { gte: lastMessage.sentAt },
    },
    select: { id: true },
  });
  if (alreadyReplied) {
    console.info(`[WhatsAppReceptionistService] Already replied after last inbound — conv ${conversationId}, skipping`);
    return;
  }

  const { restaurantId } = conversation;

  // Load all config in parallel
  const [restaurant, storeProfile, agentCfg, brandConfig, evolutionResult, businessHoursRows, lastOutbound, menuCatalogRaw] = await Promise.all([
    prisma.restaurant.findUnique({
      where:  { id: restaurantId },
      select: { name: true, slug: true, address: true, timezone: true, isOrderingPaused: true, orderingPausedUntil: true, orderingPausedReason: true },
    }),
    prisma.storeProfile.findUnique({
      where:  { restaurantId },
      select: { street: true, streetNumber: true, neighborhood: true, city: true, state: true, deliveryEnabled: true },
    }),
    prisma.whatsAppAgentConfig.findUnique({
      where:  { restaurantId },
      select: {
        agentMode:       true,
        agentName:       true,
        welcomeMessage:  true,
        orderPreMessage: true,
        menuUrl:         true,
        menuOptions:     true,
        handoffMessage:  true,
      },
    }),
    prisma.restaurantBrandConfig.findUnique({
      where:  { restaurantId },
      select: { instagramUrl: true, tiktokUrl: true },
    }).catch(() => null),
    EvolutionConfigService.getSnapshot(restaurantId),
    prisma.businessHours.findMany({
      where:   { restaurantId },
      select:  { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, periodsJson: true },
      orderBy: { dayOfWeek: "asc" },
    }),
    // Last outbound AI message — used for menu cooldown (30-min session guard)
    prisma.message.findFirst({
      where:   { conversationId, direction: "OUTBOUND", senderType: "AI" },
      orderBy: { sentAt: "desc" },
      select:  { sentAt: true },
    }),
    // Menu catalog — loaded for catalog-match short-circuit and GPT context
    prisma.menuCategory.findMany({
      where:   { restaurantId, isActive: true, isAvailable: true, showInDelivery: true },
      orderBy: { sortOrder: "asc" },
      select:  {
        name:  true,
        items: {
          where:   { isActive: true, isAvailable: true, showInDelivery: true },
          select:  { name: true },
          take:    5,
          orderBy: { sortOrder: "asc" },
        },
      },
    }).catch(() => [] as { name: string; items: { name: string }[] }[]),
  ]);

  if (!evolutionResult.ok) {
    console.warn(`[WhatsAppReceptionistService] No active Evolution config for restaurant ${restaurantId}`);
    return;
  }

  const rawMenuUrl = agentCfg?.menuUrl?.trim() || (restaurant?.slug ? getPublicMenuUrl(restaurant.slug) : null);
  // waToken is only handled by /pedido/ — remap /qr/ URLs so identity is not lost
  const fixedMenuUrl = rawMenuUrl?.replace(/\/qr\/([^/?]+)/, "/pedido/$1") ?? rawMenuUrl;
  const basePedidoUrl = fixedMenuUrl ? sanitizeCustomerUrl(fixedMenuUrl) : null;
  // Build customer-identified URL so /pedido can skip the phone-entry step
  const pedidoUrl = buildIdentifiedPedidoUrl(
    basePedidoUrl,
    conversation.customer.phone,
    conversation.customer.name ?? null,
  );
  // Instrumentation: log link-generation state so we can diagnose waToken failures.
  console.info("[WhatsAppReceptionistService] link-gen", {
    conversationId,
    restaurantSlug:       restaurant?.slug ?? null,
    customerPhoneLen:     conversation.customer.phone?.length ?? 0,
    customerPhoneTrimLen: conversation.customer.phone?.trim().length ?? 0,
    hasSecret:            !!(process.env.NEXTAUTH_SECRET ?? process.env.APP_SECRET),
    secretLen:            (process.env.NEXTAUTH_SECRET ?? process.env.APP_SECRET)?.length ?? 0,
    basePedidoUrlPrefix:  basePedidoUrl ? basePedidoUrl.slice(0, 60) : null,
    basePedidoIsAbsolute: basePedidoUrl?.startsWith("http") ?? false,
    pedidoUrlHasWaToken:  pedidoUrl?.includes("waToken=") ?? false,
    pedidoUrlHasSrc:      pedidoUrl?.includes("src=whatsapp") ?? false,
  });
  // Explicit warning if signing failed silently.
  if (pedidoUrl && !pedidoUrl.includes("waToken=")) {
    console.warn(
      `[WhatsAppReceptionistService] pedidoUrl has no waToken for conv ${conversationId} — signWaToken likely threw. secretLen=${(process.env.NEXTAUTH_SECRET ?? process.env.APP_SECRET)?.length ?? 0}`,
    );
  }
  const qrMenuUrl = restaurant?.slug ? getPublicQrUrl(restaurant.slug) : null;

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

  const rawMenuOptions: MenuOption[] = Array.isArray(agentCfg?.menuOptions)
    ? (agentCfg.menuOptions as unknown as MenuOption[])
    : [];
  // Always have at least fallback options so the menu is never empty.
  const menuOptions: MenuOption[] = rawMenuOptions.length > 0 ? rawMenuOptions : FALLBACK_MENU_OPTIONS;

  const agentMode = agentCfg?.agentMode ?? "RECEPTIONIST_ONLY";

  // Use restaurant's configured timezone (fallback: America/Sao_Paulo).
  // getDay() / getHours() on a raw `new Date()` return UTC values — wrong for Brazil.
  // We convert to the local timezone first, then extract day-of-week and minute-of-day.
  const tz       = restaurant?.timezone ?? "America/Sao_Paulo";
  const nowDate  = new Date();
  const localNow = new Date(nowDate.toLocaleString("en-US", { timeZone: tz }));
  const todayDow = localNow.getDay();
  const nowMin   = localNow.getHours() * 60 + localNow.getMinutes();

  // Emergency pause check
  const isPaused = !!(
    restaurant?.isOrderingPaused &&
    (restaurant.orderingPausedUntil === null || restaurant.orderingPausedUntil > nowDate)
  );
  const pauseReason = isPaused ? (restaurant?.orderingPausedReason ?? null) : null;

  let hoursText: string | null = null;
  let isCurrentlyOpen = true; // default open when no config
  let closedMessage: string | null = null;
  if (businessHoursRows.length > 0) {
    const todayRow     = businessHoursRows.find((h) => h.dayOfWeek === todayDow);
    const todayPeriods = todayRow ? getPeriodsForRow(todayRow) : [];
    isCurrentlyOpen    = todayPeriods.some((p) => isInPeriod(nowMin, p));

    if (!isCurrentlyOpen) {
      const nextOpenAt = getNextOpenAt(businessHoursRows, todayDow, nowMin);
      closedMessage    = buildClosedMessage(todayPeriods, nextOpenAt);
    }

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

  // Guard: don't resend the full greeting+menu if the bot already replied within
  // the last 30 minutes (same active session).  After 30 min of silence the
  // menu can be shown again (customer may have returned / started a new intent).
  const MENU_COOLDOWN_MS = 30 * 60 * 1000;
  const menuSentRecently = lastOutbound
    ? nowDate.getTime() - lastOutbound.sentAt.getTime() < MENU_COOLDOWN_MS
    : false;

  // When paused, treat as closed for all intent handling
  const effectivelyOpen = isCurrentlyOpen && !isPaused;

  // Strip handoff-type options while the restaurant is closed / paused so that
  // "Falar com atendente" never appears in the menu shown to the customer.
  const effectiveMenuOptions: MenuOption[] = effectivelyOpen
    ? menuOptions
    : menuOptions.filter((o) => o.flow !== "handoff");
  const pauseMessage = isPaused
    ? `Pedidos pausados temporariamente.${pauseReason ? ` ${pauseReason}.` : ""} Tente novamente em breve.`
    : null;

  const ctx: ReplyContext = {
    restaurantName:  restaurant?.name ?? "nossa loja",
    agentName:       agentCfg?.agentName?.trim() || "Assistente",
    customerName:    conversation.customer.name ?? null,
    pedidoUrl,
    qrMenuUrl,
    address,
    deliveryEnabled: storeProfile?.deliveryEnabled ?? false,
    welcomeMessage:  agentCfg?.welcomeMessage  ?? `Oi! 👋 Sou o atendimento de ${restaurant?.name ?? "nossa loja"}. Como posso te ajudar hoje?`,
    orderPreMessage: agentCfg?.orderPreMessage ?? "Acesse nosso cardápio e faça seu pedido diretamente:",
    handoffMessage:  agentCfg?.handoffMessage  ?? "Vou deixar nossa equipe te atender. Um momento! 👋",
    agentMode,
    menuOptions:     effectiveMenuOptions,
    menuCatalog:     menuCatalogRaw,
    hoursText,
    isCurrentlyOpen: effectivelyOpen,
    closedMessage:   isPaused ? pauseMessage : closedMessage,
    isPaused,
    pauseReason,
    instagramUrl:    brandConfig?.instagramUrl ?? null,
    tiktokUrl:       brandConfig?.tiktokUrl    ?? null,
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

  // ── Back-to-menu shortcut ─────────────────────────────────────────────────
  if (BACK_TO_MENU_RE.test(lastMessage.content.trim())) {
    await sendReply(evolutionResult.data, toPhone, renderMainMenu(ctx), conversationId);
    return;
  }

  // ── Check if customer selected a numbered or named menu option ────────────
  const selectedOpt = detectSelectedOption(lastMessage.content, effectiveMenuOptions);

  let replyText: string     = ctx.handoffMessage;
  let triggerHandoff        = false;

  if (selectedOpt) {
    // Instrumentation: log which option was selected and URL state.
    console.info("[WhatsAppReceptionistService] option-selected", {
      conversationId,
      restaurantSlug:       restaurant?.slug ?? null,
      customerIdPresent:    !!conversation.customer.id,
      customerPhonePresent: !!(conversation.customer.phone?.trim()),
      optionLabel:          selectedOpt.label,
      optionFlow:           selectedOpt.flow,
      ctxPedidoUrlHasWaToken: ctx.pedidoUrl?.includes("waToken=") ?? false,
    });
    replyText      = buildFlowReply(selectedOpt, ctx);
    triggerHandoff = selectedOpt.flow === "handoff";
    if (!triggerHandoff) {
      replyText = appendBackToMainMenu(replyText);
    }
  } else {
    const intent = detectIntent(lastMessage.content);

    // Hard handoff intents — never use GPT, always escalate immediately
    if (needsHandoff(intent, agentMode)) {
      // When closed, HUMAN_REQUEST cannot be served — inform the customer and
      // show the reduced closed-hours menu. COMPLAINT / ORDER_STATUS are
      // emergencies and still escalate unconditionally even when closed.
      if (!effectivelyOpen && intent === "HUMAN_REQUEST") {
        const base = ctx.closedMessage ?? "No momento estamos fechados.";
        const closedMenuList = buildMenuList(effectiveMenuOptions);
        replyText =
          base +
          "\n\nNosso atendimento humano retorna quando estivermos abertos." +
          (closedMenuList
            ? `\n\nEnquanto isso, posso te ajudar:${closedMenuList}\n\nResponda com o número da opção 😊`
            : "");
        triggerHandoff = false;
      } else {
        replyText      = ctx.handoffMessage;
        triggerHandoff = true;
      }
    } else {
      // Check knowledge base first (takes priority over both templates and GPT)
      const knowledgeMatch =
        intent !== "GREETING" &&
        (await RestaurantKnowledgeService.findMatch(restaurantId, lastMessage.content).catch(() => null));

      if (knowledgeMatch) {
        replyText      = appendBackToMainMenu(knowledgeMatch.answer);
        triggerHandoff = false;
        RestaurantKnowledgeService.incrementUsage(knowledgeMatch.id).catch(() => {});
      } else {
        // Try deterministic template for data-backed intents (hours, address, menu link, etc.)
        const templateReply = buildTemplateReply(intent, ctx);

        // GPT is used for:
        //   - UNKNOWN intent in RECEPTIONIST_ONLY mode
        //   - any data-backed intent where template data is unavailable
        // NOTE: GREETING is NEVER routed to GPT here — the short-circuit above
        // handles repeat greetings within the cooldown window, and the template
        // path below handles first-contact greetings (always shows menu).
        const useGpt =
          (intent === "UNKNOWN" && agentMode !== "HUMAN_ASSISTED") ||
          (templateReply === null && intent !== "GREETING");

        // Within the 30-min session: short re-engagement only — menu already visible,
        // no need to repeat the numbered list. Compact footer keeps the escape hatch.
        if (intent === "GREETING" && menuSentRecently) {
          const firstName = ctx.customerName?.split(" ")[0]?.trim() ?? null;
          const shortGreet = firstName
            ? `Estou aqui, ${firstName}! 😊 Como posso te ajudar?`
            : "Estou aqui! 😊 Como posso te ajudar?";
          replyText      = shortGreet + BACK_TO_MENU_FOOTER;
          triggerHandoff = false;
        } else if (useGpt) {
          // For UNKNOWN in RECEPTIONIST_ONLY: check catalog before GPT to avoid false handoffs
          let gptNeeded = true;
          if (intent === "UNKNOWN" && agentMode !== "HUMAN_ASSISTED" && ctx.menuCatalog.length > 0) {
            const catalogReply = findCatalogMatch(lastMessage.content, ctx.menuCatalog, ctx.pedidoUrl);
            if (catalogReply) {
              replyText      = appendBackToMainMenu(catalogReply);
              triggerHandoff = false;
              gptNeeded      = false;
            }
          }

          if (gptNeeded) {
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

            // If GPT gave a generic/short answer with no URL, append the menu so
            // the customer always knows their options — but only if the full menu
            // hasn't been shown recently (prevents spamming the numbered list after
            // every unknown message within the same 30-min session).
            let fullMenuAppended = false;
            if (!triggerHandoff && effectiveMenuOptions.length > 0 && !replyText.includes("http") && !menuSentRecently) {
              const menuList = buildMenuList(effectiveMenuOptions);
              if (menuList) {
                replyText += "\n\nComo posso te ajudar?" + menuList + "\n\nResponda com o número da opção 😊";
                fullMenuAppended = true;
              }
            }
            if (!triggerHandoff && !fullMenuAppended) {
              replyText = appendBackToMainMenu(replyText);
            }

            // Record knowledge gap when GPT also couldn't answer confidently
            if (gpt.needsHandoff && intent === "UNKNOWN") {
              RestaurantKnowledgeService.createGap(
                restaurantId,
                lastMessage.content,
                conversationId,
              ).catch(() => {});
            }
          }
        } else {
          // Deterministic template path
          if (intent === "GREETING") {
            // First message in conversation + menu options available:
            // ALWAYS show the configured menu first. If restaurant is currently
            // closed, append the closed-status note AFTER the menu — never lead
            // with "estamos fechados" on a greeting.
            const firstName = ctx.customerName?.split(" ")[0]?.trim() ?? null;
            const greetLine = firstName
              ? `Olá, ${firstName}! Tudo bem? 😊 Como posso te ajudar hoje?`
              : ctx.welcomeMessage;
            const menuList = buildMenuList(effectiveMenuOptions);
            let greet = greetLine;
            if (menuList) {
              greet += menuList + "\n\nResponda com o número da opção 😊";
            } else if (ctx.pedidoUrl) {
              greet += `\n\nCardápio: ${ctx.pedidoUrl}`;
            }
            if (!effectivelyOpen && ctx.closedMessage) {
              greet += `\n\n⚠️ ${ctx.closedMessage}`;
            }
            replyText = greet;
          } else {
            replyText = appendBackToMainMenu(templateReply ?? ctx.welcomeMessage);
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

  // ── Hard guard: re-sign unsigned /pedido links ────────────────────────────
  // If signing failed when ctx.pedidoUrl was built (signWaToken threw), the reply
  // contains ?src=whatsapp without waToken.  Attempt a second signing pass here —
  // a transient failure may now succeed, and even if it fails again we log it.
  let replyMetadata: Record<string, unknown> | undefined;
  if (
    replyText.includes("/pedido/") &&
    replyText.includes("src=whatsapp") &&
    !replyText.includes("waToken=") &&
    basePedidoUrl &&
    conversation.customer.phone?.trim()
  ) {
    const freshSigned = buildIdentifiedPedidoUrl(
      basePedidoUrl,
      conversation.customer.phone,
      conversation.customer.name ?? null,
    );
    if (freshSigned?.includes("waToken=")) {
      // Replace any unsigned /pedido URL in the reply text
      const repairedText = replyText.replace(
        /https?:\/\/\S+\/pedido\/\S+/g,
        (match) => {
          if (match.includes("waToken=")) return match; // already signed — leave alone
          if (!match.includes("src=whatsapp")) return match; // unrelated URL — leave alone
          return freshSigned;
        },
      );
      if (repairedText !== replyText) {
        replyText = repairedText;
        replyMetadata = { guardRepaired: true, guardRepairedAt: new Date().toISOString() };
        console.warn(
          `[WhatsAppReceptionistService] Hard guard repaired unsigned /pedido URL for conv ${conversationId}`,
          {
            optionFlow: selectedOpt?.flow ?? null,
            finalHasWaToken: replyText.includes("waToken="),
          },
        );
      } else {
        console.warn(
          `[WhatsAppReceptionistService] Hard guard: fresh signed URL obtained but string replacement missed for conv ${conversationId}`,
        );
      }
    } else {
      console.warn(
        `[WhatsAppReceptionistService] Hard guard: BOTH sign attempts failed for conv ${conversationId}`,
        {
          hasSecret: !!(process.env.NEXTAUTH_SECRET ?? process.env.APP_SECRET),
          secretLen: (process.env.NEXTAUTH_SECRET ?? process.env.APP_SECRET)?.length ?? 0,
        },
      );
    }
  }

  // Log final reply state before sending.
  console.info("[WhatsAppReceptionistService] sending-reply", {
    conversationId,
    replyHasPedidoUrl: replyText.includes("/pedido/"),
    replyHasWaToken:   replyText.includes("waToken="),
    guardRepaired:     replyMetadata?.guardRepaired ?? false,
    replyBuilderPath:
      selectedOpt    ? `option.${selectedOpt.flow}` :
      triggerHandoff ? "handoff" :
      "intent-or-gpt",
  });

  await sendReply(evolutionResult.data, toPhone, replyText, conversationId, replyMetadata);
}

// ─── outbound helper ──────────────────────────────────────────

async function sendReply(
  config: { instanceName: string; baseUrl: string; apiKey: string },
  toPhone: string,
  text: string,
  conversationId: string,
  metadata?: Record<string, unknown>,
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
          ...(metadata ? { metadata } : {}),
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
