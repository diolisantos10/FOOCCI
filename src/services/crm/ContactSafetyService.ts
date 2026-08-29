/**
 * ContactSafetyService
 *
 * Unified contact-safety gate for ALL outbound CRM WhatsApp messages.
 *
 * Before any CRM message is sent (manual campaign, recurring runner, or
 * automation), it MUST pass `assertSendable`. This is the single, authoritative
 * place that enforces:
 *
 *   • opt-out (LGPD)               • daily global cap
 *   • teto pré-pago de contatos    • per-customer cooldown
 *   • contactability / phone
 *   • canal WhatsApp conectado     • per-customer weekly cap
 *   • quiet hours / weekend        • cross-campaign 24h dedup
 *   • sending window               • duplicate-in-campaign dedup
 *   • restaurant operational status (opt-in)
 *   • histórico do contato apurado — "não sei" reprova (UNKNOWN_CONTACT_HISTORY)
 *
 * Design:
 *   - `evaluateContactSafety()` is a PURE function (no DB) — fully unit-testable.
 *   - `assertSendable()` gathers the per-customer + global data, then delegates
 *     to the pure evaluator.
 *   - `buildGlobalContext()` computes the once-per-batch global signals.
 *   - `detectOptOutIntent()` recognises inbound STOP/SAIR/etc. phrases.
 *
 * SCOPE GUARD: this service governs only the CRM outbound relationship layer.
 * It does NOT touch the Waiter (/pedido), the WhatsApp Receptionist routing,
 * checkout, payment, or cart recovery. It performs NO sends itself.
 *
 * Phase: CRM W2. CRM Agent runtime remains OFF; this is enforcement plumbing.
 */

import { prisma } from "@/lib/prisma";
import {
  type CRMWhatsAppSafetyConfig,
  getSafetyConfig,
  getTodayGlobalSendCount,
  getContactedCustomerIds,
  checkQuietHours,
  checkWeekendBlock,
} from "@/lib/crm-safety";
import { isRestaurantOpenNow } from "@/lib/business-hours";
import {
  ACTIVE_ORDER_STATUSES,
  REAL_ORDER_STATUSES,
  evaluateActiveOrderGuard,
  type CustomerOrderState,
} from "./activeOrderGuard";
import { isWhatsAppChannelConnected } from "./crmWhatsAppChannel";

// ─── Decision types ───────────────────────────────────────────────────────────

export type ContactBlockReason =
  | "CUSTOMER_OPTED_OUT"
  | "CUSTOMER_NOT_CONTACTABLE"
  | "MISSING_PHONE"
  | "INVALID_PHONE_FORMAT"
  /** Canal WhatsApp oficial (Meta) ausente ou desconectado. */
  | "NO_WHATSAPP_CONFIG"
  | "QUIET_HOURS"
  | "WEEKEND_BLOCKED"
  | "OUTSIDE_SENDING_WINDOW"
  | "DAILY_GLOBAL_CAP_REACHED"
  /**
   * O teto pré-pago de contatos acabou E esta pessoa nunca foi abordada — ela
   * consumiria uma vaga que não existe. Quem já está na conta continua passando.
   */
  | "CONTACT_BUDGET_EXHAUSTED"
  | "CUSTOMER_COOLDOWN_ACTIVE"
  | "CUSTOMER_WEEKLY_CAP_REACHED"
  | "RECENT_CRM_MESSAGE_24H"
  | "DUPLICATE_CAMPAIGN_RECIPIENT"
  | "RESTAURANT_CLOSED"
  /**
   * Cliente com pedido EM VOO (confirmado / em preparo / pronto / saiu para
   * entrega). Ver `activeOrderGuard.ts` — incluindo o caso real que criou a
   * regra.
   */
  | "CUSTOMER_HAS_ACTIVE_ORDER"
  /** Cliente pediu dentro da janela de silêncio pós-pedido. */
  | "CUSTOMER_ORDERED_RECENTLY"
  /**
   * Não foi possível apurar se o cliente tem pedido em andamento. Como
   * `UNKNOWN_CONTACT_HISTORY`: não sei é NÃO.
   */
  | "UNKNOWN_ORDER_STATE"
  /**
   * Não foi possível saber quantas mensagens este contato já recebeu.
   * NÃO é erro: é o portão dizendo "não sei", que aqui significa REPROVADO.
   */
  | "UNKNOWN_CONTACT_HISTORY"
  | "UNKNOWN_ERROR";

export interface ContactSafetyDecision {
  /** true → safe to send; false → blocked. */
  sendable: boolean;
  /** Machine-readable block reason; null when sendable. */
  reason: ContactBlockReason | null;
  /** Human-readable detail (logged on the CampaignExecution.failedReason). */
  detail?: string;
}

const ALLOW: ContactSafetyDecision = { sendable: true, reason: null };

function block(reason: ContactBlockReason, detail?: string): ContactSafetyDecision {
  return { sendable: false, reason, detail: detail ?? reason };
}

// ─── Optional sending window ────────────────────────────────────────────────────

export interface SendingWindow {
  /** "HH:MM" 24-h local start (inclusive). */
  start: string;
  /** "HH:MM" 24-h local end (exclusive). */
  end: string;
  /** IANA timezone for window evaluation. Defaults to the safety config timezone. */
  timezone?: string;
}

// ─── Pure-evaluation input ──────────────────────────────────────────────────────

/**
 * Everything the pure evaluator needs. All counts are caller-supplied so the
 * evaluator never touches the DB (and tests stay deterministic).
 */
export interface ContactSafetyEvalInput {
  // ── per-customer state ──
  hasOptedOut: boolean;
  crmContactable: boolean;
  phone: string | null;

  // ── frequency signals (last 7-day window, already filtered to successful sends) ──
  /** Successful CRM sends to this customer within `customerCooldownHours`. */
  sendsWithinCooldown: number;
  /** Successful CRM sends to this customer within the trailing 7 days. */
  sendsWithinWeek: number;
  /** Successful CRM sends to this customer from OTHER campaigns within 24h. */
  otherCampaignSendsWithin24h: number;
  /** Successful CRM sends to this customer from THIS campaign already. */
  sameCampaignSends: number;
  /**
   * ⚠️ OS QUATRO CONTADORES ACIMA SÃO CONFIÁVEIS?
   *
   * `true`  → foram realmente apurados; zero quer dizer "não mandei nada".
   * `false` → NÃO foi possível apurar; zero é ignorância, não histórico limpo.
   *
   * Este campo é OBRIGATÓRIO de propósito. Ele não existia, e a ausência dele era
   * a armadilha exata descrita em `docs/sdr-foocci-desenho.md`: quem chamasse o
   * portão sem `customerId` recebia quatro zeros, e o avaliador lia "nunca mandei
   * nada" → **liberado**. Um lead do site não tem `customerId`; o primeiro código
   * do SDR cairia aqui e ganharia permissão silenciosa para mandar quantas
   * mensagens quisesse, sem descanso.
   *
   * Guardrail 1 aplicado ao portão: ausência de informação não é informação.
   * Guardrail 2: sem portão = reprovado — não sei é NÃO.
   */
  contactHistoryKnown: boolean;

  /**
   * O cliente está no meio de um pedido? Ver `activeOrderGuard.ts`.
   *
   * Obrigatório, sem default, pelo mesmo motivo de `contactHistoryKnown`: um
   * default otimista faria a trava nascer desligada e ninguém perceberia —
   * exatamente como o teto de contatos, que virou enfeite por um default.
   * Quem não tem cliente cadastrado (lead do site) passa
   * `{ known: true, hasActiveOrder: false, lastRealOrderAt: null }`: não tem
   * pedido porque não tem cadastro, e isso é um fato, não uma suposição.
   */
  orderState: CustomerOrderState;

  // ── global context ──
  safety: CRMWhatsAppSafetyConfig;
  /**
   * Canal WhatsApp oficial (Meta) disponível E conectado para este restaurante.
   * Não existe mais provedor alternativo: false = nada sai, e sai bloqueio escrito.
   */
  whatsappAvailable: boolean;
  globalSentToday: number;
  restaurantOpen: boolean;
  /**
   * Quantas PESSOAS DIFERENTES o CRM já abordou na vida toda (o que o teto
   * pré-pago `safety.contactBudgetTotal` consome).
   */
  contactBudgetUsed: number;
  /**
   * Esta pessoa NUNCA recebeu mensagem do CRM? Só quem é novo consome uma vaga
   * do teto — quem já está na conta não consome nada e continua recebendo.
   *
   * Obrigatório de propósito, como `contactHistoryKnown`: com um default
   * otimista (`false`) o teto voltaria a ser enfeite sem ninguém perceber.
   */
  isNewContact: boolean;

  // ── flags ──
  /** Birthday sends are exempt from frequency rules (cooldown/weekly/24h/dup). */
  isBirthday: boolean;
  /**
   * Priority override: skip ONLY the per-customer weekly cap (for important
   * campaigns like birthday). NEVER skips opt-out, phone, quiet hours, sending
   * window, global cap, same-campaign dedup or cooldown.
   */
  allowWeeklyCapOverride?: boolean;
  /** Enforce quiet-hours / weekend / sending-window time gates (autonomous paths). */
  enforceTimeWindows: boolean;
  /**
   * Enforce the FREQUENCY family: dedup da mesma campanha, dedup de 24 h entre
   * campanhas, cooldown por cliente e teto semanal por cliente.
   *
   * Existe porque nem todo envio é ABORDAGEM. Estas quatro regras governam a
   * casa decidir falar com alguém que não pediu nada agora. Uma RESPOSTA a um
   * ato do próprio cliente — recuperação de carrinho, por exemplo — não é isso,
   * e é medida pelas guardas do próprio fluxo. Ver o bilhete longo na regra 11
   * de `OrderDraftRecoverySendService`.
   *
   * Desligar isto NÃO desliga opt-out, telefone, canal, teto de contatos nem o
   * portão de histórico desconhecido. Só a família de frequência.
   */
  enforceFrequency: boolean;
  /** Enforce the daily global cap. Autonomous paths enforce; manual human sends may override. */
  enforceDailyCap: boolean;
  /** Enforce restaurant operational status (opt-in; default off to preserve behavior). */
  enforceRestaurantOpen: boolean;
  /** Optional explicit sending window (recurring runner timeWindow). */
  sendingWindow?: SendingWindow | null;

  now?: Date;
}

// ─── Phone plausibility ─────────────────────────────────────────────────────────

/** Bare digits-only Brazilian-plausible length check (10–13 digits incl. country code). */
export function isPlausiblePhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

// ─── Sending-window check ───────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Returns true when `now` falls OUTSIDE the window (i.e. a block is warranted). */
export function isOutsideSendingWindow(
  win: SendingWindow,
  timezoneFallback: string,
  now: Date = new Date(),
): boolean {
  const tz = win.timezone ?? timezoneFallback;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const nowMin = h * 60 + m;
  const startMin = timeToMinutes(win.start);
  const endMin = timeToMinutes(win.end);
  // Overnight window (start > end): inside if >= start OR < end
  const inside = startMin > endMin
    ? nowMin >= startMin || nowMin < endMin
    : nowMin >= startMin && nowMin < endMin;
  return !inside;
}

// ─── Pure evaluator ─────────────────────────────────────────────────────────────

/**
 * Decide whether a single CRM message is sendable. Pure — no I/O.
 * Check order is intentional: identity/contactability first, then global gates,
 * then frequency. Returns the FIRST applicable block reason.
 */
export function evaluateContactSafety(input: ContactSafetyEvalInput): ContactSafetyDecision {
  const now = input.now ?? new Date();

  // 1. Opt-out — inviolável.
  if (input.hasOptedOut) return block("CUSTOMER_OPTED_OUT", "Cliente opt-out");

  // 2. Contactability flag.
  if (!input.crmContactable) return block("CUSTOMER_NOT_CONTACTABLE", "Cliente não contactável");

  // 3. Phone present?
  if (!input.phone || input.phone.trim() === "") {
    return block("MISSING_PHONE", "Telefone ausente");
  }

  // 4. Phone plausible?
  if (!isPlausiblePhone(input.phone)) {
    return block("INVALID_PHONE_FORMAT", "Formato de telefone inválido");
  }

  // 5. Canal WhatsApp oficial conectado?
  if (!input.whatsappAvailable) {
    return block("NO_WHATSAPP_CONFIG", "WhatsApp (Meta) não conectado");
  }

  // 6. Restaurant operational status (opt-in).
  if (input.enforceRestaurantOpen && !input.restaurantOpen) {
    return block("RESTAURANT_CLOSED", "Restaurante fechado");
  }

  // 6.5. O cliente está no meio de um pedido?
  //
  // Fica ANTES das janelas de tempo, do cap global e de toda a família de
  // frequência, e fora de qualquer `if` de isenção, porque não é regra de ritmo
  // nem de custo: é a casa não atropelar o próprio cliente. `isBirthday`,
  // `allowWeeklyCapOverride`, `enforceFrequency` e `enforceDailyCap` NÃO a
  // desligam — não existe campanha importante o bastante para falar por cima
  // de um pedido em preparo.
  //
  // Fica DEPOIS de opt-out e telefone só por ordem de leitura: quem pediu para
  // sair da lista continua saindo com o motivo certo escrito na tela do
  // lojista, em vez de aparecer como "tem pedido em andamento".
  const orderVerdict = evaluateActiveOrderGuard(input.orderState, now, {
    // A janela de silêncio é regra de ABORDAGEM e segue a mesma fronteira do
    // `enforceFrequency`. O bloqueio por pedido em voo, logo abaixo dela no
    // módulo, não tem interruptor nenhum.
    enforceRecentSilence: input.enforceFrequency,
  });
  if (!orderVerdict.free) {
    return block(orderVerdict.reason!, orderVerdict.detail);
  }

  // 7–9. Time-window gates (autonomous paths only).
  if (input.enforceTimeWindows) {
    const quiet = checkQuietHours(input.safety, now);
    if (quiet) return block("QUIET_HOURS", quiet);

    const weekend = checkWeekendBlock(input.safety, now);
    if (weekend) return block("WEEKEND_BLOCKED", weekend);

    if (input.sendingWindow && isOutsideSendingWindow(input.sendingWindow, input.safety.timezone, now)) {
      return block(
        "OUTSIDE_SENDING_WINDOW",
        `Fora da janela de envio (${input.sendingWindow.start}–${input.sendingWindow.end})`,
      );
    }
  }

  // 10. Daily global cap.
  if (input.enforceDailyCap && input.safety.dailyGlobalCap > 0 && input.globalSentToday >= input.safety.dailyGlobalCap) {
    return block(
      "DAILY_GLOBAL_CAP_REACHED",
      `Cap global diário atingido (${input.globalSentToday}/${input.safety.dailyGlobalCap})`,
    );
  }

  // 10.5. O histórico deste contato é conhecido?
  //
  // Vem ANTES das travas de frequência porque é delas que estamos falando: sem
  // histórico apurado, cooldown, teto semanal, dedup de 24h e dedup de campanha
  // avaliariam quatro zeros e liberariam. E vem FORA do `if (!isBirthday)` de
  // propósito: aniversário isenta de frequência, não de identidade — não existe
  // aniversário sem cliente para fazer aniversário.
  if (!input.contactHistoryKnown) {
    return block(
      "UNKNOWN_CONTACT_HISTORY",
      "Não foi possível apurar quantas mensagens este contato já recebeu — envio reprovado por precaução",
    );
  }

  // 10.6. Teto pré-pago de contatos — trava de CUSTO, não de anti-ban.
  //
  // O teto conta PESSOAS DIFERENTES abordadas na vida toda. Por isso ele só
  // barra QUEM É NOVO: quem já está na conta não consome vaga nenhuma e segue
  // recebendo normalmente. Uma tranca geral aqui calaria também o cliente
  // antigo — proteção mais destrutiva que o problema que ela evita, e foi
  // exatamente por isso que a versão anterior desta trava foi DESLIGADA, em vez
  // de corrigida. A tela e o guia do lojista continuaram prometendo que ela
  // existia ("o CRM para de abordar gente nova até você aumentar o Máximo de
  // pessoas") enquanto o código não olhava o número: teto de 200 e 2115 pessoas
  // já abordadas na mesma tela. Confiança falsa é pior que limite nenhum.
  //
  // Vale inclusive para aniversário: aniversário é isento de FREQUÊNCIA, não de
  // custo. Na prática quase nunca morde — aniversariante que já foi abordado
  // uma vez não é contato novo.
  if (
    input.safety.contactBudgetTotal > 0 &&
    input.isNewContact &&
    input.contactBudgetUsed >= input.safety.contactBudgetTotal
  ) {
    return block(
      "CONTACT_BUDGET_EXHAUSTED",
      `Limite de contatos atingido (${input.contactBudgetUsed}/${input.safety.contactBudgetTotal}) — ` +
      "esta pessoa ainda não tinha sido abordada e não há vaga no teto",
    );
  }

  // 11. Frequency gates — birthday sends are exempt, and so are paths that are a
  // RESPOSTA a um ato do cliente em vez de uma abordagem (`enforceFrequency`).
  if (!input.isBirthday && input.enforceFrequency) {
    // Duplicate within the same campaign.
    if (input.sameCampaignSends > 0) {
      return block("DUPLICATE_CAMPAIGN_RECIPIENT", "Cliente já recebeu esta campanha");
    }
    // Cross-campaign 24h dedup.
    if (input.otherCampaignSendsWithin24h > 0) {
      return block("RECENT_CRM_MESSAGE_24H", "Cliente já recebeu mensagem CRM nas últimas 24h");
    }
    // Per-customer cooldown.
    if (input.sendsWithinCooldown > 0) {
      return block(
        "CUSTOMER_COOLDOWN_ACTIVE",
        `Cooldown ativo (${input.safety.customerCooldownHours}h)`,
      );
    }
    // Per-customer weekly cap — skippable ONLY via an explicit priority override
    // (e.g. birthday). All gates above (opt-out/phone/window/global/dedup/cooldown)
    // still apply.
    if (
      !input.allowWeeklyCapOverride &&
      input.safety.maxPerWeekPerCustomer > 0 &&
      input.sendsWithinWeek >= input.safety.maxPerWeekPerCustomer
    ) {
      return block(
        "CUSTOMER_WEEKLY_CAP_REACHED",
        `Limite semanal atingido (${input.sendsWithinWeek}/${input.safety.maxPerWeekPerCustomer})`,
      );
    }
  }

  return ALLOW;
}

// ─── Inbound opt-out detection ──────────────────────────────────────────────────

/** Strip accents + lowercase + collapse whitespace for robust matching. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comandos inequívocos: valem como opt-out quando a mensagem é essencialmente a
 * palavra (≤ 3 tokens). São os que o próprio sistema pede ou que não têm outra
 * leitura possível num chat com restaurante.
 */
const OPT_OUT_KEYWORDS = new Set([
  "stop", "sair", "parar", "descadastrar",
]);

/**
 * Palavras que pedem silêncio numa lista E pedem outra coisa completamente
 * diferente no balcão de um restaurante. Só valem como opt-out quando vêm
 * **sozinhas na mensagem** — ver `detectOptOutIntent`.
 *
 * São duas, e são a mesma família de defeito:
 *
 * - **"cancelar"** — "quero cancelar", "pode cancelar", "cancelar meu pedido"
 *   falam do PEDIDO, não da lista de mensagens.
 * - **"remover"** — "remover a cebola", "remover o item", "pode remover a
 *   cebola" falam do PRATO. Esta entrou depois, quando ficou claro que consertar
 *   só o `cancelar` era consertar metade de uma família: imitação anda em bando.
 *
 * O rodapé que a Foocci manda em toda campanha
 * (`MetaTemplateProvisionService.ts` — *"Para não receber mais ofertas, responda
 * SAIR"*) **não pede nenhuma das duas**: quem quer sair da lista é instruído a
 * mandar SAIR. O uso legítimo delas continua coberto pelas frases explícitas de
 * `OPT_OUT_PHRASES` — "cancelar inscricao", "remover meu numero", "remover da
 * lista" —, que rodam ANTES desta regra e não dependem de contagem de palavra.
 *
 * O custo aceito, dito por extenso: `remover numero` (2 tokens, sem "meu")
 * deixa de valer sozinho. É o lado barato do erro — a pessoa repete, e o rodapé
 * dizendo "responda SAIR" vai junto em toda campanha.
 */
const AMBIGUOUS_OPT_OUT_KEYWORDS = new Set([
  "cancelar", "remover",
]);

/**
 * Objetos do dia a dia do restaurante. Se a mensagem cita um deles, o verbo
 * solto ("cancelar", "remover", "parar") tem dono — é o pedido, não a lista.
 *
 * Esta lista é um **piso, não um teto**: ela não precisa estar completa para o
 * conserto funcionar (a regra da palavra sozinha já barra a maioria dos casos),
 * e cada palavra nova aqui só empurra a decisão para o lado seguro.
 */
const ORDER_CONTEXT_WORDS = new Set([
  "pedido", "pedidos", "compra", "compras", "entrega", "entregas", "delivery",
  "item", "itens", "produto", "produtos", "conta", "mesa", "reserva", "reservas",
  "agendamento", "cardapio", "comanda", "cupom", "adicional", "adicionais",
]);

/** Multi-word phrases that count as opt-out anywhere in the message. */
const OPT_OUT_PHRASES = [
  "nao quero receber",
  "nao quero mais receber",
  "sair da lista",
  "remover meu numero",
  "remover da lista",
  "remova meu numero",
  "cancelar inscricao",
  "descadastrar meu numero",
  "nao enviar mais",
  "parar de enviar",
];

/**
 * Returns true when an inbound message expresses an opt-out / unsubscribe intent.
 *
 * ── Para que lado esta função erra, e por quê ────────────────────────────────
 * **Na dúvida, NÃO é opt-out.** A assimetria é do dano, não do gosto:
 *
 * - Deixar de marcar quem queria sair custa **uma mensagem a mais**, e a pessoa
 *   repete o pedido — o rodapé com "responda SAIR" vai junto em toda campanha.
 * - Marcar quem NÃO pediu para sair tira o cliente da base do restaurante
 *   (`hasOptedOut`, `crmContactable=false`) **sem ele saber**, e ainda o deixa
 *   sem resposta naquele turno (`InboundGuardsService` nega a IA quando houve
 *   opt-out). Ninguém reclama do que não recebeu: o erro é silencioso e só
 *   aparece como base que encolhe sozinha.
 *
 * Por isso todo empate abaixo cai para `false`.
 *
 * ── As três regras, na ordem ─────────────────────────────────────────────────
 * 1. **Frase explícita** (`OPT_OUT_PHRASES`) em qualquer lugar do texto → sim.
 *    Quem escreve "não quero receber" ou "sair da lista" nomeou o objeto; não há
 *    ambiguidade a resolver.
 * 2. **Contexto de pedido desliga a palavra solta.** Se a mensagem cita um
 *    objeto do balcão (`ORDER_CONTEXT_WORDS`: pedido, entrega, item…), o verbo
 *    tem dono e não é a lista de mensagens.
 * 3. **Palavra solta**, e aqui as duas classes se separam:
 *    - ambígua (`cancelar`, `remover`) → só quando é a mensagem INTEIRA, um
 *      único token;
 *    - inequívoca (`stop`/`sair`/`parar`/`descadastrar`) → mensagem
 *      essencialmente igual à palavra (≤ 3 tokens), como sempre foi.
 *
 * O sinal escolhido para separar "quero sair da lista" de "quero cancelar meu
 * pedido" é **a presença de qualquer outra palavra**. Foi ele, e não uma lista
 * de objetos, porque a lista nunca fica completa — sempre haverá um "pode
 * cancelar", um "remover a cebola" fora dela — enquanto o comando de opt-out de
 * verdade é, por construção, uma palavra e nada mais: é o que o rodapé da
 * campanha manda fazer. Cliente mexendo no pedido escreve frase; cliente saindo
 * da lista responde comando. A lista de objetos ficou como segunda trava, para
 * os casos em que o verbo aparece grudado no objeto ("parar pedido", 2 tokens,
 * que a regra ≤3 dos comandos inequívocos deixaria passar).
 */
export function detectOptOutIntent(text: string | null | undefined): boolean {
  if (!text) return false;
  const norm = normalize(text);
  if (!norm) return false;

  // 1 · Phrase match (substring) — robust to surrounding words.
  for (const phrase of OPT_OUT_PHRASES) {
    if (norm.includes(phrase)) return true;
  }

  const tokens = norm.split(" ");

  // 2 · Contexto de pedido: o verbo já tem objeto, e não é a lista de mensagens.
  if (tokens.some((tok) => ORDER_CONTEXT_WORDS.has(tok))) return false;

  // 3a · Palavra ambígua: só quando é a mensagem inteira ("CANCELAR"/"REMOVER"
  //      e nada mais). Qualquer outra palavra na frente já a torna conversa.
  if (tokens.length === 1 && AMBIGUOUS_OPT_OUT_KEYWORDS.has(norm)) return true;

  // 3b · Comandos inequívocos: quando a mensagem é essencialmente a palavra.
  if (tokens.length <= 3) {
    for (const tok of tokens) {
      if (OPT_OUT_KEYWORDS.has(tok)) return true;
    }
  }

  return false;
}

// ─── Global context (one set of queries per batch) ──────────────────────────────

export interface ContactSafetyGlobalContext {
  safety: CRMWhatsAppSafetyConfig;
  /** Canal WhatsApp oficial (Meta) conectado. */
  whatsappAvailable: boolean;
  globalSentToday: number;
  restaurantOpen: boolean;
  /**
   * Quem o CRM já abordou na vida toda. Uma consulta por LOTE (não por
   * destinatário) — é dela que saem as duas respostas que o teto pré-pago
   * precisa: o total já gasto e se ESTE destinatário é gente nova.
   *
   * Vem vazio quando o teto está desligado (`contactBudgetTotal = 0`): sem teto
   * não há o que perguntar, e a consulta não roda.
   */
  contactedCustomerIds: Set<string>;
}

// ─── Service ────────────────────────────────────────────────────────────────────

export interface AssertSendableInput {
  restaurantId: string;
  customerId: string | null;
  phone: string | null;
  /** Pre-fetched opt-out flag (avoids a query when the caller already has it). */
  hasOptedOut?: boolean;
  /** Pre-fetched contactability flag. */
  crmContactable?: boolean;
  /** Campaign this send belongs to (excluded from cross-campaign dedup). */
  campaignId?: string | null;
  /** Birthday exemption from frequency rules. */
  isBirthday?: boolean;
  /** Priority override: skip ONLY the per-customer weekly cap. */
  allowWeeklyCapOverride?: boolean;
  /** Enforce quiet-hours / weekend / window (autonomous paths). Default true. */
  enforceTimeWindows?: boolean;
  /** Enforce the frequency family (dedup 24 h, cooldown, teto semanal). Default true. */
  enforceFrequency?: boolean;
  /** Enforce daily global cap. Default true; manual human sends may pass false. */
  enforceDailyCap?: boolean;
  /** Enforce restaurant-open. Default false (preserves existing behavior). */
  enforceRestaurantOpen?: boolean;
  /** Optional explicit sending window. */
  sendingWindow?: SendingWindow | null;
  /** Pre-computed global context (recommended for batches). */
  context?: ContactSafetyGlobalContext;
  now?: Date;
}

export class ContactSafetyService {
  /**
   * Compute the once-per-batch global signals.
   *
   * `whatsappAvailable` deixou de ter default otimista. Quem sabe o estado do canal
   * passa o booleano (o runner e o envio manual já consultaram a conexão); quem não
   * passa faz a pergunta agora, ao `WhatsAppMessagingService`. Se a pergunta falhar,
   * a resposta é **false** — ausência de informação não vira permissão de envio.
   *
   * `evolutionAvailable` sobrevive apenas como apelido de entrada, para chamadores
   * ainda não migrados; ele NÃO reintroduz a Evolution — o valor só alimenta o
   * mesmo gate de canal único.
   */
  static async buildGlobalContext(
    restaurantId: string,
    opts: {
      whatsappAvailable?: boolean;
      /** @deprecated apelido de `whatsappAvailable`; a Evolution saiu do sistema. */
      evolutionAvailable?: boolean;
      checkRestaurantOpen?: boolean;
      now?: Date;
    } = {},
  ): Promise<ContactSafetyGlobalContext> {
    const supplied = opts.whatsappAvailable ?? opts.evolutionAvailable;
    const [safety, globalSentToday, restaurantOpen, whatsappAvailable] = await Promise.all([
      getSafetyConfig(restaurantId),
      getTodayGlobalSendCount(restaurantId),
      opts.checkRestaurantOpen
        ? isRestaurantOpenNow(restaurantId, opts.now)
        : Promise.resolve(true),
      supplied !== undefined
        ? Promise.resolve(supplied)
        : isWhatsAppChannelConnected(restaurantId),
    ]);
    // Só pergunta quem já foi abordado quando existe teto para gastar. Se a
    // consulta falhar, o erro SOBE: `assertSendable` transforma isso em bloqueio
    // (UNKNOWN_ERROR). Não saber quanto do teto já foi gasto não pode virar
    // permissão de gastar mais.
    const contactedCustomerIds = safety.contactBudgetTotal > 0
      ? await getContactedCustomerIds(restaurantId)
      : new Set<string>();
    return { safety, globalSentToday, restaurantOpen, whatsappAvailable, contactedCustomerIds };
  }

  /**
   * The authoritative per-customer send gate. Gathers frequency signals for the
   * customer, then delegates to the pure evaluator.
   *
   * Never sends. Never mutates. Safe to call in dry runs and tests (with a
   * mocked prisma) — though the pure `evaluateContactSafety` is preferred for
   * deterministic unit tests.
   */
  static async assertSendable(input: AssertSendableInput): Promise<ContactSafetyDecision> {
    try {
      const now = input.now ?? new Date();
      const ctx = input.context ?? (await ContactSafetyService.buildGlobalContext(input.restaurantId, { now }));

      // Resolve per-customer flags if not supplied.
      let hasOptedOut = input.hasOptedOut;
      let crmContactable = input.crmContactable;
      if ((hasOptedOut === undefined || crmContactable === undefined) && input.customerId) {
        const cust = await prisma.customer.findUnique({
          where: { id: input.customerId },
          select: { hasOptedOut: true, crmContactable: true },
        });
        hasOptedOut = hasOptedOut ?? cust?.hasOptedOut ?? false;
        crmContactable = crmContactable ?? cust?.crmContactable ?? true;
      }

      // Frequency signals: one query for the trailing 7-day window, computed in-memory.
      let sendsWithinCooldown = 0;
      let sendsWithinWeek = 0;
      let otherCampaignSendsWithin24h = 0;
      let sameCampaignSends = 0;
      /**
       * Só vira `true` DEPOIS de a consulta ter rodado. Enquanto for `false`, os
       * quatro zeros acima são ignorância — e o avaliador reprova em vez de
       * confundir "não sei" com "nunca mandei". Ver `contactHistoryKnown`.
       */
      let contactHistoryKnown = false;

      /**
       * Pedidos do cliente. Nasce `known: false` — enquanto ninguém apurar, o
       * portão reprova em vez de supor que a pessoa está livre.
       */
      let orderState: CustomerOrderState = {
        known: false,
        hasActiveOrder: false,
        lastRealOrderAt: null,
      };

      if (input.customerId) {
        // Duas buscas indexadas por destinatário. A primeira responde "tem
        // pedido em voo AGORA?"; a segunda, "quando foi o último pedido de
        // verdade?". Separadas de propósito: um pedido travado em PREPARING há
        // dias continua sendo voo mesmo que outro, mais novo, já tenha sido
        // entregue — uma consulta só, pela data, perderia esse caso.
        const [activeCount, latestReal] = await Promise.all([
          prisma.order.count({
            where: {
              restaurantId: input.restaurantId,
              customerId: input.customerId,
              status: { in: [...ACTIVE_ORDER_STATUSES] as never[] },
            },
          }),
          prisma.order.findFirst({
            where: {
              restaurantId: input.restaurantId,
              customerId: input.customerId,
              status: { in: [...REAL_ORDER_STATUSES] as never[] },
            },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          }),
        ]);
        orderState = {
          known: true,
          hasActiveOrder: activeCount > 0,
          lastRealOrderAt: latestReal?.createdAt ?? null,
        };
      } else {
        // Sem cliente cadastrado não há pedido — e isso é fato apurado, não
        // suposição: um lead do site não tem histórico de pedido para ter.
        orderState = { known: true, hasActiveOrder: false, lastRealOrderAt: null };
      }

      if (input.customerId) {
        const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
        const cooldownCutoff = new Date(
          now.getTime() - ctx.safety.customerCooldownHours * 60 * 60 * 1000,
        );
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const recent = await prisma.campaignExecution.findMany({
          where: {
            restaurantId: input.restaurantId,
            customerId: input.customerId,
            status: { in: ["SENT", "DELIVERED", "READ"] },
            sentAt: { gte: weekAgo },
          },
          select: { campaignId: true, sentAt: true },
        });

        for (const r of recent) {
          sendsWithinWeek++;
          const sentAt = r.sentAt ?? new Date(0);
          if (sentAt >= cooldownCutoff) sendsWithinCooldown++;
          if (input.campaignId && r.campaignId === input.campaignId) {
            sameCampaignSends++;
          } else if (sentAt >= dayAgo) {
            otherCampaignSendsWithin24h++;
          }
        }
        contactHistoryKnown = true;
      }

      return evaluateContactSafety({
        hasOptedOut: hasOptedOut ?? false,
        crmContactable: crmContactable ?? true,
        phone: input.phone,
        sendsWithinCooldown,
        sendsWithinWeek,
        otherCampaignSendsWithin24h,
        sameCampaignSends,
        contactHistoryKnown,
        orderState,
        safety: ctx.safety,
        whatsappAvailable: ctx.whatsappAvailable,
        globalSentToday: ctx.globalSentToday,
        restaurantOpen: ctx.restaurantOpen,
        contactBudgetUsed: ctx.contactedCustomerIds.size,
        // Sem `customerId` não dá para saber se é gente nova — assume que é, o
        // lado caro da dúvida. Na prática o portão de `contactHistoryKnown` já
        // reprovou esse caso antes de chegar aqui.
        isNewContact: input.customerId ? !ctx.contactedCustomerIds.has(input.customerId) : true,
        isBirthday: input.isBirthday ?? false,
        allowWeeklyCapOverride: input.allowWeeklyCapOverride ?? false,
        enforceTimeWindows: input.enforceTimeWindows ?? true,
        enforceFrequency: input.enforceFrequency ?? true,
        enforceDailyCap: input.enforceDailyCap ?? true,
        enforceRestaurantOpen: input.enforceRestaurantOpen ?? false,
        sendingWindow: input.sendingWindow ?? null,
        now,
      });
    } catch (err) {
      console.error("[ContactSafetyService] assertSendable error:", err);
      return block("UNKNOWN_ERROR", err instanceof Error ? err.message : "Erro desconhecido");
    }
  }

  /**
   * Apply an inbound opt-out: idempotently mark the customer as opted-out.
   * Returns true when an opt-out was detected (and applied).
   *
   * Does NOT send any reply — opt-out is recorded silently (LGPD-safe).
   */
  static async applyInboundOptOut(
    restaurantId: string,
    customerId: string,
    messageText: string | null | undefined,
  ): Promise<boolean> {
    if (!detectOptOutIntent(messageText)) return false;
    try {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          hasOptedOut: true,
          optOutAt: new Date(),
          crmContactable: false,
          contactStatus: "OPT_OUT",
        },
      });
      console.log("[ContactSafetyService] opt-out applied", { restaurantId, customerId });
      return true;
    } catch (err) {
      console.error("[ContactSafetyService] applyInboundOptOut error:", err);
      return false;
    }
  }
}
