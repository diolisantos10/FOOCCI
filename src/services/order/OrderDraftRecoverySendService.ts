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
import { EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { sendWhatsAppText } from "@/services/whatsapp/activeProvider";
import { isGuestIdentifier } from "@/lib/guest";
import { getPublicSiteUrl } from "@/lib/public-url";
import { isRestaurantOpenNow } from "@/lib/business-hours";
import { parseReadyMadeConfig } from "@/services/crm/ReadyMadeCampaignService";
import { parseMessagePool, resolveActivePhrases, pickPhrase, readPhraseMetaTemplates } from "@/services/crm/crmMessagePool";
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
  skippedNoConfig:            number; // restaurant has no working WhatsApp integration (Meta or Evolution)
  skippedRestaurantClosed:    number; // restaurant is closed — recovery deferred, attempts NOT incremented
  failed:                     number; // the active provider (Meta or Evolution) was called but returned an error
  dryRun:                     boolean;
  inactivityMinutes:          number;
  durationMs:                 number;
}

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
    limit             = 50,
    dryRun            = false,
    restaurantId,
  }: {
    inactivityMinutes?: number;
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
    const oneDayAgo      = new Date(Date.now() - 24 * 60 * 60_000);

    // ── Step 1: fetch candidate drafts ──────────────────────────────────────
    // OPEN + stale + has items + no recovery already sent on this exact draft
    const candidates = await prisma.orderDraft.findMany({
      where: {
        status:           "OPEN",
        updatedAt:        { lt: thresholdDate },
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

    if (candidates.length === 0) {
      return {
        checked: 0, eligible: 0, sent: 0,
        skippedNoPhone: 0, skippedAlreadySent: 0, skippedDailyLimit: 0,
        skippedOrderedAfter: 0, skippedPendingPayment: 0,
        skippedOrderOrPaymentExists: 0,
        skippedNoConfig: 0, skippedRestaurantClosed: 0, failed: 0,
        dryRun, inactivityMinutes,
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
    const metaCfgs = await prisma.metaWhatsAppConfig.findMany({
      where:  { restaurantId: { in: candidateRestaurantIds } },
      select: { restaurantId: true, metaCrmEnabled: true, connectionStatus: true },
    }).catch(() => [] as { restaurantId: string; metaCrmEnabled: boolean; connectionStatus: string | null }[]);
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

    // Cache open/closed status per restaurant for this tick — avoids N DB round-trips
    // when multiple drafts belong to the same restaurant.
    const restaurantOpenCache = new Map<string, boolean>();
    const isOpen = async (restaurantId: string): Promise<boolean> => {
      if (restaurantOpenCache.has(restaurantId)) return restaurantOpenCache.get(restaurantId)!;
      const open = await isRestaurantOpenNow(restaurantId);
      restaurantOpenCache.set(restaurantId, open);
      return open;
    };

    // Config gate, provider-aware and cached per tick: a restaurant with no working
    // WhatsApp integration must be SKIPPED (skippedNoConfig), not attempted. Without
    // this gate the send fails every cron minute (draft never gets stamped) and the
    // error log fills with EVOLUTION_NOT_CONFIGURED for restaurants that simply
    // never connected WhatsApp.
    const sendableCache = new Map<string, boolean>();
    const canSendWhatsApp = async (restaurantId: string): Promise<boolean> => {
      if (sendableCache.has(restaurantId)) return sendableCache.get(restaurantId)!;
      let ok = false;
      try {
        const r = await prisma.restaurant.findUnique({
          where:  { id: restaurantId },
          select: { whatsappProvider: true },
        });
        if (r?.whatsappProvider === "META_CLOUD_API") {
          ok = (await MetaConfigService.getResolved(restaurantId)) != null;
        } else {
          ok = (await EvolutionConfigService.getSnapshot(restaurantId)).ok;
        }
      } catch {
        ok = false;
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

      // No working WhatsApp integration → skip without attempting (see gate above).
      if (!(await canSendWhatsApp(draft.restaurantId))) {
        skippedNoConfig++;
        continue;
      }

      // Rule 4: real phone required (no guest identifiers)
      if (!customer.phone || isGuestIdentifier(customer.phone)) {
        skippedNoPhone++;
        continue;
      }
      // Normalize phone for Evolution: digits only, no leading "+", no spaces/dashes.
      // E.164 phones from /pedido are stored as "+5511999990000"; webhook phones as "+5511999990000".
      // Full digit-strip matches the proven pattern in OrderNotificationService.
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
        // Provider config is validated inside the active provider at send time
        // (Evolution snapshot or Meta Cloud credentials — whichever is ACTIVE).

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
          | { type: "PERCENTAGE" | "FIXED" | "CUSTOM"; value: number; description?: string | null }
          | null | undefined;
        const cartCoupon = rowCoupon ?? cartCfg?.cartRecoveryCoupon ?? null;
        // Message pool: rotate over the phrases the owner selected in the manage
        // modal (same behavior as recurring campaigns); empty pool falls back to
        // the row's single message, then the legacy config.
        const drawn = cartRow
          ? pickPhrase(resolveActivePhrases(
              { templateId: "carrinho-abandonado", message: cartRow.message ?? "" },
              parseMessagePool(cartRow.scheduleConfig),
              { hasCoupon: !!cartCoupon },
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

        // On the official Meta API, a web-cart customer usually has NO open 24h
        // service window — freeform text is REJECTED. Send the phrase's APPROVED
        // template (same mechanics as the CRM runner); freeform stays the
        // fallback for Evolution / in-window customers.
        const metaCfg = metaCfgByRestaurant.get(draft.restaurantId);
        if (metaCfg?.metaCrmEnabled && metaCfg.connectionStatus === "CONNECTED" && cartRow) {
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
          const sendRes = await sendWhatsAppText(draft.restaurantId, toPhone, message);
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
        const isApiErr = err instanceof EvolutionApiError;
        console.error(`[OrderDraftRecoverySendService] send failed`, {
          draftId:      draft.id,
          restaurantId: draft.restaurantId,
          phoneMasked:  maskPhone(customer.phone),
          errorMessage: err instanceof Error ? err.message : String(err),
          ...(isApiErr
            ? { statusCode: (err as EvolutionApiError).status, responseBody: (err as EvolutionApiError).body }
            : {}),
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
      dryRun,
      inactivityMinutes,
      durationMs: Date.now() - startMs,
    };
  }
}
