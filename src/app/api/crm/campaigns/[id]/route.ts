/**
 * GET    /api/crm/campaigns/[id]  — campaign detail with recipients
 * PATCH  /api/crm/campaigns/[id]  — update draft (message, segment, schedule)
 * DELETE /api/crm/campaigns/[id]  — delete DRAFT or CANCELLED campaign
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, notFound, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { classifyExecution, summarizeExecutions, buildEligibilityMetrics } from "@/services/crm/crmExecutionClassification";
import { META_CLOUD_MAX_PER_RUN, ScheduledCampaignRunnerService } from "@/services/crm/ScheduledCampaignRunnerService";
import { parseMessagePool } from "@/services/crm/crmMessagePool";
import { provisionPoolTemplates } from "@/services/whatsapp/MetaTemplateProvisionService";

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const campaign = await prisma.campaign.findUnique({
      where:  { id: params.id },
      select: {
        id:            true,
        restaurantId:  true,
        name:          true,
        objective:     true,
        channel:       true,
        targetSegment: true,
        templateId:    true,
        status:        true,
        message:       true,
        scheduledAt:   true,
        scheduleConfig: true,
        audienceConfig: true,
        totalAudience:  true,
        totalRead:      true,
        totalSent:      true,
        totalFailed:    true,
        totalResponded: true,
        totalConverted: true,
        totalRevenue:   true,
        createdAt:      true,
        sentAt:         true,
        lastRunAt:      true,
        executions: {
          orderBy: { createdAt: "asc" },
          select: {
            id:               true,
            customerId:       true,
            customerName:     true,
            customerPhone:    true,
            messageText:      true,
            status:           true,
            sentAt:           true,
            createdAt:        true,
            failedReason:     true,
            errorMessage:     true,
            converted:        true,
            convertedAt:      true,
            revenue:          true,
            convertedOrderId: true,
          },
        },
      },
    });

    if (!campaign || campaign.restaurantId !== ctx.restaurantId) {
      return notFound("Campaign not found");
    }

    // Classify each execution (SENT / FAILED_PROVIDER / BLOCKED_*) so the UI shows
    // the right badge and a clean Performance split (blocked ≠ failed).
    const executions = campaign.executions.map((e) => ({
      ...e,
      classification: classifyExecution({ status: e.status, failedReason: e.failedReason, errorMessage: e.errorMessage }),
    }));
    const performance = summarizeExecutions(
      campaign.executions.map((e) => ({ status: e.status, failedReason: e.failedReason, errorMessage: e.errorMessage })),
    );
    const responded = campaign.totalResponded;
    const converted = campaign.totalConverted;
    const conversionRate = performance.sent > 0 ? Math.round((converted / performance.sent) * 100) : 0;

    // Read-only global budget snapshot (no send): how this campaign shares the
    // restaurant's daily WhatsApp budget and what it gets in the next cycle.
    const budget = await ScheduledCampaignRunnerService
      .getBudgetSnapshot(ctx.restaurantId, campaign.id)
      .catch(() => null);

    // For recurring campaigns, also expose current-cycle metrics (executions since lastRunAt).
    const isRecurring = (campaign.scheduleConfig as { mode?: string } | null)?.mode === "RECURRING";
    let currentCyclePerformance = null;
    if (isRecurring && campaign.lastRunAt) {
      const cycleStart = new Date(campaign.lastRunAt);
      const cycleExecs = campaign.executions.filter((e) => new Date(e.createdAt) >= cycleStart);
      currentCyclePerformance = summarizeExecutions(
        cycleExecs.map((e) => ({ status: e.status, failedReason: e.failedReason, errorMessage: e.errorMessage })),
      );
    }

    return ok({
      ...campaign,
      executions,
      performance: {
        audience:       campaign.totalAudience,
        sent:           performance.sent,
        blockedSafety:  performance.blockedSafety,
        failedProvider: performance.failedProvider,
        skipped:        performance.skipped,
        recoverableLater: performance.recoverableLater,
        byRetryability: performance.byRetryability,
        read:           campaign.totalRead,
        responded,
        converted,
        conversionRate,
        reasonGroups:   performance.reasonGroups,
      },
      currentCyclePerformance: currentCyclePerformance ? {
        sent:           currentCyclePerformance.sent,
        blockedSafety:  currentCyclePerformance.blockedSafety,
        failedProvider: currentCyclePerformance.failedProvider,
        skipped:        currentCyclePerformance.skipped,
        recoverableLater: currentCyclePerformance.recoverableLater,
        byRetryability: currentCyclePerformance.byRetryability,
        reasonGroups:   currentCyclePerformance.reasonGroups,
      } : null,
      lastRunAt: campaign.lastRunAt,
      // Eligibility funnel — separates ineligible skips (no phone / invalid / opt-out /
      // not contactable) from real provider failures so "sem telefone" is never a "falha".
      eligibility: buildEligibilityMetrics(performance, campaign.totalAudience),
      // Evolution Web safe-send cap surfaced for the UI (recurring campaigns run in batches).
      safeSend: {
        provider:    "META_CLOUD",
        maxPerCycle: META_CLOUD_MAX_PER_RUN,
        note:        `Modo seguro: até ${META_CLOUD_MAX_PER_RUN} envios por ciclo.`,
      },
      // Global WhatsApp budget snapshot (read-only): daily used/limit, this
      // campaign's quota vs sent today, and its next-cycle allocation + reason.
      budget,
    });
  } catch (err) {
    console.error("[GET /api/crm/campaigns/[id]]", err);
    return serverError();
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const campaign = await prisma.campaign.findUnique({
      where:  { id: params.id },
      select: { id: true, restaurantId: true, status: true, scheduleConfig: true },
    });

    if (!campaign || campaign.restaurantId !== ctx.restaurantId) {
      return notFound("Campaign not found");
    }

    const body = await req.json() as {
      action?:          "pause" | "resume" | "cancel" | "reactivate" | "clear-metrics";
      name?:            string;
      message?:         string;
      targetSegment?:   string;
      scheduledAt?:     string | null;
      sendWindowStart?: string | null;
      sendWindowEnd?:   string | null;
      scheduleConfig?:  Record<string, unknown> | null;
    };

    // ── lifecycle actions (pause / resume / cancel / reactivate / clear-metrics) ──
    if (body.action) {
      const currentStatus = campaign.status as string;

      // clear-metrics: zero THIS campaign's counters and delete its failed/blocked
      // log rows (keep successful sends for dedup). Lets the owner wipe the old
      // failure numbers straight from the campaign screen, without touching others.
      if (body.action === "clear-metrics") {
        await prisma.campaign.update({
          where: { id: params.id },
          data:  { totalSent: 0, totalFailed: 0, totalRead: 0, totalResponded: 0, totalConverted: 0, totalRevenue: 0 },
        });
        await prisma.campaignExecution.deleteMany({
          where: { campaignId: params.id, status: { notIn: ["SENT", "DELIVERED", "READ"] as never[] } },
        }).catch(() => {});
        return ok({ id: params.id, status: currentStatus });
      }

      // reactivate: restore a COMPLETED recurring campaign back to ACTIVE.
      // Needed to recover campaigns stuck COMPLETED by the premature-exhaustion bug.
      if (body.action === "reactivate") {
        if (currentStatus === "SENDING") {
          // Recover one-shot campaign stuck in SENDING (server crashed mid-send).
          // Reset to SCHEDULED so it can be re-sent from the UI.
          const updated = await prisma.campaign.update({
            where: { id: params.id },
            data:  { status: "SCHEDULED" as never },
            select: { id: true, status: true },
          });
          return ok(updated);
        }

        if (currentStatus !== "COMPLETED") {
          return badRequest("Apenas campanhas COMPLETED ou SENDING podem ser reativadas");
        }
        const cfg = campaign.scheduleConfig as { mode?: string } | null;
        if (!cfg || cfg.mode !== "RECURRING") {
          return badRequest("Apenas campanhas recorrentes podem ser reativadas");
        }
        const updated = await prisma.campaign.update({
          where: { id: params.id },
          data:  { status: "ACTIVE" as never },
          select: { id: true, status: true },
        });
        return ok(updated);
      }

      const TERMINAL = ["SENT", "COMPLETED", "CANCELLED"];
      if (TERMINAL.includes(currentStatus)) {
        return badRequest("Campanha já finalizada — não pode ser modificada");
      }

      let newStatus: string;
      let resetStats = false;
      if (body.action === "pause") {
        if (!["ACTIVE", "SCHEDULED"].includes(currentStatus)) {
          return badRequest("Apenas campanhas ativas ou agendadas podem ser pausadas");
        }
        newStatus = "PAUSED";
      } else if (body.action === "resume") {
        if (currentStatus !== "PAUSED") {
          return badRequest("Apenas campanhas pausadas podem ser retomadas");
        }
        newStatus = "ACTIVE";
        // Resuming a campaign that was paused starts a fresh run — the dashboard
        // must show only what happens from now on, not stats from before the pause.
        resetStats = true;
      } else {
        // cancel
        newStatus = "CANCELLED";
      }

      const updated = await prisma.campaign.update({
        where: { id: params.id },
        data:  {
          status: newStatus as never,
          ...(resetStats ? {
            totalSent: 0, totalFailed: 0, totalRead: 0,
            totalResponded: 0, totalConverted: 0, totalRevenue: 0,
            lastRunAt: null,
          } : {}),
        },
        select: { id: true, status: true },
      });
      if (resetStats) {
        // The panel recomputes "Falhas" live from execution rows — delete the old
        // failed/blocked rows too (keep successful sends so send-dedup stays intact).
        await prisma.campaignExecution.deleteMany({
          where: { campaignId: params.id, status: { notIn: ["SENT", "DELIVERED", "READ"] as never[] } },
        }).catch(() => {});
      }
      return ok(updated);
    }

    // ── edit campaign fields ──────────────────────────────────────
    // name/message/scheduleConfig: allowed for any non-terminal status.
    // targetSegment/scheduledAt: only for DRAFT or SCHEDULED (changing
    // audience on a live campaign risks duplicate sends).
    const TERMINAL = ["SENT", "COMPLETED", "CANCELLED"];
    if (TERMINAL.includes(campaign.status)) {
      return badRequest("Campanha finalizada — não pode ser editada");
    }

    const isDraftOrScheduled = ["DRAFT", "SCHEDULED"].includes(campaign.status);
    const updateData: Record<string, unknown> = {};

    if (body.name?.trim())    updateData.name    = body.name.trim();
    if (body.message?.trim()) updateData.message = body.message.trim();

    // Merge only safe schedule subfields; preserve mode/endCondition/etc.
    if (body.scheduleConfig !== undefined && body.scheduleConfig !== null) {
      const existing = (campaign.scheduleConfig as Record<string, unknown> | null) ?? {};
      const patch    = body.scheduleConfig;
      // messagePool goes through the canonical sanitizer (drops malformed rows,
      // caps custom phrases at MAX_CUSTOM_PHRASES); phrase texts are length-capped.
      let poolPatch: Record<string, unknown> = {};
      if (patch.messagePool !== undefined) {
        const parsed = parseMessagePool({ messagePool: patch.messagePool });
        poolPatch = {
          messagePool: parsed
            ? { ...parsed, custom: parsed.custom?.map((c) => ({ ...c, text: c.text.slice(0, 1000) })) }
            : null,
        };
      }
      updateData.scheduleConfig = {
        ...existing,
        ...(patch.weekdays    !== undefined ? { weekdays:    patch.weekdays    } : {}),
        ...(patch.timeWindow  !== undefined ? { timeWindow:  patch.timeWindow  } : {}),
        ...(patch.dailyLimit  !== undefined ? { dailyLimit:  patch.dailyLimit  } : {}),
        ...(patch.coupon      !== undefined ? { coupon:      patch.coupon      } : {}),
        ...(patch.triggerDays !== undefined ? { triggerDays: patch.triggerDays } : {}),
        // Per-tier rewards (Subiu de nível / Mimo mensal): only the 3 ladder keys.
        ...(patch.tierCoupons !== undefined ? {
          tierCoupons: patch.tierCoupons && typeof patch.tierCoupons === "object"
            ? Object.fromEntries(Object.entries(patch.tierCoupons as Record<string, unknown>)
                .filter(([k]) => ["PRATA", "OURO", "DIAMANTE"].includes(k)))
            : null,
        } : {}),
        ...poolPatch,
      };
    }

    // Audience may also change while PAUSED (nothing is sending) — needed by the
    // unified modal's Público selector for custom campaigns born paused.
    if (isDraftOrScheduled || campaign.status === "PAUSED") {
      if (body.targetSegment?.trim()) updateData.targetSegment = body.targetSegment.trim();
    }
    if (isDraftOrScheduled) {
      if (body.scheduledAt !== undefined) {
        updateData.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
        updateData.status      = body.scheduledAt ? "SCHEDULED" : "DRAFT";
      }
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest("Nenhum campo válido fornecido para atualização");
    }

    const updated = await prisma.campaign.update({
      where:  { id: params.id },
      data:   updateData as never,
      select: { id: true, status: true, scheduledAt: true, name: true, message: true, scheduleConfig: true },
    });

    // Pool changed + Meta CRM on → auto-submit templates for any newly selected
    // phrase, so approval is the system's job, not the owner's. Cheap no-op when
    // every active phrase is already mapped; failures never break the save.
    if (body.scheduleConfig && body.scheduleConfig.messagePool !== undefined) {
      const metaCfg = await prisma.metaWhatsAppConfig.findUnique({
        where:  { restaurantId: ctx.restaurantId },
        select: { metaCrmEnabled: true, connectionStatus: true },
      }).catch(() => null);
      if (metaCfg?.metaCrmEnabled && metaCfg.connectionStatus === "CONNECTED") {
        await provisionPoolTemplates(ctx.restaurantId, params.id)
          .then((r) => { if (r.created > 0) console.info(`[CRM] auto-submitted ${r.created} pool template(s) for campaign ${params.id}`); })
          .catch((e) => console.warn("[CRM] pool template auto-submit failed", e));
      }
    }

    return ok(updated);
  } catch (err) {
    console.error("[PATCH /api/crm/campaigns/[id]]", err);
    return serverError();
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const campaign = await prisma.campaign.findUnique({
      where:  { id: params.id },
      select: { id: true, restaurantId: true, status: true },
    });

    if (!campaign || campaign.restaurantId !== ctx.restaurantId) {
      return notFound("Campaign not found");
    }

    if (!["DRAFT", "CANCELLED"].includes(campaign.status)) {
      return badRequest("Apenas rascunhos ou cancelados podem ser excluídos. Histórico de envios é mantido.");
    }

    await prisma.campaign.delete({ where: { id: params.id } });

    return ok({ deleted: true });
  } catch (err) {
    console.error("[DELETE /api/crm/campaigns/[id]]", err);
    return serverError();
  }
}
