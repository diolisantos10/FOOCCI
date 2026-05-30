/**
 * GET /api/admin/diagnostics/crm-campaigns
 *
 * Read-only diagnostic for CRM campaign scheduling.
 * Returns status, due/not-due reason, audience snapshot, and safety config
 * for every campaign that isn't permanently CANCELLED.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params:
 *   restaurantId — filter to one restaurant (optional)
 *   limit        — max campaigns returned (default: 50, max: 200)
 *
 * Safe:
 *   - Read-only. No mutations, no sends.
 *   - Never returns apiKey, webhookSecret, or DATABASE_URL.
 *
 * KNOWN INFRASTRUCTURE NOTE:
 *   GitHub Actions `on: schedule` cron only fires from the repository's
 *   DEFAULT branch. If crm-cron.yml is on a feature branch, scheduled runs
 *   never trigger. Only `workflow_dispatch` (manual) works from non-default
 *   branches. Check `cronBranchWarning` in this response for live status.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import {
  ScheduledCampaignRunnerService,
} from "@/services/crm/ScheduledCampaignRunnerService";
import { ScheduledCampaignScheduler } from "@/services/crm/ScheduledCampaignScheduler";
import { resolveAudience } from "@/services/crm/CrmCampaignService";
import { getSafetyConfig, checkQuietHours, checkWeekendBlock } from "@/lib/crm-safety";

// Branch that should be the GitHub Actions default for cron to fire
const CRON_BRANCH = process.env.GITHUB_REF_NAME ?? "(unknown — GITHUB_REF_NAME not set)";
const EXPECTED_DEFAULT = "main";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp           = req.nextUrl.searchParams;
  const restaurantId = sp.get("restaurantId") ?? undefined;
  const limit        = Math.min(Number(sp.get("limit") ?? "50"), 200);

  try {
    const campaigns = await prisma.campaign.findMany({
      where: {
        ...(restaurantId ? { restaurantId } : {}),
        status: { not: "CANCELLED" as never },
      },
      orderBy: { createdAt: "desc" },
      take:    limit,
      select: {
        id:             true,
        restaurantId:   true,
        name:           true,
        status:         true,
        targetSegment:  true,
        templateId:     true,
        scheduleConfig: true,
        totalSent:      true,
        createdAt:      true,
        updatedAt:      true,
      },
    });

    const now = new Date();

    // Find campaigns stuck in SENDING
    const stuckSending = await prisma.campaign.findMany({
      where: {
        ...(restaurantId ? { restaurantId } : {}),
        status:    "SENDING" as never,
        updatedAt: { lt: new Date(Date.now() - 30 * 60_000) },
      },
      select: { id: true, name: true, restaurantId: true, updatedAt: true },
    });

    const rows = await Promise.all(
      campaigns.map(async (c) => {
        const cfg = c.scheduleConfig as Record<string, unknown> | null;
        const isDue = ScheduledCampaignRunnerService.isCampaignDueNow(
          { ...c, scheduleConfig: c.scheduleConfig },
          now
        );
        const nextRunAt = ScheduledCampaignRunnerService.getNextRunAt(
          { ...c, scheduleConfig: c.scheduleConfig },
          now
        );

        // Compute not-due reason
        let notDueReason: string | null = null;
        if (!isDue) {
          if (!["ACTIVE", "SCHEDULED"].includes(c.status)) {
            notDueReason = `Campaign status is ${c.status}`;
          } else if (!cfg || cfg["mode"] !== "RECURRING") {
            notDueReason = "Not a RECURRING campaign";
          } else {
            const tz  = (cfg["timezone"] as string) || "America/Sao_Paulo";
            const tw  = cfg["timeWindow"] as { start: string; end: string } | undefined;
            const fmt = new Intl.DateTimeFormat("en-US", {
              timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
            });
            const parts = fmt.formatToParts(now);
            const get   = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
            const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
            const wd = wdMap[get("weekday")] ?? 0;
            const currentMins = parseInt(get("hour")) * 60 + parseInt(get("minute"));
            const weekdays    = cfg["weekdays"] as number[] | undefined;
            const startMins   = timeToMinutes(tw?.start ?? "00:00");
            const endMins     = timeToMinutes(tw?.end   ?? "23:59");
            const endCond     = cfg["endCondition"] as string | undefined;
            const endDate     = cfg["endDate"] as string | null | undefined;
            const maxTotal    = cfg["maxTotal"] as number | null | undefined;

            if (!weekdays?.includes(wd)) {
              notDueReason = `Today (weekday=${wd}) not in schedule [${weekdays?.join(",")}]`;
            } else if (currentMins < startMins) {
              notDueReason = `Before time window — ${tw?.start} not yet reached (now ${get("hour")}:${get("minute")} ${tz})`;
            } else if (currentMins >= endMins) {
              notDueReason = `After time window — past ${tw?.end} (now ${get("hour")}:${get("minute")} ${tz})`;
            } else if (endCond === "END_DATE" && endDate && now > new Date(endDate + "T23:59:59Z")) {
              notDueReason = `End date ${endDate} passed`;
            } else if (endCond === "MAX_TOTAL" && maxTotal != null && (c.totalSent ?? 0) >= maxTotal) {
              notDueReason = `Max total reached (${c.totalSent}/${maxTotal})`;
            } else {
              notDueReason = "Unknown — passes all checks but isCampaignDueNow returned false";
            }
          }
        }

        // Audience snapshot (best-effort — errors produce null)
        let audienceTotal: number | null = null;
        let audienceNew:   number | null = null;
        let audienceError: string | null = null;
        try {
          const all = await resolveAudience(c.restaurantId, c.targetSegment ?? "", c.templateId ?? undefined);
          audienceTotal = all.length;

          const sentIds = new Set(
            (await prisma.campaignExecution.findMany({
              where:  { campaignId: c.id, status: { in: ["SENT", "DELIVERED", "READ"] } },
              select: { customerId: true },
            })).map((e) => e.customerId)
          );
          audienceNew = all.filter((cu) => !sentIds.has(cu.id)).length;
        } catch (err: unknown) {
          audienceError = err instanceof Error ? err.message : String(err);
        }

        // Safety snapshot
        let safetyBlocks: string[] = [];
        let safetyError:  string | null = null;
        try {
          const safety = await getSafetyConfig(c.restaurantId);
          const qr = checkQuietHours(safety);
          if (qr) safetyBlocks.push(qr);
          const wr = checkWeekendBlock(safety);
          if (wr) safetyBlocks.push(wr);
        } catch (err: unknown) {
          safetyError = err instanceof Error ? err.message : String(err);
        }

        let lastExecutionAt: string | null = null;
        try {
          const lastExec = await prisma.campaignExecution.findFirst({
            where:   { campaignId: c.id },
            orderBy: { sentAt: "desc" },
            select:  { sentAt: true },
          });
          lastExecutionAt = lastExec?.sentAt?.toISOString() ?? null;
        } catch { /* ignore */ }

        return {
          id:            c.id,
          name:          c.name,
          restaurantId:  c.restaurantId,
          status:        c.status,
          targetSegment: c.targetSegment,
          templateId:    c.templateId,
          totalSent:     c.totalSent,
          createdAt:     c.createdAt,
          updatedAt:     c.updatedAt,
          scheduleConfig: cfg
            ? {
                mode:         cfg["mode"],
                weekdays:     cfg["weekdays"],
                timeWindow:   cfg["timeWindow"],
                dailyLimit:   cfg["dailyLimit"],
                endCondition: (cfg["endCondition"] as string | undefined) ?? null,
                timezone:     (cfg["timezone"] as string | undefined) ?? null,
              }
            : null,
          isDueNow:    isDue,
          notDueReason,
          nextRunAt:   nextRunAt?.toISOString() ?? null,
          lastExecutionAt,
          audience: {
            total:      audienceTotal,
            newEligible: audienceNew,
            error:       audienceError,
          },
          safetyBlocks,
          safetyError,
        };
      })
    );

    // Infrastructure warning: scheduled GitHub Actions cron only runs from default branch
    const cronBranchWarning =
      CRON_BRANCH !== EXPECTED_DEFAULT
        ? `WARNING: GitHub Actions 'on: schedule' only fires from the default branch ('${EXPECTED_DEFAULT}'). ` +
          `This deployment is on branch '${CRON_BRANCH}'. ` +
          `Scheduled campaign cron triggers will NOT fire automatically unless crm-cron.yml is merged to '${EXPECTED_DEFAULT}'.`
        : null;

    // In-process scheduler (ScheduledCampaignScheduler) status. This runs the
    // due campaigns automatically every 10 min from within the Node process,
    // independent of GitHub Actions cron.
    const lastRun = ScheduledCampaignScheduler.getLastRun();
    const scheduler = {
      active:            ScheduledCampaignScheduler.isActive(),
      productionOnly:    true,
      tickIntervalMin:   10,
      note:              ScheduledCampaignScheduler.isActive()
        ? "In-process scheduler is running. Scheduled campaigns execute automatically — GitHub Actions cron is only a warm backup."
        : "In-process scheduler is NOT active in this process (expected only in NODE_ENV=production). It starts on server boot via instrumentation.ts.",
      lastRun:           lastRun ? {
        at:                    lastRun.at,
        mode:                  lastRun.mode,
        dueCampaignCount:      lastRun.dueCampaignCount,
        sent:                  lastRun.sent,
        failed:                lastRun.failed,
        skipped:               lastRun.skipped,
        stuckSendingRecovered: lastRun.stuckSendingRecovered,
        errors:                lastRun.errors,
        durationMs:            lastRun.durationMs,
      } : null,
    };

    return NextResponse.json({
      generatedAt:       now.toISOString(),
      totalCampaigns:    rows.length,
      dueCampaigns:      rows.filter((r) => r.isDueNow).length,
      activeCampaigns:   rows.filter((r) => r.status === "ACTIVE").length,
      completedCampaigns: rows.filter((r) => r.status === "COMPLETED").length,
      scheduler,
      cronBranchWarning,
      stuckSendingCount:   stuckSending.length,
      stuckSendingCampaigns: stuckSending.map((c) => ({
        id:          c.id,
        name:        c.name,
        restaurantId: c.restaurantId,
        stuckSince:  c.updatedAt.toISOString(),
        recoverHint: `PATCH /api/crm/campaigns/${c.id} { "action": "reactivate" }`,
      })),
      campaigns:         rows,
    });
  } catch (err: unknown) {
    console.error("[diag/crm-campaigns] error:", err);
    return NextResponse.json(
      { error: "Internal error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

function timeToMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
