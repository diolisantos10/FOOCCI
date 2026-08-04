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
  skippedRestaurantClosed:    number; // restaurant is closed — recovery deferred, attempts NOT incremented
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
    limit             = 50,
    dryRun            = false,
    restaurantId,
  }: {
    inactivityMinutes?: number;
    /** Prazo de validade do carrinho. Mais velho que isso não é mais cobrado. */
    maxAgeHours?:       number;
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

    // Cache open/closed status per restaurant for this tick — avoids N DB round-trips
    // when multiple drafts belong to the same restaurant.
    const restaurantOpenCache = new Map<string, boolean>();
    const isOpen = async (restaurantId: string): Promise<boolean> => {
      if (restaurantOpenCache.has(restaurantId)) return restaurantOpenCache.get(restaurantId)!;
      const open = await isRestaurantOpenNow(restaurantId);
      restaurantOpenCache.set(restaurantId, open);
      return open;
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

      // Business hours gate — do NOT increment recoveryAttempts when closed.
      // Recovery is deferred until the next tick when the restaurant reopens.
      // Returns true (open) when no BusinessHours row is configured.
      if (!(await isOpen(draft.restaurantId))) {
        skippedRestaurantClosed++;
        continue;
      }

      eligible++;

      if (dryRun) {
        sent++;
        continue;
      }

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
        const cartRow    = cartRowByRestaurant.get(draft.restaurantId);
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
        console.error(`[OrderDraftRecoverySendService] send failed`, {
          draftId:      draft.id,
          restaurantId: draft.restaurantId,
          phoneMasked:  maskPhone(customer.phone),
          errorMessage: err instanceof Error ? err.message : String(err),
        });
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
      durationMs: Date.now() - startMs,
    };
  }
}
