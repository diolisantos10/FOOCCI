/**
 * Ready-made campaigns — the canonical catalog of pre-built restaurant campaigns.
 *
 * Product intent (HEAD de CRM): the owner should NOT assemble campaigns from
 * scratch. Foocci ships the campaigns that make sense for any restaurant, already
 * configured (name, audience, message, safe schedule). The owner clicks to turn
 * one on and only edits if they want. A separate "Criar minha campanha" button
 * covers full customization. There is no separate "Automações" concept — these ARE
 * the campaigns.
 *
 * Philosophy — rescue BEFORE the customer drops a level. The reactivation ladder
 * (quente-esfriando → morno → frio) fires while the customer is still recoverable,
 * not only once they are already lost.
 *
 * Engine: almost all ready-made campaigns are recurring campaigns driven by the
 * battle-tested ScheduledCampaignRunnerService + global safety budget. Cart
 * recovery has its own event engine. Nothing here sends — activation creates a
 * campaign that the runner executes under the normal safety rules.
 *
 * Pure module: no DB, no network. Safe on the client (catalog rendering).
 */

/** Which engine actually delivers this ready-made campaign. */
export type ReadyMadeEngine = "RECURRING" | "CART_RECOVERY";

/** Budget priority bucket (must match CRMWhatsAppBudgetPlanner.inferCampaignPriority). */
export type ReadyMadePriority =
  | "BIRTHDAY"
  | "CART_ABANDONED"
  | "POST_ORDER_REVIEW"
  | "REACTIVATION_COLD"
  | "GENERIC_PROMO";

export interface ReadyMadeSchedule {
  /** 0=Sunday … 6=Saturday. */
  weekdays:   number[];
  /** Local send window "HH:MM". */
  timeWindow: { start: string; end: string };
  /** Per-campaign daily cap (the global budget still caps the whole CRM per cycle). */
  dailyLimit: number;
}

export interface ReadyMadeCampaign {
  /** Stable key; also the campaign templateId so budget priority is inferred from it. */
  id:            string;
  emoji:         string;
  /** Owner-facing name. */
  name:          string;
  /** One-line description of who receives it and when. */
  tagline:       string;
  /** Longer owner-facing explanation. */
  description:   string;
  objective:     string;
  engine:        ReadyMadeEngine;
  /** Segment/template key resolved by resolveAudience (RECURRING engine only). */
  targetSegment: string;
  priority:      ReadyMadePriority;
  /** Default WhatsApp message (owner-editable). Uses {nome}, {restaurante}, links. */
  defaultMessage: string;
  /** Optional suggested coupon code the owner can attach. */
  suggestedCoupon?: string;
  schedule:      ReadyMadeSchedule;
  /** Which fields the inline editor exposes. */
  editable:      Array<"message" | "schedule" | "dailyLimit" | "coupon">;
}

const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];
const LUNCH_DINNER = { start: "11:00", end: "20:00" };

export const READY_MADE_CAMPAIGNS: ReadyMadeCampaign[] = [
  {
    id:          "pedido-avaliacao",
    emoji:       "⭐",
    name:        "Pedir avaliação",
    tagline:     "Depois da entrega, pede uma avaliação no Google/iFood",
    description: "Logo após um pedido entregue, convida o cliente a avaliar. Mais avaliações = mais novos clientes encontram você.",
    objective:   "Aumentar avaliações no Google e iFood",
    engine:      "RECURRING",
    targetSegment: "pedido-avaliacao",
    priority:    "POST_ORDER_REVIEW",
    defaultMessage:
      "Oi, {nome}! 😊 Obrigado pelo seu pedido no {restaurante}! Se você curtiu, uma avaliação ajuda demais a gente — leva só 10 segundinhos: {link_avaliacao_google}",
    schedule:    { weekdays: ALL_WEEK, timeWindow: { start: "12:00", end: "20:00" }, dailyLimit: 30 },
    editable:    ["message", "schedule", "dailyLimit"],
  },
  {
    id:          "aniversariantes",
    emoji:       "🎂",
    name:        "Aniversário",
    tagline:     "No dia do aniversário do cliente, com um mimo",
    description: "Envia uma mensagem carinhosa no aniversário do cliente. Aniversário pode passar por cima do intervalo normal entre mensagens — mas nunca do opt-out.",
    objective:   "Surpreender o cliente no dia especial e gerar um pedido",
    engine:      "RECURRING",
    targetSegment: "aniversariantes",
    priority:    "BIRTHDAY",
    defaultMessage:
      "Feliz aniversário, {nome}! 🎉 O {restaurante} preparou um presente pra você comemorar com sabor. É só pedir hoje pelo cardápio: {link_cardapio}",
    suggestedCoupon: "NIVER15",
    schedule:    { weekdays: ALL_WEEK, timeWindow: { start: "10:00", end: "18:00" }, dailyLimit: 20 },
    editable:    ["message", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "segunda-compra",
    emoji:       "🔁",
    name:        "Bem-vindo / 2ª compra",
    tagline:     "Dias após o 1º pedido, para virar cliente recorrente",
    description: "Cliente que pediu só uma vez é o mais fácil de perder. Um empurrãozinho na hora certa transforma o primeiro pedido em hábito.",
    objective:   "Fidelizar o cliente logo após o primeiro pedido",
    engine:      "RECURRING",
    targetSegment: "segunda-compra",
    priority:    "GENERIC_PROMO",
    defaultMessage:
      "Oi, {nome}! 😄 Que bom ter você com a gente! Que tal repetir a dose? Seu próximo pedido no {restaurante} já tá te esperando: {link_cardapio}",
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    editable:    ["message", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "quente-esfriando",
    emoji:       "🔥",
    name:        "Cliente quente esfriando",
    tagline:     "Antes de virar morno — puxa de volta enquanto ainda pede",
    description: "Resgate proativo: o cliente ainda está ativo, mas se aproximando da fase morna. Um toque leve agora evita que ele esfrie.",
    objective:   "Manter o cliente ativo antes de perder frequência",
    engine:      "RECURRING",
    targetSegment: "quente-esfriando",
    priority:    "REACTIVATION_COLD",
    defaultMessage:
      "Oi, {nome}! 👋 Bateu vontade de algo gostoso? O {restaurante} tá com o cardápio no capricho hoje — dá uma olhada: {link_cardapio}",
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    editable:    ["message", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "reativar-mornos",
    emoji:       "🌡️",
    name:        "Cliente morno",
    tagline:     "Antes de virar frio — lembrança carinhosa no momento certo",
    description: "O cliente sumiu entre 31 e 60 dias. Está a um passo de esfriar de vez. Uma lembrança agora costuma trazê-lo de volta.",
    objective:   "Reativar o cliente antes que ele fique frio",
    engine:      "RECURRING",
    targetSegment: "reativar-mornos",
    priority:    "REACTIVATION_COLD",
    defaultMessage:
      "Oi, {nome}! 🌡️ Faz um tempinho que não te vemos por aqui. Tem novidade deliciosa no {restaurante} — quer ver o cardápio? {link_cardapio}",
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    editable:    ["message", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "recuperar-frios",
    emoji:       "🧊",
    name:        "Cliente frio",
    tagline:     "Última chance antes de virar perdido",
    description: "O cliente não pede há mais de 60 dias — alto risco de perda definitiva. Uma oferta especial é o melhor gatilho para reativar.",
    objective:   "Reconquistar o cliente antes de perdê-lo de vez",
    engine:      "RECURRING",
    targetSegment: "recuperar-frios",
    priority:    "REACTIVATION_COLD",
    defaultMessage:
      "Oi, {nome}! 😊 Sentimos sua falta! O {restaurante} preparou algo especial pra te receber de volta. Confira o cardápio: {link_cardapio}",
    suggestedCoupon: "VOLTEI10",
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    editable:    ["message", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "clientes-vip",
    emoji:       "👑",
    name:        "Cliente VIP",
    tagline:     "Carinho periódico com quem mais gasta (Ouro/Diamante)",
    description: "Seus melhores clientes merecem tratamento diferente. Um mimo exclusivo de tempos em tempos reforça a fidelidade de quem mais compra.",
    objective:   "Recompensar e reter clientes de alto valor",
    engine:      "RECURRING",
    targetSegment: "clientes-vip",
    priority:    "GENERIC_PROMO",
    defaultMessage:
      "Oi, {nome}! ✨ Você é um cliente especial pro {restaurante}, e a gente quer retribuir. Preparamos um mimo exclusivo pra você: {link_cardapio}",
    suggestedCoupon: "VIP15",
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 20 },
    editable:    ["message", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "carrinho-abandonado",
    emoji:       "🛒",
    name:        "Carrinho abandonado",
    tagline:     "Quem começou um pedido e não finalizou",
    description: "O cliente montou o pedido mas não concluiu — está quase comprando. Um lembrete rápido recupera vendas que já estavam prestes a acontecer.",
    objective:   "Converter pedidos iniciados mas não confirmados",
    engine:      "CART_RECOVERY",
    targetSegment: "carrinho-abandonado",
    priority:    "CART_ABANDONED",
    defaultMessage:
      "Oi, {nome}! 🛒 Vi que você começou um pedido no {restaurante} e não finalizou. Posso te ajudar a concluir? É só voltar aqui: {link_cardapio}",
    schedule:    { weekdays: ALL_WEEK, timeWindow: { start: "11:00", end: "22:00" }, dailyLimit: 30 },
    // Cart recovery runs on its own event engine (fires minutes after abandonment
    // with a system-managed message) — so this card only offers on/off for now.
    editable:    [],
  },
];

export function getReadyMadeCampaign(id: string): ReadyMadeCampaign | null {
  return READY_MADE_CAMPAIGNS.find((c) => c.id === id) ?? null;
}

export interface ReadyMadeOverrides {
  message?:    string;
  couponCode?: string;
  weekdays?:   number[];
  timeWindow?: { start: string; end: string };
  dailyLimit?: number;
}

export interface ReadyMadeCampaignPayload {
  name:            string;
  templateId:      string;
  targetSegment:   string;
  messageTemplate: string;
  objective:       string;
  channel:         "WHATSAPP";
  couponCode?:     string;
  scheduleConfig:  Record<string, unknown>;
}

/**
 * Builds the POST /api/crm/campaigns payload for a RECURRING ready-made campaign,
 * applying any owner overrides on top of the safe defaults. Recurring campaigns
 * omit endCondition on purpose so they stay ACTIVE and re-evaluate each cycle.
 *
 * Throws for the CART_RECOVERY engine — that one is toggled through the cart
 * recovery config, not created as a recurring campaign.
 */
export function buildReadyMadeCampaignPayload(
  rm: ReadyMadeCampaign,
  overrides: ReadyMadeOverrides = {},
  timezone = "America/Sao_Paulo",
): ReadyMadeCampaignPayload {
  if (rm.engine !== "RECURRING") {
    throw new Error(`Ready-made campaign "${rm.id}" uses the ${rm.engine} engine and is not created as a recurring campaign.`);
  }
  const coupon = (overrides.couponCode ?? rm.suggestedCoupon ?? "").trim();
  return {
    name:            rm.name,
    templateId:      rm.id,
    targetSegment:   rm.targetSegment,
    messageTemplate: (overrides.message ?? rm.defaultMessage).trim(),
    objective:       rm.objective,
    channel:         "WHATSAPP",
    ...(coupon ? { couponCode: coupon } : {}),
    scheduleConfig: {
      mode:       "RECURRING",
      weekdays:   overrides.weekdays   ?? rm.schedule.weekdays,
      timeWindow: overrides.timeWindow ?? rm.schedule.timeWindow,
      dailyLimit: overrides.dailyLimit ?? rm.schedule.dailyLimit,
      priority:   rm.priority,
      timezone,
    },
  };
}
