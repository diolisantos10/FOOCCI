/**
 * GET /api/admin/diagnostics/cart-recovery-qa
 *
 * Deterministic end-to-end QA for the WhatsApp → /pedido identification
 * → OrderDraft → Cart Recovery pipeline.
 *
 * Does NOT depend on:
 *   - Restaurant being open  (shows closed as a named skip reason, test continues)
 *   - Customer sending "0" or "menu" on WhatsApp
 *   - Manual draft reset
 *   - Scheduler timing
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params:
 *   slug                    — restaurant slug, exact match (default: sushi-cazza)
 *   phone                   — E.164 test phone, e.g. +5511999990000
 *                             Required for customer/draft/waToken steps.
 *   liveTest                — "true" envia ao telefone de teste pela Meta (padrão: false)
 *   inactivityMinutes       — minutes of inactivity to simulate (default: 2, max: 60)
 *   includeOtherRestaurants — "true" runs the dry-run globally across ALL
 *                             restaurants (default: false → scoped to this slug,
 *                             so stale test drafts from other restaurants such as
 *                             pizzaria-testando never pollute the result).
 *
 * Safety guards:
 *   - liveTest=false by default — always dryRun unless explicitly enabled.
 *   - Only touches the named test phone/customer. Never real customers.
 *   - Backdates updatedAt via raw SQL only for the test draft.
 *   - Never modifies any other draft or sends to any other phone.
 *   - Phone masked to last-4 in all logs and responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { WhatsAppMessagingService } from "@/services/whatsapp/WhatsAppMessagingService";
import { signWaToken, verifyWaToken } from "@/lib/wa-token";
import { signRecoveryToken } from "@/lib/recovery-token";
import { isGuestIdentifier } from "@/lib/guest";
import {
  OrderDraftRecoverySendService,
  type RecoverySendResult,
} from "@/services/order/OrderDraftRecoverySendService";
import { CartRecoveryScheduler } from "@/services/order/CartRecoveryScheduler";
import { getPublicSiteUrl, getPublicMenuUrl } from "@/lib/public-url";
import { isRestaurantOpenNow } from "@/lib/business-hours";

// ── types ─────────────────────────────────────────────────────────────────────

interface QAStep {
  step:   string;
  status: "pass" | "fail" | "skip" | "warn";
  detail: string;
  data?:  Record<string, unknown>;
}

interface LiveTestOutcome {
  accepted: boolean;
  detail:            string;
  externalMessageId?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length >= 4 ? `****${d.slice(-4)}` : "****";
}

function normalizePhone(raw: string): string {
  const s = raw.trim();
  return s.startsWith("+") ? s : `+${s}`;
}

function isValidDigits(phone: string): boolean {
  return /^\d{10,15}$/.test(phone.replace(/\D/g, ""));
}

// ── route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: "Endpoint disabled — ADMIN_SECRET not configured." },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp               = req.nextUrl.searchParams;
  const slug             = (sp.get("slug") ?? "sushi-cazza").trim().toLowerCase();
  const rawPhone         = sp.get("phone")?.trim() ?? null;
  const liveTest         = sp.get("liveTest") === "true";
  const includeOtherRestaurants = sp.get("includeOtherRestaurants") === "true";
  const inactivityMinutes = Math.min(
    Math.max(Number(sp.get("inactivityMinutes") ?? "2"), 1),
    60,
  );

  const steps: QAStep[]  = [];
  const startMs          = Date.now();
  let verdict: "PASS" | "FAIL" | "PARTIAL" = "PASS";
  let hasFailed          = false; // separate flag avoids TypeScript narrowing issue on verdict
  let failedStep: string | null            = null;
  let failReason: string | null            = null;

  const addPass = (step: string, detail: string, data?: Record<string, unknown>): void => {
    steps.push({ step, status: "pass", detail, data });
  };
  const addFail = (step: string, detail: string, data?: Record<string, unknown>): void => {
    if (!failedStep) { failedStep = step; failReason = detail; verdict = "FAIL"; hasFailed = true; }
    steps.push({ step, status: "fail", detail, data });
  };
  const addWarn = (step: string, detail: string, data?: Record<string, unknown>): void => {
    steps.push({ step, status: "warn", detail, data });
  };
  const addSkip = (step: string, detail: string): void => {
    steps.push({ step, status: "skip", detail });
  };

  // Mutable state accumulated across steps
  let restaurantId: string | null = null;
  let restaurantName: string      = slug;
  let restaurantSlug: string      = slug;
  let channelConfigured = false;
  let channelId: string | null = null;
  let isOpen                      = false;
  let phone: string | null        = null;
  let customerId: string | null   = null;
  let customerName: string | null = null;
  let draftId: string | null      = null;
  let dryRunResult: RecoverySendResult | null = null;
  let liveTestResult: LiveTestOutcome | null  = null;

  // ── Step 1: Resolve restaurant by slug ──────────────────────────────────────
  {
    const restaurant = await prisma.restaurant.findFirst({
      where:  { slug },
      select: { id: true, slug: true, name: true },
    });
    if (!restaurant) {
      addFail("restaurant_resolve", `No restaurant found with slug "${slug}"`);
    } else {
      restaurantId   = restaurant.id;
      restaurantName = restaurant.name;
      restaurantSlug = restaurant.slug;
      addPass("restaurant_resolve", `${restaurant.name} — id: ${restaurant.id}`, {
        restaurantId: restaurant.id,
        slug:         restaurant.slug,
      });
    }
  }

  // ── Step 2: config do canal (Meta) ──────────────────────────────────────────
  if (restaurantId && !failedStep) {
    // `null` cobre "não configurado" E "banco tossiu": nos dois casos o passo
    // REPROVA. Ausência de informação não é aprovação (guardrail 1).
    const cfg = await MetaConfigService.getResolved(restaurantId).catch(() => null);
    if (!cfg) {
      addFail("whatsapp_config", "Sem config ativa da Meta para este restaurante (ou leitura falhou)");
    } else {
      channelConfigured = true;
      channelId = cfg.phoneNumberId;
      addPass("whatsapp_config", `Ativa — phone_number_id: ${channelId}`, { channelId });
    }
  } else if (!failedStep) {
    addSkip("whatsapp_config", "Skipped — restaurant not found");
  }

  // ── Step 3: Business hours ──────────────────────────────────────────────────
  if (restaurantId) {
    isOpen = await isRestaurantOpenNow(restaurantId);
    if (isOpen) {
      addPass("business_hours", "Restaurant is currently OPEN — no business-hours block on recovery.", { isOpen });
    } else {
      addWarn(
        "business_hours",
        "Restaurant is currently CLOSED. Cart recovery will show skippedRestaurantClosed=1 " +
        "in dryRun — this is expected. recoveryAttempts is NOT incremented when closed.",
        { isOpen, skipReason: "restaurant_closed" },
      );
    }
  } else {
    addSkip("business_hours", "Skipped — restaurant not found");
  }

  // ── Step 4: Resolve / create test customer ──────────────────────────────────
  if (!rawPhone) {
    ["customer_resolve", "wa_token_sign", "wa_token_verify", "draft_create",
     "draft_eligible", "pedido_chat_check", "draft_backdate"].forEach((s) =>
      addSkip(s, "No phone provided — pass ?phone=+5511999990000 to enable customer/draft steps"),
    );
  } else if (restaurantId && !failedStep) {
    phone = normalizePhone(rawPhone);

    if (isGuestIdentifier(phone) || !isValidDigits(phone)) {
      addFail(
        "customer_resolve",
        `Invalid phone "${phone}" — must be E.164 with 10–15 digits (e.g. +5511999990000)`,
      );
    } else {
      const customer = await prisma.customer.upsert({
        where:  { phone_restaurantId: { phone, restaurantId } },
        create: { restaurantId, phone, name: "QA Test Customer" },
        update: {},
        select: { id: true, name: true, phone: true },
      });
      customerId   = customer.id;
      customerName = customer.name;
      addPass("customer_resolve", `Customer ready — ${maskPhone(phone)}`, {
        customerId:  customer.id,
        phoneMasked: maskPhone(phone),
        name:        customer.name,
      });
    }
  }

  // ── Step 5: Sign + verify waToken ───────────────────────────────────────────
  if (customerId && phone && restaurantSlug && !failedStep) {
    try {
      const waToken       = signWaToken({ phone, name: customerName ?? undefined });
      const menuBase      = getPublicMenuUrl(restaurantSlug);
      const identifiedUrl = (() => {
        try {
          const u = new URL(menuBase);
          u.searchParams.set("waToken", waToken);
          u.searchParams.set("src", "whatsapp");
          return u.toString();
        } catch { return menuBase; }
      })();
      addPass("wa_token_sign", "waToken signed successfully", {
        identifiedUrl,
        tokenLengthChars: waToken.length,
      });

      const verified = verifyWaToken(waToken);
      if (!verified || verified.phone !== phone) {
        addFail(
          "wa_token_verify",
          "waToken verification returned null or wrong phone — NEXTAUTH_SECRET may differ between sign/verify contexts",
        );
      } else {
        addPass("wa_token_verify", `waToken verifies correctly — phone ****${verified.phone.slice(-4)}, exp ${new Date(verified.exp).toISOString()}`);
      }
    } catch (err) {
      addFail("wa_token_sign", `signWaToken threw: ${err instanceof Error ? err.message : String(err)}`);
      addSkip("wa_token_verify", "Skipped — sign failed");
    }
  } else if (!rawPhone) {
    // already skipped above
  } else if (failedStep && !customerId) {
    addSkip("wa_token_sign",   "Skipped — customer step failed");
    addSkip("wa_token_verify", "Skipped — customer step failed");
  }

  // ── Step 6: Find or create test draft with at least 1 item ─────────────────
  if (customerId && restaurantId && !failedStep) {
    // Reuse any existing OPEN draft for this test customer
    const draftSelect = {
      id: true, status: true, recoveryAttempts: true, lastRecoveryAt: true,
      recoveryCode: true, abandonedAt: true, updatedAt: true,
      _count: { select: { items: true } },
    } as const;

    const existing = await prisma.orderDraft.findFirst({
      where:   { restaurantId, customerId, status: "OPEN" },
      select:  draftSelect,
      orderBy: { updatedAt: "desc" },
    });

    let draft = existing;
    if (!draft) {
      draft = await prisma.orderDraft.create({
        data:   { restaurantId, customerId, status: "OPEN" },
        select: draftSelect,
      });
    }
    draftId = draft.id;

    let itemNote = `${draft._count.items} existing item(s)`;
    if (draft._count.items === 0) {
      // Add a real menu item if one exists; otherwise a QA placeholder (menuItemId nullable)
      const menuItem = await prisma.menuItem.findFirst({
        where:  { category: { restaurantId }, isActive: true, isAvailable: true },
        select: { id: true, name: true, price: true },
      });
      await prisma.orderDraftItem.create({
        data: {
          orderDraftId: draft.id,
          menuItemId:   menuItem?.id ?? null,
          quantity:     1,
          unitPrice:    menuItem?.price ?? "1.00",
          notes:        "QA test item",
        },
      });
      itemNote = menuItem
        ? `item added: "${menuItem.name}" (real menu item)`
        : `item added: QA placeholder (no active menu items found for this restaurant)`;
    }

    const updatedAtAgeMin = Math.round((Date.now() - draft.updatedAt.getTime()) / 60_000);
    addPass("draft_create", `Draft ${draft.id} ready — ${itemNote}`, {
      draftId,
      status:           draft.status,
      existingItems:    draft._count.items,
      itemNote,
      recoveryAttempts: draft.recoveryAttempts,
      lastRecoveryAt:   draft.lastRecoveryAt?.toISOString() ?? null,
      abandonedAt:      draft.abandonedAt?.toISOString() ?? null,
      updatedAt:        draft.updatedAt.toISOString(),
      updatedAtAgeMin,
      recoveryCode:     draft.recoveryCode ?? null,
    });

    // ── Step 7: Verify draft eligibility fields ────────────────────────────
    // Daily cap is keyed by customerId (global across restaurants): is there any
    // draft for this customer that already received a recovery within 24h?
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000);
    const recentRecovery = await prisma.orderDraft.findFirst({
      where:  { customerId, lastRecoveryAt: { gt: oneDayAgo } },
      select: { id: true, lastRecoveryAt: true },
    });
    const dailyCapHit = !!recentRecovery;

    const phoneDigits = (phone ?? "").replace(/\D/g, "");
    addPass("draft_eligible", "All eligibility fields confirmed present", {
      draftId,
      restaurantId,
      customerId,
      phoneMasked:      maskPhone(phone ?? ""),
      phoneValid:       /^\d{10,15}$/.test(phoneDigits),
      status:           draft.status,
      hasItems:         true,
      recoveryAttempts: draft.recoveryAttempts,
      lastRecoveryAt:   draft.lastRecoveryAt?.toISOString() ?? null,
      abandonedAt:      draft.abandonedAt?.toISOString() ?? null,
      dailyCapHit,
      dailyCapLastRecoveryAt: recentRecovery?.lastRecoveryAt?.toISOString() ?? null,
      shortRecoveryUrlWouldGenerate: `${getPublicSiteUrl()}/r/<code>`,
    });

    // ── Step 7b: Conversation + message source check ──────────────────────────
    // Shows all message sources in the customer's conversations so we can verify
    // WhatsApp, Cardápio, and AI messages are all landing in the same thread.
    {
      const convRows = await prisma.conversation.findMany({
        where: { restaurantId: restaurantId!, customerId: customerId! },
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true, channel: true, status: true,
          messages: {
            orderBy: { sentAt: "desc" },
            take: 10,
            select: { sentAt: true, content: true, senderType: true, metadata: true },
          },
        },
      });
      const canonicalConvId = convRows[0]?.id ?? null;
      const allMessages = convRows.flatMap((c) => c.messages);
      const hasWhatsApp   = allMessages.some((m) => m.senderType === "CUSTOMER");
      const hasCardapio   = allMessages.some((m) => m.senderType === "CUSTOMER_CARDAPIO");
      const hasAiCardapio = allMessages.some(
        (m) => m.senderType === "AI" && (m.metadata as Record<string, unknown> | null)?.source === "CARDAPIO",
      );
      const recent3 = [...allMessages]
        .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
        .slice(0, 3)
        .map((m) => ({
          senderType: m.senderType,
          source:     (m.metadata as Record<string, unknown> | null)?.source ?? null,
          sentAt:     m.sentAt.toISOString(),
          preview:    m.content.slice(0, 80),
        }));
      const latestCardapioMsg = allMessages
        .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
        .find((m) => m.senderType === "CUSTOMER_CARDAPIO");
      addPass("pedido_chat_check", latestCardapioMsg
        ? `Latest CUSTOMER_CARDAPIO message — sentAt: ${latestCardapioMsg.sentAt.toISOString()}`
        : hasWhatsApp
          ? "No Cardápio messages yet — WhatsApp messages present"
          : "No messages yet (expected if customer hasn't chatted)",
        {
          canonicalConversationId: canonicalConvId,
          totalConversations:       convRows.length,
          sourcesPresent:           { hasWhatsApp, hasCardapio, hasAiCardapio },
          conversationsWithCardapio: convRows.filter((c) =>
            c.messages.some((m) => m.senderType === "CUSTOMER_CARDAPIO"),
          ).length,
          latestCardapioMessageAt: latestCardapioMsg?.sentAt.toISOString() ?? null,
          recent3Messages:         recent3,
        },
      );
    }

    // ── Step 8: Backdate updatedAt + reset recovery fields ──────────────────
    // Prisma's @updatedAt overwrites on every update(), so we use $executeRaw
    // to set updatedAt to a past timestamp directly in the DB.
    // Column names in "order_drafts" are camelCase (confirmed in migrations).
    const backdateMs   = (inactivityMinutes + 5) * 60_000;
    const backdateTime = new Date(Date.now() - backdateMs);

    await prisma.$executeRaw`
      UPDATE "order_drafts"
      SET    "updatedAt"        = ${backdateTime},
             "recoveryAttempts" = 0,
             "lastRecoveryAt"   = NULL
      WHERE  id = ${draftId}
    `;

    addPass("draft_backdate", `updatedAt → ${backdateTime.toISOString()} (${inactivityMinutes + 5} min ago). recoveryAttempts=0, lastRecoveryAt=null.`, {
      draftId,
      backdatedTo:  backdateTime.toISOString(),
      minutesAgo:   inactivityMinutes + 5,
      inactivityThresholdMinutes: inactivityMinutes,
    });
  } else if (!rawPhone) {
    // already skipped above
  } else if (failedStep) {
    ["draft_create", "draft_eligible", "pedido_chat_check", "draft_backdate"].forEach((s) =>
      addSkip(s, `Skipped — earlier step failed: ${failedStep}`),
    );
  }

  // ── Step 9: dryRun sendCartRecoveryMessages ─────────────────────────────────
  if (restaurantId && !failedStep) {
    // Scope the dry-run to THIS restaurant by default so stale test drafts from
    // other restaurants (e.g. pizzaria-testando) never pollute the counts.
    // Pass ?includeOtherRestaurants=true to evaluate the global pool instead.
    dryRunResult = await OrderDraftRecoverySendService.sendCartRecoveryMessages({
      inactivityMinutes,
      limit:        50,
      dryRun:       true,
      ...(includeOtherRestaurants ? {} : { restaurantId }),
    });

    const { eligible, skippedRestaurantClosed, checked } = dryRunResult;

    if (eligible >= 1) {
      addPass(
        "dry_run_eligible",
        `${eligible} draft(s) eligible — would send ${eligible} message(s).`,
        { ...dryRunResult as unknown as Record<string, unknown> },
      );
    } else if (skippedRestaurantClosed > 0) {
      addWarn(
        "dry_run_eligible",
        `Restaurant CLOSED — ${skippedRestaurantClosed} draft(s) deferred (recoveryAttempts NOT incremented). ` +
        "Recovery will fire on next scheduler tick when restaurant reopens.",
        { ...(dryRunResult as unknown as Record<string, unknown>), skipReason: "restaurant_closed" },
      );
      if (verdict === "PASS") verdict = "PARTIAL";
    } else {
      const skipReason =
        dryRunResult.skippedNoPhone       > 0 ? "skipped_no_phone"
        : dryRunResult.skippedDailyLimit  > 0 ? "skipped_daily_limit"
        : dryRunResult.skippedOrderedAfter > 0 ? "skipped_ordered_after"
        : dryRunResult.skippedPendingPayment > 0 ? "skipped_pending_payment"
        : dryRunResult.skippedNoConfig    > 0 ? "skipped_no_whatsapp_config"
        : dryRunResult.skippedAlreadySent > 0 ? "skipped_already_sent"
        : checked === 0                        ? "no_eligible_drafts_in_db"
        : "unknown";
      addFail(
        "dry_run_eligible",
        `0 eligible (checked=${checked}). skipReason: ${skipReason}`,
        { ...(dryRunResult as unknown as Record<string, unknown>), skipReason },
      );
    }
  } else {
    addSkip("dry_run_eligible", failedStep
      ? `Skipped — earlier step failed: ${failedStep}`
      : "Skipped — restaurant not found");
  }

  // ── Step 10: liveTest send (test phone only) ────────────────────────────────
  if (liveTest) {
    const canSend =
      channelConfigured &&
      !!customerId &&
      !!phone &&
      !!draftId &&
      !failedStep &&
      !!dryRunResult &&
      dryRunResult.eligible >= 1 &&
      isOpen;

    if (canSend) {
      try {
        const toPhone   = phone!.replace(/\D/g, "");
        const shortUrl  = `${getPublicSiteUrl()}/r/${signRecoveryToken({
          draftId:      draftId!,
          customerId:   customerId!,
          restaurantId: restaurantId!,
        })}`;
        const firstName = customerName?.trim().split(/\s+/)[0] ?? "você";
        const message   =
          `Oi, ${firstName}! Percebi que seu pedido não foi finalizado 😊\n\n` +
          `Você precisa de alguma ajuda para concluir?\n\n` +
          `👉 Retomar pedido: ${shortUrl}`;

        const sendResult = await WhatsAppMessagingService.sendText({
          restaurantId: restaurantId!, to: toPhone, text: message,
        });

        if (!sendResult.ok) {
          // Recusa da Meta (inclusive BLOCKED por fora da janela de 24h) é FALHA
          // declarada — nunca um "passou" silencioso.
          const detail = sendResult.blockReason ?? sendResult.error ?? sendResult.errorCode ?? "envio recusado";
          liveTestResult = { accepted: false, detail };
          addFail("live_send", `Envio pela Meta recusado (${sendResult.status}): ${detail}`);
          console.error("[CartRecoveryQA] live send recusado", { restaurantId, draftId, status: sendResult.status, detail });
        } else {
          // Stamp draft — idempotent anti-spam guard (same as production path)
          const now = new Date();
          await prisma.orderDraft.update({
            where: { id: draftId! },
            data:  { recoveryAttempts: { increment: 1 }, lastRecoveryAt: now },
          });

          liveTestResult = {
            accepted:          true,
            detail:            "Mensagem aceita pela Meta Cloud API",
            externalMessageId: sendResult.providerMessageId ?? undefined,
          };
          addPass("live_send", `Meta aceitou — enviado para ****${toPhone.slice(-4)}. recoveryAttempts incrementado.`, {
            phoneMasked:       maskPhone(phone!),
            externalMessageId: sendResult.providerMessageId,
          });
          console.info("[CartRecoveryQA] live send accepted", {
            restaurantId,
            restaurantName,
            draftId,
            phoneMasked: maskPhone(phone!),
            externalMessageId: sendResult.providerMessageId,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        liveTestResult = { accepted: false, detail: msg };
        addFail("live_send", `Envio pela Meta falhou: ${msg}`);
        console.error("[CartRecoveryQA] live send failed", { restaurantId, draftId, error: msg });
      }
    } else {
      const skipReason =
        !channelConfigured           ? "sem config da Meta"
        : !customerId || !phone      ? "no phone/customer"
        : !draftId                   ? "no draft"
        : failedStep                 ? `earlier step failed: ${failedStep}`
        : !isOpen                    ? "restaurant_closed — recovery deferred until reopening"
        : dryRunResult?.eligible === 0 ? "0 eligible in dryRun"
        : "unknown";
      liveTestResult = { accepted: false, detail: `Skipped — ${skipReason}` };
      const stepFn = !isOpen ? addWarn : addSkip;
      stepFn("live_send", `Live send skipped — ${skipReason}`);
    }
  } else {
    addSkip("live_send", "liveTest=false — pass ?liveTest=true to send to test phone");
  }

  // ── Scheduler state (informational) ────────────────────────────────────────
  const wouldStart = process.env.NODE_ENV === "production" && process.env.NEXT_RUNTIME === "nodejs";
  const liveSchedulerState = CartRecoveryScheduler.getState();
  const schedulerState = {
    wouldStart,
    NODE_ENV:    process.env.NODE_ENV    ?? "(not set)",
    NEXT_RUNTIME: process.env.NEXT_RUNTIME ?? "(not set)",
    // Live in-memory snapshot from the running scheduler singleton (resets on restart).
    live: liveSchedulerState,
    note: liveSchedulerState.started
      ? `Scheduler RUNNING — ${liveSchedulerState.tickCount} tick(s) so far, last at ${liveSchedulerState.lastTickAt ?? "(none yet)"}.`
      : wouldStart
        ? "Scheduler would start in this environment but has not started yet in this process — check Railway logs for [CartRecoveryScheduler] Started."
        : "Scheduler DISABLED in this environment. GitHub Actions cron (every 5 min) is the active backup.",
  };

  // ── Final response ──────────────────────────────────────────────────────────
  const passed  = steps.filter((s) => s.status === "pass").length;
  const failed  = steps.filter((s) => s.status === "fail").length;
  const warned  = steps.filter((s) => s.status === "warn").length;
  const skipped = steps.filter((s) => s.status === "skip").length;

  console.info("[CartRecoveryQA] result", {
    slug,
    phoneMasked: phone ? maskPhone(phone) : null,
    mode:        liveTest ? "liveTest" : "dryRun",
    verdict,
    failedStep,
    passed, failed, warned, skipped,
    durationMs: Date.now() - startMs,
  });

  return NextResponse.json({
    ok:          !hasFailed,
    queriedAt:   new Date().toISOString(),
    durationMs:  Date.now() - startMs,
    slug,
    phoneMasked: phone ? maskPhone(phone) : null,
    mode:        liveTest ? "liveTest" : "dryRun",
    verdict,
    failedStep,
    failReason,
    summary:     { passed, failed, warned, skipped, total: steps.length },
    steps,
    dryRunResult,
    liveTestResult,
    schedulerState,
  });
}
