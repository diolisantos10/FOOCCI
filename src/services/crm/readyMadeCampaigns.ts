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

/** A coupon defined directly in a campaign card (no separate Promoções area). */
export type CouponType = "PERCENTAGE" | "FIXED" | "CUSTOM";
export interface ReadyMadeCoupon {
  type:  CouponType;
  value: number; // % for PERCENTAGE, R$ for FIXED, estimated R$ cost for CUSTOM
  /** CUSTOM reward text, e.g. "sobremesa grátis". */
  description?: string;
  /** Days the coupon stays valid after being credited. Omitted → 30-day default. */
  validityDays?: number;
}

/** Default coupon validity in days when the owner doesn't set one. */
export const DEFAULT_COUPON_VALIDITY_DAYS = 30;

/** Allowed coupon values, offered as fixed options in the card. */
export const COUPON_PERCENT_OPTIONS = [5, 10, 20, 30, 40, 50] as const;
export const COUPON_FIXED_OPTIONS   = [10, 20, 30, 40, 50] as const;

/** Owner-facing label for a coupon, e.g. "20% OFF" / "R$ 10 OFF" / "sobremesa grátis". */
export function couponLabel(c: ReadyMadeCoupon | null | undefined): string {
  if (!c) return "Sem cupom";
  if (c.type === "CUSTOM") return c.description?.trim() || "Recompensa";
  return c.type === "PERCENTAGE" ? `${c.value}% OFF` : `R$ ${c.value} OFF`;
}

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
  /** Default coupon the campaign grants (owner can change or remove in the card). */
  defaultCoupon?: ReadyMadeCoupon;
  schedule:      ReadyMadeSchedule;
  /** Event-based campaigns: default number of days after the event to send (editable). */
  triggerDays?:  number;
  /** Label for the triggerDays field in the editor. */
  triggerDaysLabel?: string;
  /** Recurring re-contact window in days: a customer may receive this campaign again
   *  after this many days (absent = once ever, the historical default). Powers
   *  monthly-style campaigns like "Mimo mensal por nível". */
  recontactDays?: number;
  /** Which fields the inline editor exposes. */
  editable:      Array<"message" | "schedule" | "dailyLimit" | "coupon" | "triggerDays">;
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
    triggerDays: 2,
    triggerDaysLabel: "Enviar quantos dias após o pedido",
    recontactDays: 60, // may ask again for a later order after 2 months
    editable:    ["message", "triggerDays", "schedule", "dailyLimit"],
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
      "Feliz aniversário, {nome}! 🎉 Você ganhou um presente do {restaurante}: {cupom}! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    defaultCoupon: { type: "PERCENTAGE", value: 20 },
    schedule:    { weekdays: ALL_WEEK, timeWindow: { start: "10:00", end: "18:00" }, dailyLimit: 20 },
    recontactDays: 365, // next year's birthday
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
    triggerDays: 7, // ~1x/semana — não encher o cliente de CRM
    triggerDaysLabel: "Enviar quantos dias após o 1º pedido",
    editable:    ["message", "triggerDays", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "cadastro-sem-compra",
    emoji:       "🌱",
    name:        "Converter 1º pedido",
    tagline:     "Cadastraram mas nunca pediram — leve ao primeiro pedido",
    description: "Clientes que se identificaram (nome e telefone) mas nunca fizeram um pedido. Um convite com um empurrãozinho costuma destravar a primeira compra.",
    objective:   "Levar quem já se cadastrou ao primeiro pedido",
    engine:      "RECURRING",
    targetSegment: "cadastro-sem-compra",
    priority:    "GENERIC_PROMO",
    defaultMessage:
      "Oi, {nome}! 👋 Você ganhou {cupom} pra estrear no {restaurante}! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    defaultCoupon: { type: "PERCENTAGE", value: 10 },
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    recontactDays: 45, // nudge non-buyers again every ~6 weeks
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
    recontactDays: 30, // re-rescue each time they re-enter the cooling window
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
    recontactDays: 30, // keep re-engaging while they stay warm
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
      "Oi, {nome}! 😊 Sentimos sua falta! Você ganhou {cupom} pra voltar ao {restaurante}. 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    defaultCoupon: { type: "PERCENTAGE", value: 10 },
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    recontactDays: 45, // retry cold customers every ~6 weeks
    editable:    ["message", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "recuperar-perdidos",
    emoji:       "💔",
    name:        "Cliente perdido",
    tagline:     "Sumido há muito tempo — última tentativa com oferta forte",
    description: "O cliente não pede há muito tempo (fase perdida). É a última tentativa de reconquista — vale uma oferta mais forte para trazê-lo de volta.",
    objective:   "Reconquistar clientes perdidos com uma oferta especial",
    engine:      "RECURRING",
    targetSegment: "recuperar-perdidos",
    priority:    "REACTIVATION_COLD",
    defaultMessage:
      "Oi, {nome}! 💔 Faz muito tempo... Você ganhou {cupom} pra te reconquistar! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    defaultCoupon: { type: "PERCENTAGE", value: 20 },
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    recontactDays: 60, // retry lost customers every 2 months
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
      "Oi, {nome}! ✨ Você é VIP no {restaurante} e ganhou {cupom} exclusivo! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    defaultCoupon: { type: "PERCENTAGE", value: 20 },
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 20 },
    recontactDays: 30, // periodic VIP mimo, monthly
    editable:    ["message", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "subiu-de-nivel",
    emoji:       "🏆",
    name:        "Subiu de nível",
    tagline:     "Parabeniza e premia quem acabou de subir de nível",
    description: "O momento mais poderoso do programa: o cliente acabou de conquistar um nível novo. A mensagem celebra a conquista e entrega a recompensa na hora — é o que faz ele se sentir valorizado de verdade.",
    objective:   "Celebrar a conquista e reforçar a fidelidade no auge do engajamento",
    engine:      "RECURRING",
    targetSegment: "subiu-de-nivel",
    priority:    "POST_ORDER_REVIEW", // celebration rides the post-order high
    defaultMessage:
      "Parabéns, {nome}! 🏆 Você acaba de virar cliente {nivel} no {restaurante}! E conquista merece prêmio: você ganhou {cupom}! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    defaultCoupon: { type: "PERCENTAGE", value: 10 },
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    triggerDays: 7,
    triggerDaysLabel: "Janela de dias após a subida de nível",
    recontactDays: 30, // a later level-up gets its own congratulation
    editable:    ["message", "triggerDays", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "quase-no-proximo-nivel",
    emoji:       "🏃",
    name:        "Quase no próximo nível",
    tagline:     "Falta pouco pra subir — o empurrão que gera o próximo pedido",
    description: "Clientes a até 20% do próximo nível recebem a conta na mão: \"faltam R$ X pra você virar {proximo_nivel}\". Quem enxerga a meta perto pede de novo pra alcançar — é a alavanca de venda do programa.",
    objective:   "Acelerar o próximo pedido usando a meta de nível como incentivo",
    engine:      "RECURRING",
    targetSegment: "quase-no-proximo-nivel",
    priority:    "GENERIC_PROMO",
    defaultMessage:
      "Oi, {nome}! 🏃 Você tá quase lá: faltam só {falta_proximo_nivel} pra você virar cliente {proximo_nivel} no {restaurante} — e desbloquear vantagens novas! Bora? {link_cardapio}",
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    recontactDays: 30, // remind at most once a month while they're close
    editable:    ["message", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "mimo-mensal-nivel",
    emoji:       "🎁",
    name:        "Mimo mensal por nível",
    tagline:     "Todo mês, um agrado pra quem já subiu na escada (Prata+)",
    description: "Clientes Prata, Ouro e Diamante recebem um mimo todo mês — o benefício recorrente que faz o nível valer a pena e mantém o cliente ativo. Cada cliente recebe no máximo 1 por mês.",
    objective:   "Entregar valor recorrente aos níveis e sustentar a recorrência",
    engine:      "RECURRING",
    targetSegment: "mimo-mensal-nivel",
    priority:    "GENERIC_PROMO",
    defaultMessage:
      "Oi, {nome}! 💛 Chegou seu mimo do mês de cliente {nivel}: você ganhou {cupom}! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    defaultCoupon: { type: "PERCENTAGE", value: 10 },
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    recontactDays: 30, // the "monthly" in Mimo mensal
    editable:    ["message", "schedule", "dailyLimit", "coupon"],
  },
  {
    id:          "cupom-vencendo",
    emoji:       "⏰",
    name:        "Cupom vencendo",
    tagline:     "Avisa quem tem cupom prestes a vencer — antes que perca",
    description: "O cliente ganhou um cupom e esqueceu. Um aviso na reta final da validade transforma cupom parado em pedido — a mensagem mostra o cupom DELE e a data real de vencimento.",
    objective:   "Converter cupons já distribuídos antes de vencerem",
    engine:      "RECURRING",
    targetSegment: "cupom-vencendo",
    priority:    "CART_ABANDONED", // time-critical: the coupon dies in days
    defaultMessage:
      "Oi, {nome}! ⏰ Corre que ainda dá tempo: seu {cupom} vence em {validade}! Use no pedido pelo nosso cardápio: {link_cardapio}",
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    triggerDays: 5, // warn 5 days BEFORE the coupon expires (owner-tunable)
    triggerDaysLabel: "Avisar quantos dias antes de vencer",
    recontactDays: 30, // a NEW expiring coupon deserves a new warning
    editable:    ["message", "triggerDays", "schedule", "dailyLimit"],
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
    defaultCoupon: undefined,
    schedule:    { weekdays: ALL_WEEK, timeWindow: { start: "11:00", end: "22:00" }, dailyLimit: 30 },
    // Cart recovery fires minutes after abandonment on its own event engine, but the
    // owner can still customize WHAT it sends: the message and an optional reward.
    editable:    ["message", "coupon"],
  },
  {
    id:          "siga-redes",
    emoji:       "📸",
    name:        "Siga nas redes",
    tagline:     "Convide os clientes a seguir suas redes sociais",
    description: "Convida os clientes a seguir o restaurante nas redes sociais. Configure as redes na aba Marca — o link entra na mensagem automaticamente.",
    objective:   "Aumentar seguidores e presença nas redes sociais",
    engine:      "RECURRING",
    targetSegment: "TODOS",
    priority:    "GENERIC_PROMO",
    defaultMessage:
      "Oi, {nome}! 😊 Tá curtindo o {restaurante}? Então segue a gente no Instagram pra não perder novidade e promoção: {instagram}",
    schedule:    { weekdays: ALL_WEEK, timeWindow: LUNCH_DINNER, dailyLimit: 30 },
    // Once ever — asking someone to follow you is a one-time invitation (owner decision).
    editable:    ["message", "schedule", "dailyLimit"],
  },
];

export function getReadyMadeCampaign(id: string): ReadyMadeCampaign | null {
  return READY_MADE_CAMPAIGNS.find((c) => c.id === id) ?? null;
}

// ── Per-tier rewards ──────────────────────────────────────────────────────────

/** Campaigns whose reward can differ per tier (scheduleConfig.tierCoupons):
 *  Prata gets X, Ouro gets Y, Diamante gets Z — levels must FEEL different. */
export const TIER_COUPON_CAMPAIGN_IDS = ["subiu-de-nivel", "mimo-mensal-nivel"] as const;

export type TierCouponsConfig = Partial<Record<"PRATA" | "OURO" | "DIAMANTE", ReadyMadeCoupon | null>>;

/**
 * The reward a given recipient should get: their tier's configured coupon when
 * the campaign defines one (explicit null = that tier gets nothing), otherwise
 * the campaign's base coupon.
 */
export function resolveTierCoupon(
  tierCoupons: TierCouponsConfig | null | undefined,
  tier:        string,
  fallback:    ReadyMadeCoupon | null,
): ReadyMadeCoupon | null {
  if (!tierCoupons) return fallback;
  const key = tier as keyof TierCouponsConfig;
  return tierCoupons[key] !== undefined ? (tierCoupons[key] ?? null) : fallback;
}

/**
 * Ready-to-use message options per campaign (≥5). The owner picks one and can edit
 * it freely afterwards. The first entry mirrors the campaign's defaultMessage.
 */
export const READY_MADE_MESSAGE_VARIANTS: Record<string, string[]> = {
  "pedido-avaliacao": [
    "Oi, {nome}! 😊 Obrigado pelo seu pedido no {restaurante}! Se você curtiu, uma avaliação ajuda demais a gente — leva só 10 segundinhos: {link_avaliacao_google}",
    "{nome}, seu pedido chegou certinho? 🙏 Se deu tudo certo, deixa uma estrelinha pra gente — significa muito: {link_avaliacao_google}",
    "Oi, {nome}! Espero que tenha amado o pedido 😍 Uma avaliação rápida ajuda o {restaurante} a crescer. Bora? {link_avaliacao_google}",
    "{nome}, sua opinião vale ouro! ⭐ Conta pra gente como foi seu pedido no {restaurante}: {link_avaliacao_google}",
    "Oi, {nome}! Obrigado pela preferência 💛 Se puder avaliar seu pedido, a gente agradece de coração: {link_avaliacao_google}",
  ],
  "aniversariantes": [
    "Feliz aniversário, {nome}! 🎉 Você ganhou um presente do {restaurante}: {cupom}! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    "{nome}, hoje é seu dia! 🎂 Você ganhou {cupom} de presente — use até {validade}, só em pedidos online: {link_cardapio}",
    "Parabéns, {nome}! 🥳 Você ganhou {cupom} de aniversário! Aproveite até {validade}, pedindo pelo nosso cardápio: {link_cardapio}",
    "Feliz aniversário, {nome}! 💛 Tem presente: você ganhou {cupom}, válido até {validade} em pedidos pelo nosso link: {link_cardapio}",
    "{nome}, muitos anos de vida! 🎈 Você ganhou {cupom} de presente. Use até {validade}, só em pedidos online: {link_cardapio}",
  ],
  "segunda-compra": [
    "Oi, {nome}! 😄 Que bom ter você com a gente! Que tal repetir a dose? Seu próximo pedido no {restaurante} já tá te esperando: {link_cardapio}",
    "{nome}, gostou do primeiro pedido? 😋 Vem de novo — o {restaurante} tá te esperando: {link_cardapio}",
    "Oi, {nome}! Você faz parte da família {restaurante} agora 🤗 Bora repetir? {link_cardapio}",
    "{nome}, que tal matar a vontade de novo? 🍽️ Seu cardápio favorito tá aqui: {link_cardapio}",
    "Oi, {nome}! A gente adorou te atender 💛 Quando bater a fome, é só chamar: {link_cardapio}",
  ],
  "cadastro-sem-compra": [
    "Oi, {nome}! 👋 Você ganhou {cupom} pra estrear no {restaurante}! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    "{nome}, bem-vindo(a)! 😊 Você ganhou {cupom} pro seu primeiro pedido. Aproveite até {validade}, pedindo online: {link_cardapio}",
    "Oi, {nome}! 🎁 Você ganhou {cupom} pra experimentar o {restaurante}. Válido até {validade}, só pelo nosso cardápio: {link_cardapio}",
    "{nome}, seu presente de boas-vindas: você ganhou {cupom}! 😋 Use até {validade} em pedidos online: {link_cardapio}",
    "Oi, {nome}! 🌱 Você ganhou {cupom} pra começar. Válido até {validade}, só em pedidos pelo nosso link: {link_cardapio}",
  ],
  "quente-esfriando": [
    "Oi, {nome}! 👋 Bateu vontade de algo gostoso? O {restaurante} tá com o cardápio no capricho hoje — dá uma olhada: {link_cardapio}",
    "{nome}, que tal um agrado hoje? 😋 O {restaurante} tá pronto pra te atender: {link_cardapio}",
    "Oi, {nome}! Faz uns dias que não te vemos 👀 Bora pedir aquela delícia? {link_cardapio}",
    "{nome}, sua próxima refeição favorita tá a um clique 🍴 {link_cardapio}",
    "Oi, {nome}! O {restaurante} preparou o cardápio pensando em você. Vem ver: {link_cardapio}",
  ],
  "reativar-mornos": [
    "Oi, {nome}! 🌡️ Faz um tempinho que não te vemos por aqui. Tem novidade deliciosa no {restaurante} — quer ver o cardápio? {link_cardapio}",
    "{nome}, saudade de você! 💛 O {restaurante} tem novidades esperando. Bora matar a vontade? {link_cardapio}",
    "Oi, {nome}! Cadê você? 😊 Preparamos coisas boas no cardápio — dá uma espiada: {link_cardapio}",
    "{nome}, que tal voltar a pedir com a gente? 🍽️ O {restaurante} tá te esperando: {link_cardapio}",
    "Oi, {nome}! A gente lembrou de você 😄 Tem prato novo no {restaurante}. Vem ver: {link_cardapio}",
  ],
  "recuperar-frios": [
    "Oi, {nome}! 😊 Sentimos sua falta! Você ganhou {cupom} pra voltar ao {restaurante}. 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    "{nome}, que saudade! 🥺 Você ganhou {cupom} pra te receber de volta. Use até {validade}, pedindo online: {link_cardapio}",
    "Oi, {nome}! 💛 Preparamos um presente: você ganhou {cupom}! Válido até {validade}, só pelo nosso cardápio: {link_cardapio}",
    "{nome}, bora reviver aquele sabor? 😋 Você ganhou {cupom}, válido até {validade} em pedidos online: {link_cardapio}",
    "Oi, {nome}! 🍽️ Você ganhou {cupom} pra voltar a pedir. Aproveite até {validade}, só pelo nosso link: {link_cardapio}",
  ],
  "recuperar-perdidos": [
    "Oi, {nome}! 💔 Faz muito tempo... Você ganhou {cupom} pra te reconquistar! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    "{nome}, sentimos MUITO sua falta 💔 Você ganhou {cupom} especial. Use até {validade}, pedindo online: {link_cardapio}",
    "Oi, {nome}! 🥺 Queremos você de volta: você ganhou {cupom}! Válido até {validade}, só pelo nosso cardápio: {link_cardapio}",
    "{nome}, mais uma chance? 😋 Você ganhou {cupom} de boas-vindas de volta, válido até {validade} em pedidos online: {link_cardapio}",
    "Oi, {nome}! 💛 Não desistimos de você: você ganhou {cupom}! Aproveite até {validade}, só pelo nosso link: {link_cardapio}",
  ],
  "clientes-vip": [
    "Oi, {nome}! ✨ Você é VIP no {restaurante} e ganhou {cupom} exclusivo! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    "{nome}, cliente VIP! 👑 Você ganhou {cupom} exclusivo. Aproveite até {validade}, pedindo online: {link_cardapio}",
    "Oi, {nome}! 💎 Você merece o melhor: ganhou {cupom}! Válido até {validade}, só pelo nosso cardápio: {link_cardapio}",
    "{nome}, obrigado por ser tão presente! 🙏 Você ganhou {cupom} de VIP, válido até {validade} em pedidos online: {link_cardapio}",
    "Oi, {nome}! ✨ Aproveite seu presente de VIP: você ganhou {cupom}! Use até {validade}, só pelo nosso link: {link_cardapio}",
  ],
  "siga-redes": [
    "Oi, {nome}! 😊 Tá curtindo o {restaurante}? Então segue a gente no Instagram pra não perder novidade e promoção: {instagram}",
    "{nome}, a gente posta prato novo e promoção primeiro no Instagram 📸 Bora seguir? {instagram}",
    "Oi, {nome}! Cola no nosso TikTok pra ver os bastidores do {restaurante} 🎬 {tiktok}",
    "{nome}, segue a gente e fica por dentro de tudo! 📱 Instagram: {instagram} · TikTok: {tiktok}",
    "Oi, {nome}! Curte nossa página no Facebook pra acompanhar as novidades do {restaurante}: {facebook}",
  ],
  "subiu-de-nivel": [
    "Parabéns, {nome}! 🏆 Você acaba de virar cliente {nivel} no {restaurante}! E conquista merece prêmio: você ganhou {cupom}! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    "{nome}, que orgulho! 🎉 Você subiu pra {nivel} no {restaurante}! De presente, você ganhou {cupom} — use até {validade} no nosso cardápio: {link_cardapio}",
    "Oi, {nome}! ✨ Novidade boa: agora você é cliente {nivel}! Pra comemorar, você ganhou {cupom}. Válido até {validade}: {link_cardapio}",
    "{nome}, você merece! 👏 Acabou de conquistar o nível {nivel} no {restaurante} e ganhou {cupom} de presente. Aproveite até {validade}: {link_cardapio}",
    "Parabéns, {nome}! 🥇 Nível {nivel} desbloqueado no {restaurante}! Seu prêmio: {cupom}, válido até {validade}. Peça pelo cardápio: {link_cardapio}",
  ],
  "quase-no-proximo-nivel": [
    "Oi, {nome}! 🏃 Você tá quase lá: faltam só {falta_proximo_nivel} pra você virar cliente {proximo_nivel} no {restaurante} — e desbloquear vantagens novas! Bora? {link_cardapio}",
    "{nome}, tá no detalhe! 🔥 Só mais {falta_proximo_nivel} e você vira {proximo_nivel} no {restaurante}. Seu próximo pedido pode ser o da virada: {link_cardapio}",
    "Oi, {nome}! Sabia que você tá a {falta_proximo_nivel} de virar cliente {proximo_nivel}? 👀 Nível novo, vantagem nova. Garante: {link_cardapio}",
    "{nome}, falta pouquinho! ✨ Mais {falta_proximo_nivel} em pedidos e o nível {proximo_nivel} é seu — com direito a mimos exclusivos: {link_cardapio}",
    "Oi, {nome}! 🚀 Seu próximo nível tá logo ali: {falta_proximo_nivel} e você é {proximo_nivel} no {restaurante}. Pede agora: {link_cardapio}",
  ],
  "mimo-mensal-nivel": [
    "Oi, {nome}! 💛 Chegou seu mimo do mês de cliente {nivel}: você ganhou {cupom}! 🎁 Válido até {validade}, só em pedidos pelo nosso cardápio: {link_cardapio}",
    "{nome}, presente do mês na área! 🎁 Por ser cliente {nivel}, você ganhou {cupom}. Use até {validade} no nosso cardápio: {link_cardapio}",
    "Oi, {nome}! Todo mês tem: seu mimo de cliente {nivel} chegou — você ganhou {cupom}! Válido até {validade}: {link_cardapio}",
    "{nome}, ser {nivel} tem suas vantagens 😎 Seu mimo mensal: {cupom}, válido até {validade}. Aproveita: {link_cardapio}",
    "Oi, {nome}! 💛 O {restaurante} preparou seu agrado do mês: você ganhou {cupom} por ser cliente {nivel}. Use até {validade}: {link_cardapio}",
  ],
  "cupom-vencendo": [
    "Oi, {nome}! ⏰ Corre que ainda dá tempo: seu {cupom} vence em {validade}! Use no pedido pelo nosso cardápio: {link_cardapio}",
    "{nome}, não deixa vencer! ⏳ Seu {cupom} vale só até {validade}. Garante o seu pedido: {link_cardapio}",
    "Oi, {nome}! Seu {cupom} no {restaurante} tá quase vencendo — válido até {validade}. Aproveita: {link_cardapio}",
    "{nome}, últimos dias! 🏃 O {cupom} que você ganhou vence em {validade}. Pede logo o seu: {link_cardapio}",
    "Oi, {nome}! 🎁 Lembra do seu {cupom}? Ele vence em {validade} — usa antes que expire, pelo nosso cardápio: {link_cardapio}",
  ],
  "carrinho-abandonado": [
    "Oi, {nome}! 🛒 Vi que você começou um pedido no {restaurante} e não finalizou. Posso te ajudar a concluir? É só voltar aqui: {link_cardapio}",
    "{nome}, seu pedido tá quase pronto! 🛒 Faltou só finalizar. Bora terminar? {link_cardapio}",
    "Oi, {nome}! Esqueceu algo no carrinho? 😊 Seu pedido no {restaurante} tá te esperando: {link_cardapio}",
    "{nome}, ficou com fome e parou no meio? 🍴 Retoma seu pedido rapidinho: {link_cardapio}",
    "Oi, {nome}! Seu carrinho ainda tá aqui 🛒 Finaliza e já já tá na sua casa: {link_cardapio}",
  ],
};

/** The message options for a campaign (always includes at least the default). */
export function getReadyMadeMessageVariants(id: string): string[] {
  const variants = READY_MADE_MESSAGE_VARIANTS[id];
  if (variants && variants.length) return variants;
  const rm = getReadyMadeCampaign(id);
  return rm ? [rm.defaultMessage] : [];
}

/**
 * Owner-facing "when does this fire" per campaign — the day/timing logic in plain
 * words, so the manager understands the cadence of each follow-up. Honest to the
 * real engine: segment-based timings come from Configurações → Segmentação; event
 * ones use the windows below.
 */
export interface ReadyMadeTiming {
  /** One-line "when" summary shown on the card. */
  summary: string;
  /** Whether the day threshold comes from the Segmentação settings (not the card). */
  fromSegmentation: boolean;
}

export const READY_MADE_TIMING: Record<string, ReadyMadeTiming> = {
  "pedido-avaliacao":    { summary: "Enviada a quem fez um pedido nos últimos 7 dias.",                 fromSegmentation: false },
  "aniversariantes":     { summary: "Enviada no dia do aniversário do cliente.",                        fromSegmentation: false },
  "segunda-compra":      { summary: "Enviada ~7 dias após o 1º pedido, para estimular o segundo.",       fromSegmentation: false },
  "cadastro-sem-compra": { summary: "Enviada a quem se cadastrou mas ainda não fez o 1º pedido.",       fromSegmentation: false },
  "quente-esfriando":    { summary: "Enviada a quem pediu há ~23–30 dias (perto de esfriar).",          fromSegmentation: true },
  "reativar-mornos":     { summary: "Enviada a quem está ~31–60 dias sem pedir.",                       fromSegmentation: true },
  "recuperar-frios":     { summary: "Enviada a quem está 60+ dias sem pedir.",                          fromSegmentation: true },
  "recuperar-perdidos":  { summary: "Enviada a quem está há muito tempo sem pedir (fase perdida).",     fromSegmentation: true },
  "clientes-vip":        { summary: "Enviada periodicamente aos clientes Ouro e Diamante.",             fromSegmentation: false },
  "subiu-de-nivel":      { summary: "Enviada dias após o cliente conquistar um nível novo.",            fromSegmentation: false },
  "quase-no-proximo-nivel": { summary: "Enviada a quem está a até 20% do próximo nível (máx. 1×/mês).", fromSegmentation: false },
  "mimo-mensal-nivel":   { summary: "Enviada 1× por mês aos clientes Prata, Ouro e Diamante.",          fromSegmentation: false },
  "cupom-vencendo":      { summary: "Enviada a quem tem cupom ativo vencendo nos próximos dias.",       fromSegmentation: false },
  "carrinho-abandonado": { summary: "Enviada poucos minutos após o cliente abandonar um pedido.",       fromSegmentation: false },
  "siga-redes":          { summary: "Enviada aos clientes, convidando a seguir suas redes sociais.",     fromSegmentation: false },
};

export function getReadyMadeTiming(id: string): ReadyMadeTiming {
  return READY_MADE_TIMING[id] ?? { summary: "", fromSegmentation: false };
}

/**
 * How the cadence works, in one place — shown in the config screen so the manager
 * knows how often a customer can be contacted regardless of the campaign.
 */
export const CADENCE_EXPLAINER =
  "O robô de campanhas roda a cada ~15 minutos e envia no máximo 5 mensagens por vez (limite de segurança). " +
  "Cada cliente recebe no máximo 1 mensagem de CRM a cada 24 horas, somando todas as campanhas. " +
  "Um cliente só entra uma vez em cada campanha — quando muda de fase (ex.: de quente para morno), " +
  "pode entrar na campanha daquela nova fase.";

export interface ReadyMadeOverrides {
  message?:     string;
  /** null clears the coupon; undefined keeps the default. */
  coupon?:      ReadyMadeCoupon | null;
  weekdays?:    number[];
  timeWindow?:  { start: string; end: string };
  dailyLimit?:  number;
  triggerDays?: number;
}

export interface ReadyMadeCampaignPayload {
  name:            string;
  templateId:      string;
  targetSegment:   string;
  messageTemplate: string;
  objective:       string;
  channel:         "WHATSAPP";
  scheduleConfig:  Record<string, unknown>;
}

/**
 * Builds the POST /api/crm/campaigns payload for a ready-made campaign, applying
 * any owner overrides on top of the safe defaults. Recurring campaigns omit
 * endCondition on purpose so they stay ACTIVE and re-evaluate each cycle.
 *
 * CART_RECOVERY campaigns also get a Campaign row (so they share the same manage
 * modal + Ativas row as everyone else), but with mode "CART_RECOVERY" — the
 * recurring runner skips that mode; the cart-recovery engine reads its message +
 * reward from this row instead.
 */
export function buildReadyMadeCampaignPayload(
  rm: ReadyMadeCampaign,
  overrides: ReadyMadeOverrides = {},
  timezone = "America/Sao_Paulo",
): ReadyMadeCampaignPayload {
  // Coupon: explicit override wins (including null = remove); else the default.
  const coupon = overrides.coupon !== undefined ? overrides.coupon : (rm.defaultCoupon ?? null);
  const triggerDays = overrides.triggerDays ?? rm.triggerDays;
  return {
    name:            rm.name,
    templateId:      rm.id,
    targetSegment:   rm.targetSegment,
    messageTemplate: (overrides.message ?? rm.defaultMessage).trim(),
    objective:       rm.objective,
    channel:         "WHATSAPP",
    scheduleConfig: {
      mode:       rm.engine === "CART_RECOVERY" ? "CART_RECOVERY" : "RECURRING",
      ...(coupon ? { coupon } : {}),
      weekdays:   overrides.weekdays   ?? rm.schedule.weekdays,
      timeWindow: overrides.timeWindow ?? rm.schedule.timeWindow,
      dailyLimit: overrides.dailyLimit ?? rm.schedule.dailyLimit,
      priority:   rm.priority,
      ...(typeof triggerDays === "number" ? { triggerDays } : {}),
      timezone,
    },
  };
}
