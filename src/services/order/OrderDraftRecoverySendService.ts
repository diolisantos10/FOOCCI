/**
 * OrderDraftRecoverySendService
 *
 * Phase 3 of abandoned cart recovery: sends a single WhatsApp recovery
 * message to identified customers who have an OPEN draft that has been
 * inactive long enough to signal real abandonment intent.
 *
 * Designed for fast food-delivery cadence — default threshold is 2 minutes.
 * The goal is to catch customers who added items and then drifted away.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A DECISÃO DO CEO — 05/08/2026, textual:
 *
 *   "A mensagem de carrinho tem que ser enviada quando o cliente fecha o Foocci
 *    e 2 min depois mandar. Se o cliente abre de madrugada não precisa enviar
 *    nada, porque ele queria comer de madrugada e não quando o restaurante
 *    abrir."
 *
 * Duas consequências, e as duas moram no código abaixo:
 *
 * 1. "FECHOU O FOOCCI" NÃO É DETECTÁVEL. Não existe sinal confiável de
 *    fechamento de aba no navegador (`beforeunload`/`visibilitychange` não
 *    chegam, ou chegam duplicados, em celular). O que existe é INATIVIDADE.
 *    Por isso a regra implementada é: rascunho não finalizado + 2 minutos sem
 *    atividade = abandonado. Quem for "melhorar" isto inventando um detector de
 *    fechamento de aba vai trocar um sinal que funciona por um que não chega.
 *
 * 2. LOJA FECHADA NO MOMENTO DO ABANDONO = NÃO MANDA, E NÃO GUARDA PARA DEPOIS.
 *    Quem monta pedido de madrugada queria comer NAQUELA HORA. Mandar de manhã
 *    é lembrete de uma vontade que já passou — irrita e não vende. O carrinho
 *    morre em silêncio, de propósito: não é adiamento, não é fila, não é
 *    pendência. Antes de 05/08 o motor ADIAVA (pulava sem carimbar, na
 *    esperança de o próximo tick achar a loja aberta) e o prazo de validade de
 *    6 h vencia antes de a loja abrir — promessa de segunda chance que nunca
 *    acontecia. Ver `docs/agents/crm/oficina.md`, 2026-08-05, item (c).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Eligibility rules — ALL must be true:
 *   1.  status = OPEN
 *   2.  updatedAt < NOW − inactivityMinutes
 *   2b. updatedAt > NOW − maxAgeHours  ← o carrinho tem PRAZO DE VALIDADE
 *   3.  draft has at least one item
 *   4.  customer has a real (non-guest) phone
 *   5.  recoveryAttempts = 0 on this draft (one recovery per draft, ever)
 *   6.  no other draft for this customer+restaurant already has lastRecoveryAt
 *       within the last 24 hours (one recovery per customer per day)
 *   7.  no non-cancelled Order after draft.updatedAt
 *   8.  no AWAITING_PAYMENT order for the same restaurant
 *   9.  a loja estava ABERTA no instante do abandono (updatedAt + inatividade)
 *       — avaliado naquele instante, nunca em "agora"
 *   10. o abandono aconteceu há menos de `deliveryWindowMinutes` — passou disso,
 *       a mensagem chegaria tarde demais e não sai nunca mais
 *   11. o portão unificado do CRM (`ContactSafetyService`) libera este
 *       destinatário — opt-out, janela de silêncio, intervalo de 24 h e teto
 *       semanal por cliente. Ver "AS TRAVAS DO CRM" no laço abaixo.
 *
 * Idempotent: recoveryAttempts + lastRecoveryAt are written atomically after
 * a successful send; re-running within the same window sends nothing extra.
 *
 * Message template (Portuguese):
 *   "Oi, {firstName}! Percebi que seu pedido não foi finalizado 😊
 *
 *    Você precisa de alguma ajuda para concluir?
 *
 *    👉 Retomar pedido: {shortRecoveryUrl}"
 *
 * {shortRecoveryUrl} is a short HMAC-signed /r/{token} redirect that signs a
 * fresh waToken server-side and bounces to /pedido/[slug]?waToken=...&src=recovery.
 *
 * Recommended cron schedule: every 1 minute.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { WhatsAppMessagingService } from "@/services/whatsapp/WhatsAppMessagingService";
import { isGuestIdentifier } from "@/lib/guest";
import { getPublicSiteUrl } from "@/lib/public-url";
import { isRestaurantOpenNow } from "@/lib/business-hours";
import { parseReadyMadeConfig } from "@/services/crm/ReadyMadeCampaignService";
import { parseMessagePool, resolveActivePhrases, pickPhrase, readPhraseMetaTemplates } from "@/services/crm/crmMessagePool";
import { isAgentActive } from "@/services/crm/CrmAgentActivation";
import { sendMetaCrmMessage } from "@/services/crm/metaCrmSend";
import { MetaWhatsAppCloudProvider } from "@/services/whatsapp/providers/MetaWhatsAppCloudProvider";
import { renderCrmMessage } from "@/services/crm/renderCrmMessage";
import { CustomerCouponService } from "@/services/crm/CustomerCouponService";
import { parseSafetyConfig } from "@/lib/crm-safety";
import {
  ContactSafetyService,
  type ContactSafetyGlobalContext,
} from "@/services/crm/ContactSafetyService";
import { ConversationStatus } from "@prisma/client";

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-4)}`;
}

export interface RecoverySendResult {
  checked:                    number;
  eligible:                   number;
  sent:                       number;
  skippedNoPhone:             number;
  skippedAlreadySent:         number;
  skippedDailyLimit:          number;
  skippedOrderedAfter:        number;
  skippedPendingPayment:      number;
  /** Combined: order found via Rule 7 + AWAITING_PAYMENT via Rule 8. */
  skippedOrderOrPaymentExists: number;
  skippedNoConfig:            number; // restaurant has no working Meta WhatsApp config → nothing was attempted
  /**
   * A loja estava FECHADA no instante do abandono → a mensagem NÃO sai, e não
   * fica guardada para quando a loja abrir (decisão do CEO, 05/08/2026).
   *
   * Mudou de significado nesta data: antes era "adiado até reabrir". Agora é
   * DEFINITIVO — o mesmo rascunho vai continuar sendo avaliado nos próximos
   * ticks e vai continuar dando o mesmo resultado, porque a pergunta é sobre um
   * instante do passado, não sobre agora. Quem lê este número em painel deve
   * ler "não vamos cobrar este carrinho", nunca "vamos cobrar mais tarde".
   */
  skippedRestaurantClosed:    number;
  failed:                     number; // Meta was called and returned an error
  /**
   * A Meta RECUSOU o texto livre porque o cliente está fora da janela de 24h e
   * não havia modelo aprovado para esta mensagem.
   *
   * Isto NÃO é "nada a enviar" e NÃO é falha de rede: é a política da Meta
   * dizendo que só um template aprovado passa. Sem este número, a recuperação
   * de carrinho pareceria estar rodando (checked>0, failed=0) enquanto nenhuma
   * mensagem chegava a ninguém — exatamente o tipo de silêncio que esta casa
   * não aceita. O rascunho NÃO é carimbado, então ele volta a ser candidato no
   * próximo tick — e vence sozinho pelo prazo de validade de 6h.
   */
  skippedTemplateRequired:    number;
  dryRun:                     boolean;
  inactivityMinutes:          number;
  /** Idade máxima de um carrinho recuperável — depois disso ele vence. */
  maxAgeHours:                number;
  /** Carrinhos que venceram e por isso NÃO foram cobrados. */
  skippedTooOld:              number;
  /** Quanto tempo depois do abandono a mensagem ainda faz sentido. */
  deliveryWindowMinutes:      number;
  /**
   * Abandonos velhos demais para a mensagem ainda ser útil — fora da janela de
   * entrega, ainda dentro da validade. Sem este número, o carrinho que o motor
   * decidiu não cobrar sumiria da conta e a diferença entre "não havia" e
   * "chegou tarde" ficaria invisível.
   */
  skippedTooLate:             number;
  /** Reprovados pelo portão unificado do CRM (opt-out, silêncio, intervalo de 24 h, teto semanal). */
  skippedSafety:              number;
  durationMs:                 number;
}

/**
 * O prazo de validade do carrinho abandonado.
 *
 * A busca tinha piso (2 minutos de inatividade) e NENHUM teto. Um rascunho
 * aberto três semanas atrás, com recoveryAttempts=0, continuava candidato para
 * sempre — e uma hora o Foocci mandava "percebi que seu pedido não foi
 * finalizado 😊" sobre um carrinho do mês passado. Não é recuperação, é
 * constrangimento: a pessoa já jantou, provavelmente já pediu de novo, e
 * recebe uma mensagem sobre um pedido que não lembra.
 *
 * Seis horas é o limite honesto para comida: dentro da mesma refeição, o
 * lembrete ajuda; fora dela, ele só assusta. O rascunho não é apagado nem
 * cancelado — o cliente que voltar pelo link continua achando o carrinho dele.
 * O que vence é o direito de COBRAR por ele.
 */
const MAX_AGE_HOURS = 6;

/**
 * A JANELA DE ENTREGA: quanto tempo depois do abandono a mensagem ainda serve.
 *
 * Decorre direto da decisão do CEO de 05/08/2026 ("manda 2 min depois" +
 * "não guarda para depois"). Se a mensagem não conseguiu sair logo — servidor
 * reiniciando, cron do GitHub atrasado (ele entrega ~1 execução por hora, não
 * a cada 5 minutos como está escrito no workflow), loja que fechou no meio,
 * canal fora do ar — ela deixa
 * de ser recuperação de carrinho e vira cutucada sobre um pedido que a pessoa
 * já esqueceu.
 *
 * É também a TRAVA MECÂNICA contra enxurrada: por construção, um carrinho
 * parado há horas ou dias **não pode** virar mensagem, aconteça o que
 * acontecer com as outras regras. Prompt é aviso; isto é trava (guardrail 4).
 *
 * Medida a partir do INSTANTE DO ABANDONO (`updatedAt + inactivityMinutes`), e
 * não da última atividade — assim ela não depende do valor de inatividade
 * usado na chamada.
 *
 * O prazo de validade de 6 h (`MAX_AGE_HOURS`) continua existindo e é mais
 * frouxo que esta janela: ele governa a BUSCA e a contagem de vencidos que o
 * `CartRecoveryHealthService` lê. Quem manda no envio é a janela de entrega.
 */
const JANELA_DE_ENTREGA_MINUTOS = 30;

// Unambiguous alphanumeric charset (no 0/O, 1/I/l)
const RECOVERY_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateRecoveryCode(): string {
  let code = "";
  const bytes = crypto.randomBytes(8);
  for (const byte of bytes) code += RECOVERY_CODE_CHARS[byte % RECOVERY_CODE_CHARS.length];
  return code;
}

function buildShortRecoveryUrl(recoveryCode: string): string {
  return `${getPublicSiteUrl()}/r/${recoveryCode}`;
}

function buildRecoveryMessage(name: string | null, shortRecoveryUrl: string): string {
  const firstName = name?.trim().split(/\s+/)[0] ?? "você";
  return (
    `Oi, ${firstName}! Percebi que seu pedido não foi finalizado 😊\n\n` +
    `Você precisa de alguma ajuda para concluir?\n\n` +
    `👉 Retomar pedido: ${shortRecoveryUrl}`
  );
}

const ACTIVE_CONV_STATUSES = [
  ConversationStatus.OPEN,
  ConversationStatus.HUMAN,
  ConversationStatus.BOT,
  ConversationStatus.AI_ATENDENDO,
] as const;

/**
 * Deixa a linha de execução da recuperação — a MEDIÇÃO que faltava.
 *
 * Até 05/08/2026 a recuperação de carrinho enviava (quando enviava) sem gravar
 * uma única linha em `campaign_executions`. Consequência prática: a tela de
 * Campanhas não tinha o que somar, a atribuição de receita não tinha o que
 * cruzar (`RevenueAttributionService` parte de `campaignExecution`) e um envio
 * bem-sucedido era indistinguível de "não aconteceu nada".
 *
 * Só grava quando existe a linha de Campanha do carrinho (templateId
 * `carrinho-abandonado`) — sem ela não há a que pendurar a execução. Restaurante
 * nessa situação continua medido pelo carimbo no rascunho, que o
 * `CartRecoveryHealthService` lê; o que não existe é o número por campanha.
 *
 * BEST-EFFORT DE PROPÓSITO: falha aqui NUNCA pode derrubar um envio que já saiu
 * (nem provocar reenvio). Registrar é importante; entregar é mais.
 */
async function registrarExecucao(entrada: {
  campaignId:    string;
  restaurantId:  string;
  customerId:    string;
  customerName:  string | null;
  customerPhone: string;
  messageText:   string;
  variantKey:    string | null;
  status:        "SENT" | "FAILED" | "BLOCKED";
  sentAt?:       Date | null;
  failedReason?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    await prisma.campaignExecution.create({
      data: {
        campaignId:    entrada.campaignId,
        restaurantId:  entrada.restaurantId,
        customerId:    entrada.customerId,
        customerName:  entrada.customerName,
        customerPhone: entrada.customerPhone,
        messageText:   entrada.messageText,
        variantKey:    entrada.variantKey,
        status:        entrada.status as never,
        sentAt:        entrada.sentAt ?? null,
        failedReason:  entrada.failedReason ?? null,
        errorMessage:  entrada.errorMessage ?? null,
      },
    });
    // O contador denormalizado é o que a tabela "Campanhas ativas" lê direto.
    if (entrada.status === "SENT" || entrada.status === "FAILED") {
      await prisma.campaign.update({
        where: { id: entrada.campaignId },
        data:  entrada.status === "SENT"
          ? { totalSent: { increment: 1 }, lastRunAt: entrada.sentAt ?? new Date() }
          : { totalFailed: { increment: 1 } },
      });
    }
  } catch (e) {
    console.warn(`[OrderDraftRecoverySendService] não foi possível registrar a execução da recuperação`, {
      campaignId: entrada.campaignId, draftStatus: entrada.status,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Finds (or creates) the WhatsApp conversation for a customer, logs the
 * recovery message as an outbound AI message, and sets contextType to
 * "CART_RECOVERY" so that the next inbound reply triggers human handoff.
 * This is fire-and-forget from the caller's perspective.
 */
async function logRecoveryToConversation(
  restaurantId: string,
  customerId:   string,
  customerPhone: string,
  customerName:  string | null,
  messageContent: string,
  draftId: string,
  sentAt: Date,
): Promise<void> {
  let conversation = await prisma.conversation.findFirst({
    where: {
      restaurantId,
      customerId,
      status: { in: [...ACTIVE_CONV_STATUSES] },
      channel: "WHATSAPP",
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        restaurantId,
        customerId,
        channel:      "WHATSAPP",
        status:       ConversationStatus.OPEN,
        customerPhone,
        customerName:  customerName ?? undefined,
        contextType:  "CART_RECOVERY",
      },
      select: { id: true },
    });
  }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction:      "OUTBOUND",
        senderType:     "AI",
        content:        messageContent,
        type:           "TEXT",
        sentAt,
        metadata:       { source: "CART_RECOVERY", draftId },
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data:  { lastMessageAt: sentAt, contextType: "CART_RECOVERY" },
    }),
  ]);
}

export class OrderDraftRecoverySendService {
  static async sendCartRecoveryMessages({
    inactivityMinutes = 2,
    maxAgeHours       = MAX_AGE_HOURS,
    deliveryWindowMinutes = JANELA_DE_ENTREGA_MINUTOS,
    limit             = 50,
    dryRun            = false,
    restaurantId,
  }: {
    inactivityMinutes?: number;
    /** Prazo de validade do carrinho. Mais velho que isso não é mais cobrado. */
    maxAgeHours?:       number;
    /**
     * Quanto tempo depois do abandono a mensagem ainda pode sair. Fora disso o
     * carrinho morre em silêncio — ver `JANELA_DE_ENTREGA_MINUTOS`.
     */
    deliveryWindowMinutes?: number;
    limit?:             number;
    dryRun?:            boolean;
    /**
     * Optional restaurant scope. When set, only this restaurant's drafts are
     * considered — used by the diagnostics QA endpoint so a per-restaurant check
     * (e.g. sushi-cazza) is never polluted by stale test drafts from other
     * restaurants (e.g. pizzaria-testando). The production scheduler/cron leave
     * this unset for global behaviour.
     */
    restaurantId?:      string;
  } = {}): Promise<RecoverySendResult> {
    const startMs        = Date.now();
    const thresholdDate  = new Date(Date.now() - inactivityMinutes * 60_000);
    // O piso da validade: mais velho que isto, o carrinho venceu.
    const vencimentoDate = new Date(Date.now() - maxAgeHours * 60 * 60_000);
    const oneDayAgo      = new Date(Date.now() - 24 * 60 * 60_000);

    // ── Step 1: fetch candidate drafts ──────────────────────────────────────
    // OPEN + parado o suficiente + DENTRO DO PRAZO + com item + sem recuperação
    // já enviada neste rascunho. O `gte: vencimentoDate` é a correção de 30/07:
    // sem ele, um rascunho de três semanas atrás continuava candidato para
    // sempre e uma hora virava "percebi que seu pedido não foi finalizado"
    // sobre um carrinho do mês passado.
    const candidates = await prisma.orderDraft.findMany({
      where: {
        status:           "OPEN",
        updatedAt:        { lt: thresholdDate, gte: vencimentoDate },
        recoveryAttempts: 0,
        items:            { some: {} },
        ...(restaurantId ? { restaurantId } : {}),
      },
      select: {
        id:           true,
        restaurantId: true,
        customerId:   true,
        updatedAt:    true,
        customer: {
          select: {
            id:    true,
            name:  true,
            phone: true,
          },
        },
        restaurant: {
          select: {
            slug: true,
            name: true,
          },
        },
      },
      orderBy: { updatedAt: "asc" },
      take:    limit,
    });

    // Quantos ficaram de fora POR TEREM VENCIDO. Sem este número, o corte
    // pareceria "sumiu carrinho" na tela de diagnóstico — e a diferença entre
    // "não havia" e "venceu" é exatamente o que se quer enxergar.
    const skippedTooOld = await prisma.orderDraft.count({
      where: {
        status:           "OPEN",
        updatedAt:        { lt: vencimentoDate },
        recoveryAttempts: 0,
        items:            { some: {} },
        ...(restaurantId ? { restaurantId } : {}),
      },
    });

    if (candidates.length === 0) {
      return {
        checked: 0, eligible: 0, sent: 0,
        skippedNoPhone: 0, skippedAlreadySent: 0, skippedDailyLimit: 0,
        skippedOrderedAfter: 0, skippedPendingPayment: 0,
        skippedOrderOrPaymentExists: 0,
        skippedNoConfig: 0, skippedRestaurantClosed: 0, failed: 0,
        skippedTemplateRequired: 0,
        dryRun, inactivityMinutes, maxAgeHours, skippedTooOld,
        deliveryWindowMinutes, skippedTooLate: 0, skippedSafety: 0,
        durationMs: Date.now() - startMs,
      };
    }

    // ── Step 1b: honor the per-restaurant cart-recovery on/off switch ────────
    // Cart recovery is a ready-made campaign; the owner can turn it off in the
    // Campanhas tab. Default ON (readyMadeConfig absent → enabled) so existing
    // restaurants keep the current behavior.
    const candidateRestaurantIds = [...new Set(candidates.map((d) => d.restaurantId))];
    const profiles = await prisma.restaurantCRMProfile.findMany({
      where:  { restaurantId: { in: candidateRestaurantIds } },
      select: { restaurantId: true, readyMadeConfig: true, whatsAppSafetyConfig: true },
    });
    // Per-restaurant cart-recovery config (message + reward) and safety (coupon budget).
    const cartCfgByRestaurant = new Map(profiles.map((p) => [p.restaurantId, parseReadyMadeConfig(p.readyMadeConfig)]));
    const safetyByRestaurant  = new Map(profiles.map((p) => [p.restaurantId, parseSafetyConfig(p.whatsAppSafetyConfig)]));

    // Cart recovery now also has a real Campaign row (templateId carrinho-abandonado).
    // When one exists it's the source of truth for on/off + message + reward; otherwise
    // we fall back to the legacy readyMadeConfig flag (default ON).
    const cartRows = await prisma.campaign.findMany({
      where:  { restaurantId: { in: candidateRestaurantIds }, templateId: "carrinho-abandonado" },
      orderBy: { createdAt: "desc" },
      select: { id: true, restaurantId: true, status: true, message: true, scheduleConfig: true, audienceConfig: true },
    });
    const cartRowByRestaurant = new Map<string, (typeof cartRows)[number]>();
    for (const r of cartRows) if (!cartRowByRestaurant.has(r.restaurantId)) cartRowByRestaurant.set(r.restaurantId, r);

    // Meta official per restaurant: cart messages to web-cart customers (no open
    // 24h window) must go out as APPROVED templates, not freeform.
    // Se esta consulta falhar, o mapa fica vazio e TODO restaurante cairia no
    // caminho freeform — o que é degradar em silêncio. O caminho freeform hoje
    // devolve BLOCKED e é contado (skippedTemplateRequired), então nada some;
    // mas a falha da consulta precisa aparecer no log para não ser confundida
    // com "nenhum restaurante tem CRM Meta ligado".
    const metaCfgs = await prisma.metaWhatsAppConfig.findMany({
      where:  { restaurantId: { in: candidateRestaurantIds } },
      select: { restaurantId: true, metaCrmEnabled: true, connectionStatus: true },
    }).catch((e) => {
      console.error(`[OrderDraftRecoverySendService] leitura das configs Meta falhou — nenhum template será usado neste tick`, {
        error: e instanceof Error ? e.message : String(e),
      });
      return [] as { restaurantId: string; metaCrmEnabled: boolean; connectionStatus: string | null }[];
    });
    const metaCfgByRestaurant = new Map(metaCfgs.map((m) => [m.restaurantId, m]));

    const cartDisabled = new Set(
      candidateRestaurantIds.filter((rid) => {
        const row = cartRowByRestaurant.get(rid);
        if (row) return !["ACTIVE", "SCHEDULED"].includes(row.status); // row is source of truth
        return !(cartCfgByRestaurant.get(rid)?.cartRecoveryEnabled ?? true); // legacy flag
      }),
    );

    // ── Step 2: batch-fetch customers who already got a recovery in last 24h ─
    // Check via drafts that have lastRecoveryAt set recently — avoids adding
    // a field to the Customer model.
    const uniqueCustomerIds   = [...new Set(candidates.map((d) => d.customerId))];
    const uniqueRestaurantIds = [...new Set(candidates.map((d) => d.restaurantId))];

    const recentlyRecoveredDrafts = await prisma.orderDraft.findMany({
      where: {
        customerId:    { in: uniqueCustomerIds },
        lastRecoveryAt: { gt: oneDayAgo },
      },
      select: { customerId: true, restaurantId: true },
    });
    // Key: customerId — daily limit is global across restaurants
    const dailyLimitSet = new Set(recentlyRecoveredDrafts.map((d) => d.customerId));

    // ── Step 3: batch-fetch AWAITING_PAYMENT orders ─────────────────────────
    const pendingPaymentOrders = await prisma.order.findMany({
      where: {
        status:       "AWAITING_PAYMENT",
        customerId:   { in: uniqueCustomerIds },
        restaurantId: { in: uniqueRestaurantIds },
      },
      select: { customerId: true, restaurantId: true },
    });
    const pendingSet = new Set(
      pendingPaymentOrders.map((o) => `${o.restaurantId}:${o.customerId}`),
    );

    // ── Step 4: per-draft eligibility + send ────────────────────────────────
    let eligible                    = 0;
    let sent                        = 0;
    let skippedNoPhone              = 0;
    let skippedAlreadySent          = 0;
    let skippedDailyLimit           = 0;
    let skippedOrderedAfter         = 0;
    let skippedPendingPayment       = 0;
    let skippedOrderOrPaymentExists = 0;
    let skippedNoConfig             = 0;
    let skippedRestaurantClosed     = 0;
    let failed                      = 0;
    let skippedTemplateRequired     = 0;
    let skippedTooLate              = 0;
    let skippedSafety               = 0;

    /**
     * A loja estava aberta NAQUELE INSTANTE?
     *
     * `isRestaurantOpenNow` já aceita a data a consultar — é a fonte de verdade
     * única do horário da loja (fuso do restaurante, turnos partidos, virada de
     * meia-noite, e "sem horário cadastrado = sem restrição"). Perguntar sobre o
     * passado não exige regra nova: exige passar a data certa. Segunda régua de
     * "está aberto" seria a maneira garantida de divergir da loja.
     *
     * Cacheado por restaurante + MINUTO consultado: vários rascunhos abandonados
     * no mesmo minuto respondem com uma consulta só.
     *
     * Falha fechada: se a apuração explodir, a resposta é NÃO ABERTA (não
     * envia) com log do caso concreto. Ausência de informação não é permissão de
     * disparo — guardrail 1.
     */
    const aberturaCache = new Map<string, boolean>();
    const estavaAbertaEm = async (restaurantId: string, quando: Date): Promise<boolean> => {
      const chave = `${restaurantId}:${Math.floor(quando.getTime() / 60_000)}`;
      if (aberturaCache.has(chave)) return aberturaCache.get(chave)!;
      let aberta = false;
      try {
        aberta = await isRestaurantOpenNow(restaurantId, quando);
      } catch (e) {
        aberta = false;
        console.error(`[OrderDraftRecoverySendService] leitura do horário da loja falhou — falhando fechado (não envia)`, {
          restaurantId, quando: quando.toISOString(), error: e instanceof Error ? e.message : String(e),
        });
      }
      aberturaCache.set(chave, aberta);
      return aberta;
    };

    // Portão de config, cacheado por tick. A pergunta antiga era "existe config da
    // Evolution?"; a Evolution saiu do Foocci, então a pergunta equivalente — e
    // agora ÚNICA — é "existe config da Meta para este restaurante?".
    //
    // Restaurante sem config é PULADO (skippedNoConfig), nunca tentado: sem este
    // portão o envio falharia a cada minuto de cron, o rascunho nunca seria
    // carimbado e o log encheria de META_NOT_CONNECTED de lojas que simplesmente
    // nunca conectaram o WhatsApp.
    //
    // E ausência de informação não é informação: qualquer erro na leitura da
    // config vira `false` (falha fechada, não envia) COM log — não pode virar
    // "pode enviar" nem sumir como se não houvesse nada a enviar.
    const sendableCache = new Map<string, boolean>();
    const canSendWhatsApp = async (restaurantId: string): Promise<boolean> => {
      if (sendableCache.has(restaurantId)) return sendableCache.get(restaurantId)!;
      let ok = false;
      try {
        ok = (await MetaConfigService.getResolved(restaurantId)) != null;
        if (!ok) {
          console.warn(`[OrderDraftRecoverySendService] sem config Meta — recuperação NÃO enviada`, { restaurantId });
        }
      } catch (e) {
        ok = false;
        console.error(`[OrderDraftRecoverySendService] leitura da config Meta falhou — falhando fechado (não envia)`, {
          restaurantId, error: e instanceof Error ? e.message : String(e),
        });
      }
      sendableCache.set(restaurantId, ok);
      return ok;
    };

    // Contexto do portão unificado do CRM, UMA vez por restaurante por tick
    // (config de segurança, quanto já saiu hoje, teto de contatos). Se a leitura
    // falhar, devolve `null` e o destinatário é REPROVADO — não saber quais
    // regras valem não pode virar permissão de enviar.
    //
    // O canal já foi perguntado por este serviço, com falha fechada, em
    // `canSendWhatsApp` — por isso `whatsappAvailable: true` aqui em vez de uma
    // segunda pergunta, com resposta possivelmente diferente, sobre a mesma
    // coisa. Mesmo padrão do envio manual em `CrmCampaignService`.
    const safetyCtxCache = new Map<string, ContactSafetyGlobalContext | null>();
    const contextoDeSeguranca = async (restaurantId: string): Promise<ContactSafetyGlobalContext | null> => {
      if (safetyCtxCache.has(restaurantId)) return safetyCtxCache.get(restaurantId)!;
      let ctx: ContactSafetyGlobalContext | null = null;
      try {
        ctx = await ContactSafetyService.buildGlobalContext(restaurantId, { whatsappAvailable: true });
      } catch (e) {
        console.error(`[OrderDraftRecoverySendService] leitura das regras de segurança do CRM falhou — falhando fechado (não envia)`, {
          restaurantId, error: e instanceof Error ? e.message : String(e),
        });
      }
      safetyCtxCache.set(restaurantId, ctx);
      return ctx;
    };

    for (const draft of candidates) {
      const customer = draft.customer;
      const key      = `${draft.restaurantId}:${draft.customerId}`;

      // Cart recovery turned off for this restaurant (ready-made campaign off).
      if (cartDisabled.has(draft.restaurantId)) {
        continue;
      }

      // Sem config Meta → pula sem tentar (ver portão acima).
      if (!(await canSendWhatsApp(draft.restaurantId))) {
        skippedNoConfig++;
        continue;
      }

      // Rule 4: real phone required (no guest identifiers)
      if (!customer.phone || isGuestIdentifier(customer.phone)) {
        skippedNoPhone++;
        continue;
      }
      // Normaliza o telefone: só dígitos, sem "+", sem espaço nem traço.
      // Telefones E.164 vindos do /pedido são gravados como "+5511999990000".
      // Mesmo padrão já provado no OrderNotificationService.
      const toPhone = customer.phone.replace(/\D/g, "");
      if (!toPhone.match(/^\d{10,15}$/)) {
        skippedNoPhone++;
        continue;
      }

      // Rule 5: defensive check — DB query already filters recoveryAttempts=0
      // but handle edge case of concurrent cron runs
      if (dailyLimitSet.has(draft.customerId)) {
        skippedDailyLimit++;
        continue;
      }

      // Rule 8: Pix/payment pending — do not interrupt active payment flow
      if (pendingSet.has(key)) {
        skippedPendingPayment++;
        skippedOrderOrPaymentExists++;
        console.info(`[OrderDraftRecoverySendService] skip rule8 pending payment`, {
          draftId: draft.id, customerId: draft.customerId, restaurantId: draft.restaurantId,
        });
        continue;
      }

      // Rule 7 (FIXED): non-cancelled order placed at or around the time of this draft session.
      // Use a 30-minute lookback from draft.updatedAt to guard against the draft being
      // synced a few seconds AFTER order creation — which previously caused gt to miss the order.
      const rule7Lookback = new Date(draft.updatedAt.getTime() - 30 * 60_000);
      const recentOrder = await prisma.order.findFirst({
        where: {
          restaurantId: draft.restaurantId,
          customerId:   draft.customerId,
          status:       { not: "CANCELLED" },
          createdAt:    { gte: rule7Lookback },
        },
        select: { id: true },
      });
      if (recentOrder) {
        skippedOrderedAfter++;
        skippedOrderOrPaymentExists++;
        console.info(`[OrderDraftRecoverySendService] skip rule7 recent order found`, {
          draftId: draft.id, orderId: recentOrder.id,
          customerId: draft.customerId, restaurantId: draft.restaurantId,
          draftUpdatedAt: draft.updatedAt, lookbackDate: rule7Lookback,
        });
        continue;
      }

      // ── O INSTANTE DO ABANDONO ────────────────────────────────────────────
      // "Fechou o Foocci" não é detectável no navegador; inatividade é. Então o
      // abandono é datado: última atividade + o silêncio que o define.
      const momentoDoAbandono = new Date(draft.updatedAt.getTime() + inactivityMinutes * 60_000);
      const atrasoMinutos     = (Date.now() - momentoDoAbandono.getTime()) / 60_000;

      // Regra 10 — JANELA DE ENTREGA. A mensagem de carrinho é do momento; fora
      // dele ela não recupera nada, só cutuca. Este portão é a trava mecânica
      // contra enxurrada: carrinho parado há horas não vira mensagem por
      // caminho nenhum, nem que todas as outras regras mudem.
      if (atrasoMinutos > deliveryWindowMinutes) {
        skippedTooLate++;
        console.info(`[OrderDraftRecoverySendService] abandono fora da janela de entrega — não será cobrado`, {
          draftId: draft.id, restaurantId: draft.restaurantId,
          abandonadoEm: momentoDoAbandono.toISOString(),
          atrasoMinutos: Math.round(atrasoMinutos),
          janelaMinutos: deliveryWindowMinutes,
        });
        continue;
      }

      // Regra 9 — HORÁRIO DA LOJA, PERGUNTADO NO INSTANTE DO ABANDONO.
      //
      // Decisão do CEO (05/08/2026): quem monta o carrinho de madrugada queria
      // comer de madrugada. Loja fechada naquele instante → NÃO MANDA e NÃO
      // GUARDA para quando abrir. O carrinho morre em silêncio, de propósito.
      //
      // Por que a pergunta é sobre o PASSADO e não sobre "agora": a resposta
      // precisa ser a MESMA em todo tick futuro. Assim o rascunho não fica
      // "esperando a loja abrir" — não existe fila, não existe estado preso, e
      // nenhum carrinho de ontem pode virar mensagem hoje porque a loja abriu.
      // Era exatamente esse adiamento que prometia uma segunda chance que o
      // prazo de validade nunca deixava acontecer.
      //
      // Não se carimba o rascunho aqui: ele continua OPEN e o cliente que voltar
      // pelo próprio link acha o carrinho dele intacto. O que não acontece é a
      // cobrança.
      if (!(await estavaAbertaEm(draft.restaurantId, momentoDoAbandono))) {
        skippedRestaurantClosed++;
        console.info(`[OrderDraftRecoverySendService] loja fechada no momento do abandono — não cobra agora nem depois`, {
          draftId: draft.id, restaurantId: draft.restaurantId,
          abandonadoEm: momentoDoAbandono.toISOString(),
        });
        continue;
      }

      // ── REGRA 11 — AS TRAVAS DO CRM, AGORA TAMBÉM AQUI ───────────────────
      //
      // Até 23/08/2026 este caminho tinha SÓ as guardas próprias dele (uma
      // recuperação por rascunho, uma por cliente por dia, carimbo atômico, loja
      // aberta no abandono) e passava POR FORA do portão unificado do CRM. O
      // rodapé da tela de Regras de Segurança prometia quatro "proteções sempre
      // ativas"; aqui três delas não valiam:
      //
      //   • quem pediu para sair (opt-out) RECEBIA por este caminho — LGPD;
      //   • a janela de silêncio 21h–8h era ignorada: loja aberta às 23h,
      //     mensagem às 23h;
      //   • o intervalo de 24 h entre mensagens de CRM não era consultado: dava
      //     para receber campanha de manhã e recuperação de carrinho à tarde.
      //
      // As guardas próprias CONTINUAM valendo — isto soma, não troca. Vem depois
      // delas de propósito: são checagens locais e baratas, e quem já foi
      // recusado por elas não precisa de consulta ao banco para ser recusado de
      // novo.
      //
      // `enforceDailyCap: false` é deliberado e NÃO é um furo: a recuperação de
      // carrinho é isenta do teto diário por decisão registrada
      // (`BUDGET_EXEMPT_TEMPLATE_IDS` em `crm-safety.ts` — "medir não pode custar
      // envio"). O que ela deixa de ser isenta é do resto.
      //
      // `enforceRestaurantOpen: false` porque a regra 9 acima já responde a
      // mesma pergunta, e melhor: ela pergunta pelo INSTANTE DO ABANDONO, não
      // por "agora".
      //
      // `campaignId: null` de propósito: passar o id da campanha de carrinho
      // ligaria o dedup de "já recebeu ESTA campanha", que é VITALÍCIO, e
      // transformaria "uma recuperação por cliente por dia" em "uma por cliente
      // para sempre". A trava pedida é o intervalo de 24 h, não o fim do recurso.
      const ctxSeguranca = await contextoDeSeguranca(draft.restaurantId);
      const decisaoSeguranca = ctxSeguranca
        ? await ContactSafetyService.assertSendable({
            restaurantId:          draft.restaurantId,
            customerId:            draft.customerId,
            phone:                 customer.phone,
            campaignId:            null,
            enforceTimeWindows:    true,  // janela de silêncio 21h–8h
            enforceDailyCap:       false, // isenção registrada do teto diário
            enforceRestaurantOpen: false, // a regra 9 já respondeu, e melhor
            context:               ctxSeguranca,
          })
        : {
            sendable: false as const,
            reason:   "UNKNOWN_ERROR" as const,
            detail:   "Não foi possível ler as regras de segurança do CRM",
          };
      if (!decisaoSeguranca.sendable) {
        skippedSafety++;
        // O alerta carrega a própria evidência: sem o motivo, "bloqueado" vira
        // ruído que ninguém investiga.
        console.info(`[OrderDraftRecoverySendService] recuperação bloqueada pelo portão do CRM`, {
          draftId:      draft.id,
          restaurantId: draft.restaurantId,
          customerId:   draft.customerId,
          motivo:       decisaoSeguranca.reason,
          detalhe:      decisaoSeguranca.detail,
        });
        // Nada de linha em `campaign_executions` aqui: o rascunho NÃO é carimbado
        // (ele segue elegível no próximo tick, até a janela de entrega vencer), e
        // gravar uma linha por tick encheria a tabela com o mesmo bloqueio
        // repetido dezenas de vezes para o mesmo carrinho.
        continue;
      }

      eligible++;

      if (dryRun) {
        sent++;
        continue;
      }

      // O que a linha de execução precisa saber, visível também no `catch` —
      // uma falha sem rastro é a mesma cegueira que este bloco veio corrigir.
      const cartRow = cartRowByRestaurant.get(draft.restaurantId);
      let textoEnviado = "";
      let fraseUsada: string | null = null;

      // ── Send ──────────────────────────────────────────────────────────────
      try {
        // A credencial da Meta é revalidada dentro do provedor na hora do envio.

        // Generate short recovery code and persist it BEFORE sending so the
        // URL resolves in the DB the moment the customer taps the link.
        const recoveryCode = generateRecoveryCode();
        await prisma.orderDraft.update({
          where: { id: draft.id },
          data:  { recoveryCode },
        });

        const shortRecoveryUrl = buildShortRecoveryUrl(recoveryCode);
        // Owner-customized message + reward. Prefer the Campaign row (edited in the
        // manage modal); fall back to the legacy readyMadeConfig. For cart recovery
        // {link_cardapio} resolves to the resume link so the exact cart is restored;
        // {cupom} shows the configured reward.
        const cartCfg    = cartCfgByRestaurant.get(draft.restaurantId);
        const rowCoupon  = (cartRow?.scheduleConfig as { coupon?: unknown } | null)?.coupon as
          | { type: "PERCENTAGE" | "FIXED" | "CUSTOM" | "FREE_SHIPPING"; value: number; description?: string | null }
          | null | undefined;
        const cartCoupon = rowCoupon ?? cartCfg?.cartRecoveryCoupon ?? null;
        // Message pool: rotate over the phrases the owner selected in the manage
        // modal (same behavior as recurring campaigns); empty pool falls back to
        // the row's single message, then the legacy config.
        const drawn = cartRow
          ? pickPhrase(resolveActivePhrases(
              { templateId: "carrinho-abandonado", message: cartRow.message ?? "" },
              parseMessagePool(cartRow.scheduleConfig),
              { hasCoupon: !!cartCoupon, includeAgent: isAgentActive(cartRow.scheduleConfig) },
            ))
          : null;
        const customMsg  = drawn?.text?.trim() || cartCfg?.cartRecoveryMessage?.trim();
        const message    = customMsg
          ? renderCrmMessage(customMsg, { name: customer.name ?? "" }, {
              restaurantName: draft.restaurant.name ?? "nossa loja",
              pedidoUrl:      shortRecoveryUrl,
              coupon:         cartCoupon,
            })
          : buildRecoveryMessage(customer.name, shortRecoveryUrl);
        textoEnviado = message;
        fraseUsada   = drawn?.key ?? null;

        console.info(`[OrderDraftRecoverySendService] sending recovery`, {
          draftId:      draft.id,
          customerId:   customer.id,
          restaurantId: draft.restaurantId,
          phoneMasked:  maskPhone(customer.phone),
        });

        // Na Meta oficial, o cliente que montou o carrinho no site normalmente NÃO
        // tem janela de 24h aberta — texto livre é RECUSADO. O caminho bom é o
        // modelo APROVADO da frase sorteada (mesma mecânica do runner do CRM).
        // O texto livre continua existindo, mas só serve para quem está DENTRO da
        // janela; fora dela ele volta BLOCKED e isso é contado, não engolido.
        const metaCfg = metaCfgByRestaurant.get(draft.restaurantId);
        // Idem ao cron: o gate é a CONEXÃO, não o interruptor antigo de provedor.
        if (metaCfg?.connectionStatus === "CONNECTED" && cartRow) {
          const renderCtx = {
            restaurantName: draft.restaurant.name ?? "nossa loja",
            pedidoUrl:      shortRecoveryUrl,
            coupon:         cartCoupon,
          };
          // Prefer the drawn phrase's own approved template (text must match).
          const phraseTpl = drawn ? readPhraseMetaTemplates(cartRow.audienceConfig)[drawn.key] : undefined;
          const metaAudienceCfg = phraseTpl && phraseTpl.submittedMessage === drawn?.text
            ? { metaTemplate: phraseTpl }
            : cartRow.audienceConfig;
          const { result: metaResult, usedTemplate } = await sendMetaCrmMessage(new MetaWhatsAppCloudProvider(), {
            restaurantId: draft.restaurantId,
            phone:        toPhone,
            freeformText: message,
            firstName:    (customer.name ?? "").split(" ")[0] || "Cliente",
            campaign:     { objective: "CART_ABANDONED", audienceConfig: metaAudienceCfg },
            renderToken:  (token) => renderCrmMessage(token, { name: customer.name ?? "" }, renderCtx),
          });
          if (!metaResult.ok) {
            throw new Error(metaResult.errorCode ?? metaResult.error ?? (usedTemplate ? "META_TEMPLATE_SEND_FAILED" : "META_SEND_FAILED"));
          }
          if (usedTemplate) console.info(`[OrderDraftRecoverySendService] sent via approved Meta template`, { draftId: draft.id });
        } else {
          const sendRes = await WhatsAppMessagingService.sendText({
            restaurantId: draft.restaurantId,
            to:           toPhone,
            text:         message,
          });

          // BLOCKED não é falha de rede: é a política da Meta recusando texto
          // livre fora da janela de 24h. Precisa APARECER — no contador e no log
          // —, senão a recuperação "roda" todo minuto sem nada chegar ao cliente
          // e o painel mostra checked>0 / failed=0, que lê como sucesso.
          if (!sendRes.ok && sendRes.status === "BLOCKED") {
            skippedTemplateRequired++;
            console.warn(`[OrderDraftRecoverySendService] recuperação NÃO enviada: a Meta exige modelo aprovado fora da janela de 24h`, {
              draftId:      draft.id,
              restaurantId: draft.restaurantId,
              phoneMasked:  maskPhone(customer.phone),
              blockReason:  sendRes.blockReason ?? null,
              detalhe:      sendRes.error ?? null,
              acao:         "cadastrar e aprovar um modelo de carrinho abandonado na Meta e ligar o CRM Meta desta loja",
            });
            if (cartRow) {
              await registrarExecucao({
                campaignId: cartRow.id, restaurantId: draft.restaurantId,
                customerId: draft.customerId, customerName: customer.name,
                customerPhone: customer.phone, messageText: "", variantKey: fraseUsada,
                status: "BLOCKED",
                failedReason: "A Meta exige modelo aprovado fora da janela de 24h",
                errorMessage: sendRes.blockReason ?? "META_TEMPLATE_REQUIRED",
              });
            }
            continue; // não carimba o rascunho: ele vence sozinho pelo prazo de 6h
          }

          if (!sendRes.ok) throw new Error(sendRes.errorCode ?? sendRes.error ?? "SEND_FAILED");
        }

        // Stamp draft so it never fires again
        const now = new Date();
        await prisma.orderDraft.update({
          where: { id: draft.id },
          data: {
            recoveryAttempts: { increment: 1 },
            lastRecoveryAt:   now,
          },
        });

        dailyLimitSet.add(draft.customerId); // guard remaining iterations

        // O rastro por pessoa. Sem ele, a coluna "Enviados" da tela e a
        // atribuição de receita não têm de onde tirar número — foi exatamente
        // por isso que a linha do carrinho ficou em traço mesmo quando enviou.
        if (cartRow) {
          await registrarExecucao({
            campaignId: cartRow.id, restaurantId: draft.restaurantId,
            customerId: draft.customerId, customerName: customer.name,
            customerPhone: customer.phone, messageText: textoEnviado,
            variantKey: fraseUsada, status: "SENT", sentAt: now,
          });
        }

        // Credit the configured reward to the customer's wallet (best-effort — never
        // blocks the recovery send). Respects the monthly coupon budget.
        if (cartCoupon) {
          const safety = safetyByRestaurant.get(draft.restaurantId);
          await CustomerCouponService.grant({
            restaurantId: draft.restaurantId,
            customerId:   draft.customerId,
            coupon:       cartCoupon,
            validityDays: (cartCoupon as { validityDays?: number }).validityDays ?? null,
            sourceCampaignId: cartRow?.id ?? null,
            monthlyBudget: safety?.couponMonthlyBudget ?? 0,
            avgTicket:     safety?.couponAvgTicket ?? 50,
          }).catch((e) => console.warn(`[OrderDraftRecoverySendService] coupon grant failed`, {
            draftId: draft.id, error: e instanceof Error ? e.message : String(e),
          }));
        }

        // Log outbound message to conversation so Atendimento shows it and
        // so that a customer reply triggers human handoff (contextType guard).
        logRecoveryToConversation(
          draft.restaurantId,
          draft.customerId,
          customer.phone,
          customer.name,
          message,
          draft.id,
          now,
        ).catch((err) =>
          console.warn(`[OrderDraftRecoverySendService] conversation log failed`, {
            draftId: draft.id,
            error:   err instanceof Error ? err.message : String(err),
          }),
        );

        console.info(`[OrderDraftRecoverySendService] recovery sent`, {
          draftId:      draft.id,
          customerId:   customer.id,
          restaurantId: draft.restaurantId,
        });
        sent++;
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        console.error(`[OrderDraftRecoverySendService] send failed`, {
          draftId:      draft.id,
          restaurantId: draft.restaurantId,
          phoneMasked:  maskPhone(customer.phone),
          errorMessage: motivo,
        });
        if (cartRow) {
          await registrarExecucao({
            campaignId: cartRow.id, restaurantId: draft.restaurantId,
            customerId: draft.customerId, customerName: customer.name,
            customerPhone: customer.phone, messageText: textoEnviado,
            variantKey: fraseUsada, status: "FAILED",
            failedReason: "Falha ao enviar a recuperação de carrinho",
            errorMessage: motivo,
          });
        }
        failed++;
      }
    }

    return {
      checked:                    candidates.length,
      eligible,
      sent,
      skippedNoPhone,
      skippedAlreadySent,
      skippedDailyLimit,
      skippedOrderedAfter,
      skippedPendingPayment,
      skippedOrderOrPaymentExists,
      skippedNoConfig,
      skippedRestaurantClosed,
      failed,
      skippedTemplateRequired,
      dryRun,
      inactivityMinutes,
      maxAgeHours,
      skippedTooOld,
      deliveryWindowMinutes,
      skippedTooLate,
      skippedSafety,
      durationMs: Date.now() - startMs,
    };
  }
}
