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
import { detectBuildCommand } from "@/services/buildos/BuildCommandRouter";
import type { MenuOption } from "@/validators/whatsapp-agent";
import { RestaurantKnowledgeService } from "@/services/knowledge/RestaurantKnowledgeService";
import { markConversationNeedsHuman } from "@/lib/handoff";
import { getPeriodsForRow, isInPeriod, getNextOpenAt, buildClosedMessage } from "@/lib/business-hours";
import { getPublicMenuUrl, getPublicQrUrl, sanitizeCustomerUrl } from "@/lib/public-url";
import { signWaToken } from "@/lib/wa-token";
import {
  P0_FALLBACK_REPLY,
  isRepeatedClarificationLoop,
  classifyReceptionistFailure,
} from "@/services/ai/UnknownFallbackHandler";
import { captureFailure as captureTrainingFailure } from "@/services/agent-training/AgentTrainingFailureCaptureService";
import { detectIntent as detectOrderingIntent } from "@/services/whatsapp/ordering/parser";
import { formatOptionNumber, renderNumberedOptions } from "@/services/whatsapp/ordering/menuFooter";

// ─── constants ────────────────────────────────────────────────

const DAY_NAMES_PT  = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

// "0" / "voltar" / "menu" / "menu principal" → re-render the WhatsApp host menu.
export const BACK_TO_MENU_RE =
  /^(0|voltar|menu|menu\s+principal|voltar\s+menu|in[ií]cio|inicio)$/i;

// Footer appended to every non-handoff branch reply so the customer always
// has a clear exit from any menu sub-branch.
export const BACK_TO_MENU_FOOTER = "\n\n0. menu";

// Sent when the customer sends any non-text message (image, audio, document).
// Does NOT include pedidoUrl — keeps the reply short and actionable.
export const MEDIA_MESSAGE_REPLY =
  "Recebi a imagem 😊\nMe diga rapidinho como posso te ajudar com ela:\n\n" +
  "1️⃣ Quero pedir esse item\n2️⃣ Tenho uma dúvida\n7️⃣ Falar com atendente\n\n0. menu";

// Shown when menuOptions is null/empty in DB — ensures the menu is always visible.
const FALLBACK_MENU_OPTIONS: MenuOption[] = [
  { id: "fallback-text-order", label: "Já sei o que quero pedir",  flow: "text_order" },
  { id: "fallback-menu",       label: "Ver cardápio",               flow: "menu"       },
  { id: "fallback-rodizio",    label: "Rodízio presencial",         flow: "rodizio"    },
  { id: "fallback-hours",      label: "Horário de funcionamento",   flow: "custom"     },
  { id: "fallback-promo",      label: "Promoções",                  flow: "promotions" },
  { id: "fallback-club",       label: "Cazza Club",                 flow: "club"       },
  { id: "fallback-handoff",    label: "Falar com atendente",        flow: "handoff"    },
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
  /^(oi|opa|olá|ola|oii|bom dia|boa tarde|boa noite|hey|hi|hello|e aí|eai|tudo bem|tudo bom|pode ajudar|boas|fala|test(e)?|começar|inicio|ajuda|help)\b/i;
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

export function detectIntent(text: string): Intent {
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

// Street-address shapes ("Rua X 123", "Av. Y, 45", a bare CEP) that a customer
// may drop out of the blue. With no active order session the receptionist must
// NOT answer with the restaurant's own address and must NOT hand off — it should
// guide the customer to start an order so the CEP is collected at the right step.
const STREET_PREFIX_RE =
  /^\s*(rua|r\.|av\.?|avenida|alameda|al\.|travessa|tv\.|estrada|rod\.|rodovia|pra[çc]a|viela|vila|jardim|jd\.|loteamento)\s+/i;
const CEP_RE = /\b\d{5}-?\d{3}\b/;

/** True when the message looks like the customer's own delivery address. */
export function looksLikeLooseAddress(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (CEP_RE.test(t)) return true;
  // Street prefix AND a house-number-like digit somewhere in the message.
  return STREET_PREFIX_RE.test(t) && /\d/.test(t);
}

/**
 * True when the message is an explicit order ("quero 1 yakisoba", "manda 2
 * temakis", "1x hot roll", "pode mandar um combinado"). Delegates to the shared
 * ordering intent detector so the receptionist and the Text Order engine agree
 * on what counts as an order. Pure questions ("tem temaki?") stay non-orders.
 */
export function isExplicitOrderMessage(text: string): boolean {
  return detectOrderingIntent(text) === "ORDER_REQUEST";
}

/**
 * Detects if the customer selected a numbered or named menu option.
 * Supports: "1", "2", "3" (by position) or exact label match.
 */
export function detectSelectedOption(text: string, options: MenuOption[]): MenuOption | null {
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

export interface ReplyContext {
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

/** Formats the configured menu options as an emoji-numbered text list.
 * Inserts a visual separator between option 2 and option 3 when ≥3 options,
 * grouping primary order actions (1-2) from secondary options (3+). */
export function buildMenuList(options: MenuOption[]): string {
  if (options.length === 0) return "";
  const lines: string[] = [];
  for (let i = 0; i < options.length; i++) {
    if (i === 2 && options.length > 2) {
      lines.push("\n────────────\n\nOutras opções:");
    }
    lines.push(`${formatOptionNumber(i + 1)} ${options[i]!.label}`);
  }
  return "\n\n" + lines.join("\n");
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
    // Tolerate singular/plural: "tem temaki?" should still match a "Temakis"
    // category (and vice-versa) so a simple question gets a safe answer.
    const catNormS = catNorm.length >= 5 ? catNorm.replace(/s$/, "") : catNorm;
    const hitTerm = msgNorm.includes(catNorm)
      ? catNorm
      : catNormS !== catNorm && msgNorm.includes(catNormS)
        ? catNormS
        : null;
    if (!hitTerm) continue;

    // Skip if the category name is negated right before it (e.g., "não tem combos")
    const catIdx = msgNorm.indexOf(hitTerm);
    const before = msgNorm.slice(Math.max(0, catIdx - 20), catIdx);
    if (/\bn[aã]o\b/.test(before)) continue;

    const catDisplay = cat.name.charAt(0).toUpperCase() + cat.name.slice(1);
    // Confirm existence WITHOUT leading with a raw cardápio URL — a simple
    // "tem X?" must not get a giant link as the primary body. The customer is
    // offered a clean numbered path (tapping 1 opens the cardápio link).
    return pedidoUrl
      ? `Temos ${catDisplay} sim 😊 Para ver as opções e pedir, escolha:\n\n${renderNumberedOptions(["Fazer pedido pelo cardápio", "Falar com atendente"])}`
      : `Temos ${catDisplay} sim 😊 É só nos perguntar mais detalhes!`;
  }
  return null;
}

/** Reply when the customer selects "Já sei o que quero pedir" (text ordering). */
export function buildTextOrderConfirmationReply(): string {
  return (
    "Perfeito 😊 Me manda seu pedido por mensagem.\n\n" +
    "Ex: 1 yakisoba de frango e 1 coca-cola\n\n" +
    "Vou anotando sua comanda por aqui."
  );
}

/** Reply for the "Rodízio presencial" menu option. */
export function buildRodizioReply(ctx: ReplyContext): string {
  const parts: string[] = ["O rodízio é presencial 😊 Venha nos visitar!"];
  if (ctx.address)   parts.push(`📍 ${ctx.address}`);
  if (ctx.hoursText) parts.push(ctx.hoursText);
  parts.push("Qualquer dúvida, entre em contato:");
  return parts.join("\n\n");
}

/** Reply for the "Cazza Club" menu option. */
export function buildClubReply(_ctx: ReplyContext): string {
  return (
    "Cazza Club é o nosso programa de fidelidade 🎉\n\n" +
    "Acumule pontos a cada pedido e troque por recompensas!\n\n" +
    "Para saber mais ou se cadastrar, fale com nossa equipe:"
  );
}

/** Builds the reply for a specific selected menu option (by number or label). */
export function buildFlowReply(opt: MenuOption, ctx: ReplyContext): string {
  const { orderPreMessage, pedidoUrl, handoffMessage } = ctx;
  switch (opt.flow) {
    case "order":
      if (!ctx.isCurrentlyOpen) {
        const base = ctx.closedMessage ?? "No momento estamos fechados.";
        return pedidoUrl
          ? `${base}\n\nVeja nosso cardápio (pedidos pausados até reabrirmos):\n\n${pedidoUrl}`
          : base;
      }
      // Double newline so the URL sits on its own paragraph — WhatsApp renders a rich
      // link preview card which looks cleaner than an inline long URL.
      return pedidoUrl ? `${orderPreMessage}\n\n${pedidoUrl}` : orderPreMessage;
    case "handoff":
      if (!ctx.isCurrentlyOpen) {
        const base = ctx.closedMessage ?? "No momento estamos fechados.";
        const menuList = buildMenuList(ctx.menuOptions);
        return (
          base +
          "\n\nNosso atendimento humano retorna quando estivermos abertos." +
          (menuList ? `\n\nEnquanto isso, posso te ajudar:${menuList}` : "")
        );
      }
      return handoffMessage;
    case "menu":
      return pedidoUrl
        ? `Aqui está nosso cardápio:\n\n${pedidoUrl}`
        : "Entre em contato com a loja para acessar o cardápio.";
    case "promotions":
      return pedidoUrl
        ? `Confira nossas promoções atuais:\n\n${pedidoUrl}`
        : "Entre em contato com a loja para saber sobre nossas promoções.";
    case "custom":
      if (opt.message?.trim()) return opt.message.trim();
      return ctx.hoursText ?? ctx.welcomeMessage;
    case "text_order":
      return buildTextOrderConfirmationReply();
    case "rodizio":
      return buildRodizioReply(ctx);
    case "club":
      return buildClubReply(ctx);
    default:
      return ctx.welcomeMessage;
  }
}

export function appendBackToMainMenu(text: string): string {
  return text + BACK_TO_MENU_FOOTER;
}

/**
 * Reply for an explicit order when this phone is hosted by the receptionist
 * (outside the Text Order allowlist, or the feature is off). NEVER dumps a raw
 * cardápio URL as the primary body and NEVER claims "temos X sim" — it offers a
 * clean numbered path so the customer is conducted, not redirected to a link.
 */
export function buildOrderIntentReply(_ctx: ReplyContext): string {
  return (
    "Claro 😊 Para fazer seu pedido, escolha uma opção:\n\n" +
    renderNumberedOptions(["Já sei o que quero pedir", "Fazer pedido pelo cardápio", "Falar com atendente"])
  );
}

/**
 * Reply for a payment/Pix question with NO active order session. Answers the
 * actual question first (method-aware), never sends a raw cardápio link, then
 * conducts the customer to the next sales step. A consultative-sales response,
 * not a régua: "responder a pergunta real → conduzir para o pedido".
 */
export function buildPaymentInfoReply(message: string): string {
  const t = (message ?? "").toLowerCase();
  const asksPix  = /pix/.test(t);
  const asksCard = /cart[aã]o|cr[eé]dito|d[eé]bito|parcel/.test(t);
  const asksCash = /dinheiro|esp[eé]cie/.test(t);

  // Answer the specific method asked; otherwise affirm the common methods.
  let head: string;
  if (asksPix && !asksCard && !asksCash)       head = "Sim, aceitamos Pix 😊";
  else if (asksCard && !asksPix && !asksCash)  head = "Sim, aceitamos cartão 😊";
  else if (asksCash && !asksPix && !asksCard)  head = "Sim, aceitamos dinheiro 😊";
  else                                          head = "Aceitamos Pix, cartão e dinheiro 😊";

  return (
    `${head} Quer fazer seu pedido agora?\n\n` +
    renderNumberedOptions(["Fazer pedido", "Falar com atendente"])
  );
}

/**
 * Reply when the customer drops a street address with no active order session.
 * Never exposes the restaurant's own location and never auto-hands off — guides
 * the customer to start an order (the CEP is collected when we ask for it).
 */
export function buildLooseAddressReply(_ctx: ReplyContext): string {
  return (
    "Para calcular a entrega certinho, comece seu pedido pelo item desejado " +
    "ou envie o CEP quando eu pedir 😊\n\n" +
    renderNumberedOptions(["Fazer pedido", "Falar com atendente"])
  );
}

export function renderMainMenu(ctx: ReplyContext, optionsOverride?: MenuOption[]): string {
  const opts = optionsOverride ?? ctx.menuOptions;
  const menuList = buildMenuList(opts);
  if (!menuList) return ctx.welcomeMessage;
  return "Oi! 😊 Como você prefere começar?" + menuList + BACK_TO_MENU_FOOTER;
}

/** Renders a one-level submenu (its children numbered) with the "0. menu" escape. */
export function renderSubmenu(parent: MenuOption, options: MenuOption[]): string {
  const list = buildMenuList(options);
  if (!list) return parent.label;
  return `${parent.label} — escolha uma opção:` + list + BACK_TO_MENU_FOOTER;
}

// ── Receptionist response observability (single source of truth) ──────────────
//
// classifyReplyText labels what a FINISHED receptionist reply IS, by inspecting
// the text only. run() logs it for every live reply and the host-routing
// diagnostic classifies its hermetic preview with the SAME function — so the
// diagnostic can never silently drift from production behaviour.

export type ReceptionistResponseType =
  | "SAFE_MENU"      // numbered options / orientation — no raw link, no location
  | "LINK_CARDAPIO"  // a cardápio/pedido URL is a primary body
  | "HANDOFF"        // escalating to a human
  | "LOCATION"       // exposes the restaurant's own address
  | "UNKNOWN";       // generic / GPT / hours — non-deterministic

const HANDOFF_TEXT_RE =
  /chamando (um |o )?atendente|vou (deixar|chamar|te (passar|transferir)).*(atendente|equipe|algu[eé]m)|transferindo.*(atendente|equipe)|aguarde um momento|um minutinho|\batendente\b/i;

/** True when `text` contains a raw http(s) link (cardápio/pedido). */
function textHasRawLink(text: string): boolean {
  return /https?:\/\//i.test(text ?? "");
}

/** True when `text` exposes the restaurant's own street address. */
function textHasRestaurantLocation(text: string, address: string | null): boolean {
  const t = text ?? "";
  if (/estamos em:/i.test(t)) return true;
  const street = address?.split(",")[0]?.trim();
  return !!street && street.length >= 4 && t.includes(street);
}

/**
 * Labels a finished receptionist reply by inspecting its text. Order matters: a
 * safe numbered menu lists "Falar com atendente" as an OPTION but is NOT a
 * handoff; a real handoff is a short escalation line with no menu footer/link.
 */
export function classifyReplyText(text: string, address: string | null = null): ReceptionistResponseType {
  const t = (text ?? "").trim();
  if (!t) return "UNKNOWN";
  if (textHasRestaurantLocation(t, address)) return "LOCATION";
  if (textHasRawLink(t)) return "LINK_CARDAPIO";
  const looksLikeMenu =
    /1️⃣/.test(t) ||
    /escolha uma op[çc][aã]o|para calcular a entrega|menu principal|responda com o n[uú]mero|\n0\.\s*menu/i.test(t);
  if (looksLikeMenu) return "SAFE_MENU";
  if (HANDOFF_TEXT_RE.test(t)) return "HANDOFF";
  return "UNKNOWN";
}

export interface ReceptionistPreview {
  responseType:               ReceptionistResponseType;
  containsRawLink:            boolean;
  containsHandoff:            boolean;
  containsRestaurantLocation: boolean;
  endsWithMenuFooter:         boolean;
  /** False for the knowledge-base / GPT branches (non-deterministic). */
  deterministic:              boolean;
  preview:                    string;
}

/**
 * Hermetically predicts the receptionist reply for a TEXT message, mirroring the
 * DETERMINISTIC branch order of run() (back-to-menu, selected option, loose
 * address, explicit order, handoff, template). The knowledge-base and GPT
 * branches are non-deterministic → flagged deterministic=false with a marker.
 * Pure: no DB, no Evolution, no GPT, no order/Pix.
 */
export function previewReceptionistResponse(message: string, ctx: ReplyContext): ReceptionistPreview {
  const raw = (message ?? "").trim();
  const intent = detectIntent(raw);
  let text = "";
  let deterministic = true;
  // When a branch IS a handoff, the branch is ground truth — the responseType is
  // HANDOFF regardless of the restaurant's custom handoff copy (which a text
  // classifier could miss). Avoids mislabeling a real handoff as SAFE_MENU.
  let forcedType: ReceptionistResponseType | null = null;

  if (BACK_TO_MENU_RE.test(raw)) {
    text = renderMainMenu(ctx);
  } else {
    const selectedOpt = detectSelectedOption(raw, ctx.menuOptions);
    if (selectedOpt) {
      text = buildFlowReply(selectedOpt, ctx);
      if (selectedOpt.flow !== "handoff") text = appendBackToMainMenu(text);
      else forcedType = "HANDOFF";
    } else {
      const explicitOrder = isExplicitOrderMessage(raw);
      const looseAddress  = looksLikeLooseAddress(raw);
      if (looseAddress && intent !== "COMPLAINT" && intent !== "HUMAN_REQUEST") {
        text = appendBackToMainMenu(buildLooseAddressReply(ctx));
      } else if (explicitOrder && intent !== "COMPLAINT" && intent !== "HUMAN_REQUEST") {
        text = ctx.isCurrentlyOpen
          ? appendBackToMainMenu(buildOrderIntentReply(ctx))
          : appendBackToMainMenu(ctx.closedMessage ?? "No momento estamos fechados.");
      } else if (needsHandoff(intent, ctx.agentMode)) {
        if (!ctx.isCurrentlyOpen && intent === "HUMAN_REQUEST") {
          const closedBase =
            (ctx.closedMessage ?? "No momento estamos fechados.") +
            "\n\nNosso atendimento humano retorna quando estivermos abertos.";
          const closedMenu = buildMenuList(ctx.menuOptions);
          text = appendBackToMainMenu(
            closedBase + (closedMenu ? `\n\nEnquanto isso, posso te ajudar:${closedMenu}` : ""),
          );
        } else {
          text = ctx.handoffMessage;
          forcedType = "HANDOFF";
        }
      } else {
        const templateReply = buildTemplateReply(intent, ctx, raw);
        const useGpt =
          (intent === "UNKNOWN" && ctx.agentMode !== "HUMAN_ASSISTED") ||
          (templateReply === null && intent !== "GREETING");
        if (useGpt) {
          // UNKNOWN may be short-circuited by a catalog match (→ link) before GPT.
          const catalog =
            intent === "UNKNOWN" && ctx.agentMode !== "HUMAN_ASSISTED" && ctx.menuCatalog.length > 0
              ? findCatalogMatch(raw, ctx.menuCatalog, ctx.pedidoUrl)
              : null;
          if (catalog) {
            text = appendBackToMainMenu(catalog);
          } else {
            deterministic = false;
            text = "(resposta gerada via GPT — não-determinística; pode incluir menu/handoff)";
          }
        } else if (intent === "GREETING") {
          text = renderMainMenu(ctx); // representative: a greeting always opens the menu
        } else {
          text = appendBackToMainMenu(templateReply ?? ctx.welcomeMessage);
        }
      }
    }
  }

  const responseType = forcedType ?? (deterministic ? classifyReplyText(text, ctx.address) : "UNKNOWN");
  return {
    responseType,
    containsRawLink:            textHasRawLink(text),
    containsHandoff:            responseType === "HANDOFF",
    containsRestaurantLocation: textHasRestaurantLocation(text, ctx.address),
    endsWithMenuFooter:         /\n0\.\s*menu\s*$/i.test(text),
    deterministic,
    preview:                    text,
  };
}

function buildTemplateReply(intent: Intent, ctx: ReplyContext, message: string = ""): string | null {
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
      // Answer the actual payment question (method-aware) and conduct to the
      // order — NEVER a raw cardápio link (that triggers LINK_CARDAPIO, a P0).
      return buildPaymentInfoReply(message);

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
      id:              true,
      restaurantId:    true,
      status:          true,
      aiEnabled:       true,
      activeSubmenuId: true,
      customer:        { select: { id: true, phone: true, name: true } },
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
  const sameLocalDay = (a: Date, b: Date) =>
    a.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ===
    b.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  // A new calendar day ALWAYS resets the conversation (menu shows again).
  const menuSentRecently = lastOutbound
    ? nowDate.getTime() - lastOutbound.sentAt.getTime() < MENU_COOLDOWN_MS &&
      sameLocalDay(nowDate, lastOutbound.sentAt)
    : false;

  // When paused, treat as closed for all intent handling
  const effectivelyOpen = isCurrentlyOpen && !isPaused;

  // Strip handoff-type options while the restaurant is closed / paused so that
  // "Falar com atendente" never appears in the menu shown to the customer.
  const effectiveMenuOptions: MenuOption[] = effectivelyOpen
    ? menuOptions
    : menuOptions.filter((o) => o.flow !== "handoff");

  // Submenu context (one level): if the customer is inside a configured submenu,
  // the numbered options they currently see are that submenu's children.
  const activeSubmenuParent = conversation.activeSubmenuId
    ? menuOptions.find(
        (o) => o.id === conversation.activeSubmenuId && (o.submenuOptions?.length ?? 0) > 0,
      )
    : undefined;
  const currentMenuOptions: MenuOption[] = activeSubmenuParent
    ? (effectivelyOpen
        ? activeSubmenuParent.submenuOptions!
        : activeSubmenuParent.submenuOptions!.filter((o) => o.flow !== "handoff"))
    : effectiveMenuOptions;
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
    await sendReply(evolutionResult.data, toPhone, MEDIA_MESSAGE_REPLY, conversationId);
    return;
  }

  // ── Defense-in-depth: internal command suppression ───────────────────────
  // /build, /cmd, /prompt prefixes must be intercepted before WebhookProcessorService
  // calls this function. If one reaches here anyway (deploy gap, test bypass,
  // etc.), drop it silently — no AI call, no Evolution send, no echo to customer.
  if (detectBuildCommand(lastMessage.content)) {
    console.warn("[WhatsAppReceptionistService] internal command reached receptionist — suppressed", { conversationId });
    return;
  }

  // ── Back-to-menu shortcut ─────────────────────────────────────────────────
  if (BACK_TO_MENU_RE.test(lastMessage.content.trim())) {
    // "0"/"menu" always returns to the TOP-level menu — drop any submenu context.
    if (conversation.activeSubmenuId) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data:  { activeSubmenuId: null },
      });
    }
    // Use full (unfiltered) options if effectiveMenuOptions is empty — the
    // "0. menu" shortcut must always render something, even when closed.
    const backMenuOptions = effectiveMenuOptions.length > 0 ? effectiveMenuOptions : menuOptions;
    await sendReply(evolutionResult.data, toPhone, renderMainMenu(ctx, backMenuOptions), conversationId);
    return;
  }

  // ── Check if customer selected a numbered or named menu option ────────────
  // Resolve against the options currently on screen — the submenu's children when
  // the customer is inside one, otherwise the top-level menu.
  const selectedOpt = detectSelectedOption(lastMessage.content, currentMenuOptions);

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
      inSubmenu:            !!activeSubmenuParent,
      ctxPedidoUrlHasWaToken: ctx.pedidoUrl?.includes("waToken=") ?? false,
    });

    if (selectedOpt.flow === "submenu" && (selectedOpt.submenuOptions?.length ?? 0) > 0) {
      // Open the submenu: show its children and remember we're inside it so the
      // next numbered reply resolves against them.
      const subOptions = effectivelyOpen
        ? selectedOpt.submenuOptions!
        : selectedOpt.submenuOptions!.filter((o) => o.flow !== "handoff");
      await prisma.conversation.update({
        where: { id: conversationId },
        data:  { activeSubmenuId: selectedOpt.id },
      });
      replyText = renderSubmenu(selectedOpt, subOptions);
    } else if (selectedOpt.flow === "text_order") {
      if (agentMode === "MENU_ONLY") {
        // Menu-only safe mode: no AI order-taking → send the customer to the team.
        replyText = appendBackToMainMenu("Para fazer seu pedido, fale com nossa equipe 😊");
      } else {
        // "Digitar pedido" → hand the conversation to the Text Ordering engine when
        // it's live + reply-capable for this restaurant+phone (safe-by-default: off
        // unless explicitly enabled). Falls back to the canned prompt otherwise.
        const { startOrderFromMenu } = await import("@/services/whatsapp/ordering/startOrderFromMenu");
        const prompt = await startOrderFromMenu({
          restaurantId:   conversation.restaurantId,
          phone:          conversation.customer.phone ?? "",
          conversationId,
          customerId:     conversation.customer.id ?? null,
        });
        replyText = prompt ?? appendBackToMainMenu(buildFlowReply(selectedOpt, ctx));
      }
      if (conversation.activeSubmenuId) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data:  { activeSubmenuId: null },
        });
      }
    } else {
      // Terminal option: run its flow, then return to the top-level menu.
      replyText      = buildFlowReply(selectedOpt, ctx);
      triggerHandoff = selectedOpt.flow === "handoff";
      if (!triggerHandoff) {
        replyText = appendBackToMainMenu(replyText);
      }
      if (conversation.activeSubmenuId) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data:  { activeSubmenuId: null },
        });
      }
    }
  } else if (agentMode === "MENU_ONLY") {
    // Menu-only safe mode: no AI. Anything that isn't a menu selection just
    // re-shows the fixed menu (greetings included). Ordering goes through the
    // menu's "Falar com atendente" option.
    if (conversation.activeSubmenuId) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data:  { activeSubmenuId: null },
      });
    }
    replyText = renderMainMenu(ctx, effectiveMenuOptions.length > 0 ? effectiveMenuOptions : menuOptions);
  } else {
    // Not a menu/submenu selection → abandon any submenu context (back to main).
    if (conversation.activeSubmenuId) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data:  { activeSubmenuId: null },
      });
    }
    const intent = detectIntent(lastMessage.content);
    const explicitOrder = isExplicitOrderMessage(lastMessage.content);
    const looseAddress  = looksLikeLooseAddress(lastMessage.content);

    // ── Loose address without an order session ────────────────────────────────
    // The customer sent their own street address out of the blue. The receptionist
    // is the host (a real Text Order session would have intercepted this), so we
    // must NOT reply with the restaurant's location and must NOT hand off — guide
    // them to start an order. Checked first so an address that also looks order-ish
    // ("Rua X 60") never falls into the order or handoff branches.
    if (looseAddress && intent !== "COMPLAINT" && intent !== "HUMAN_REQUEST") {
      replyText      = appendBackToMainMenu(buildLooseAddressReply(ctx));
      triggerHandoff = false;
    }
    // ── Explicit order outside the Text Order allowlist ──────────────────────
    // "quero 1 rodízio", "manda 2 temakis", "1x hot roll" — never answer with a
    // raw cardápio link or "temos X sim". Offer a clean numbered path instead.
    else if (explicitOrder && intent !== "COMPLAINT" && intent !== "HUMAN_REQUEST") {
      if (!effectivelyOpen) {
        const base = ctx.closedMessage ?? "No momento estamos fechados.";
        replyText = appendBackToMainMenu(base);
      } else {
        replyText = appendBackToMainMenu(buildOrderIntentReply(ctx));
      }
      triggerHandoff = false;
    }
    // Hard handoff intents — never use GPT, always escalate immediately
    else if (needsHandoff(intent, agentMode)) {
      // When closed, HUMAN_REQUEST cannot be served — inform the customer and
      // show the reduced closed-hours menu. COMPLAINT / ORDER_STATUS are
      // emergencies and still escalate unconditionally even when closed.
      if (!effectivelyOpen && intent === "HUMAN_REQUEST") {
        const base = ctx.closedMessage ?? "No momento estamos fechados.";
        const closedMenuList = buildMenuList(effectiveMenuOptions);
        replyText =
          base +
          "\n\nNosso atendimento humano retorna quando estivermos abertos." +
          (closedMenuList ? `\n\nEnquanto isso, posso te ajudar:${closedMenuList}` : "");
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
        const templateReply = buildTemplateReply(intent, ctx, lastMessage.content);

        // GPT is used for:
        //   - UNKNOWN intent in RECEPTIONIST_ONLY mode
        //   - any data-backed intent where template data is unavailable
        // NOTE: GREETING and MENU_REQUEST are NEVER routed to GPT — both
        // always show the configured numbered menu (template path below).
        const useGpt =
          (intent === "UNKNOWN" && agentMode !== "HUMAN_ASSISTED") ||
          (templateReply === null && intent !== "GREETING" && intent !== "MENU_REQUEST");

        // Within the 30-min session: short re-engagement only — menu already visible,
        // no need to repeat the numbered list. Compact footer keeps the escape hatch.
        // P0 hotfix: a greeting ALWAYS opens the full menu (never the
        // "Estou aqui!" continuation) — falls through to the template path below.
        if (useGpt) {
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

            // P0: Detect repeated clarification loop — if agent is about to send
            // the same clarification 2+ times, escalate rather than loop.
            const recentAgentReplies = conversationHistory
              .filter((m) => m.role === "assistant")
              .map((m) => m.content);
            const isLoop = !triggerHandoff && isRepeatedClarificationLoop(recentAgentReplies, replyText);
            if (isLoop) {
              replyText      = P0_FALLBACK_REPLY;
              triggerHandoff = true;
            } else if (triggerHandoff) {
              // P0: When GPT decides handoff, always use the canonical safe phrase
              // instead of whatever GPT generated (could be hallucinated or confusing).
              replyText = P0_FALLBACK_REPLY;
            }

            // Menu is the anchor: ALWAYS append the numbered list to GPT replies so
            // the customer sees their options on every turn — even when closed (fall
            // back to the full configured list) or when the reply contains a link.
            const gptMenuOptions =
              effectiveMenuOptions.length > 0 ? effectiveMenuOptions : menuOptions;
            let fullMenuAppended = false;
            if (!triggerHandoff && gptMenuOptions.length > 0) {
              const menuList = buildMenuList(gptMenuOptions);
              if (menuList) {
                replyText += "\n\nComo posso te ajudar?" + menuList + BACK_TO_MENU_FOOTER;
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

            // P0: Capture failure for training (async, non-blocking)
            if (triggerHandoff) {
              const failureCategory = isLoop
                ? ("REPEATED_CLARIFICATION_LOOP" as const)
                : classifyReceptionistFailure(intent, gpt.needsHandoff, false);
              captureTrainingFailure({
                restaurantId,
                conversationId,
                agentType:        "WHATSAPP_RECEPTIONIST",
                source:           "LIVE_FAILURE",
                failureCategory,
                customerMessage:  lastMessage.content,
                recentTranscript: conversationHistory.map((m) => ({ role: m.role, content: m.content })),
                agentReply:       replyText,
                intent,
                safetyNotes:      "P0 fallback activated — handoff triggered",
              }).catch(() => {});
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
            // Menu is the anchor: show effective (filtered) options but fall back
            // to the full list so the greeting ALWAYS renders the numbered menu.
            const greetOptions = effectiveMenuOptions.length > 0 ? effectiveMenuOptions : menuOptions;
            const menuList = buildMenuList(greetOptions);
            let greet = greetLine;
            if (menuList) {
              greet += menuList + BACK_TO_MENU_FOOTER;
            } else if (ctx.pedidoUrl) {
              greet += `\n\nCardápio: ${ctx.pedidoUrl}`;
            }
            if (!effectivelyOpen && ctx.closedMessage) {
              greet += `\n\n⚠️ ${ctx.closedMessage}`;
            }
            replyText = greet;
          } else if (intent === "MENU_REQUEST") {
            // "menu", "cardápio", "ver opções" — always show the numbered menu.
            // Never delegate to GPT: the menu is fixed and must not be
            // summarised or rewritten by the model.
            const menuOpts = effectiveMenuOptions.length > 0 ? effectiveMenuOptions : menuOptions;
            const menuListMR = buildMenuList(menuOpts);
            if (menuListMR) {
              replyText = `Como posso te ajudar hoje?${menuListMR}${BACK_TO_MENU_FOOTER}`;
              if (ctx.pedidoUrl) {
                replyText += `\n\nCardápio completo: ${ctx.pedidoUrl}`;
              }
            } else {
              replyText = appendBackToMainMenu(templateReply ?? ctx.welcomeMessage);
            }
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
    responseType:      classifyReplyText(replyText, ctx.address),
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
          ...(metadata ? { metadata: metadata as object } : {}),
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
