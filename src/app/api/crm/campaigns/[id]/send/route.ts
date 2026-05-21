/**
 * POST /api/crm/campaigns/[id]/send
 *
 * Execute sending for an approved campaign.
 * Accepts optional message overrides (user may have edited messages in the review UI).
 * NEVER called automatically — requires explicit user action.
 *
 * Safety gates applied before sending:
 *   1. Quiet hours — blocked if current time is inside the configured quiet window.
 *   2. Weekend block — blocked if today is Sat/Sun and sendOnWeekends=false.
 *   3. Daily global cap — batch capped to remaining capacity; 0 remaining = blocked.
 *   4. Batch limit — at most dailyGlobalCap remaining executions processed per call.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { CrmCampaignService } from "@/services/crm/CrmCampaignService";
import {
  getSafetyConfig,
  checkQuietHours,
  checkWeekendBlock,
  getTodayGlobalSendCount,
} from "@/lib/crm-safety";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const body = await req.json() as {
      messages?: Array<{ recipientId: string; messageText: string }>;
    };

    if (!params.id) return badRequest("Campaign ID é obrigatório");

    // ── Safety pre-checks ────────────────────────────────────────────────────────
    const safety = await getSafetyConfig(ctx.restaurantId);

    const quietBlock = checkQuietHours(safety);
    if (quietBlock) {
      return ok(
        { blocked: true, code: "QUIET_HOURS", reason: quietBlock },
        422
      );
    }

    const weekendBlock = checkWeekendBlock(safety);
    if (weekendBlock) {
      return ok(
        { blocked: true, code: "WEEKEND_BLOCK", reason: weekendBlock },
        422
      );
    }

    // Daily global cap check
    let batchLimit: number | undefined;
    if (safety.dailyGlobalCap > 0) {
      const todaySent = await getTodayGlobalSendCount(ctx.restaurantId);
      const remaining = Math.max(0, safety.dailyGlobalCap - todaySent);
      if (remaining === 0) {
        return ok(
          {
            blocked: true,
            code: "DAILY_CAP",
            reason: `Limite diário de ${safety.dailyGlobalCap} mensagens atingido. Tente novamente amanhã.`,
          },
          422
        );
      }
      batchLimit = remaining;
    }

    // ── Send ────────────────────────────────────────────────────────────────────
    const result = await CrmCampaignService.send(
      params.id,
      ctx.restaurantId,
      {
        messages: body.messages ?? [],
        limit:    batchLimit,
      }
    );

    // Surface a warning to the UI if we capped the batch
    const capped =
      batchLimit != null &&
      result.totalSent + result.totalFailed < (body.messages?.length ?? 0);

    return ok({
      ...result,
      ...(capped
        ? {
            cappedAt: batchLimit,
            warning: `Para segurança do WhatsApp, este envio foi limitado a ${batchLimit} contato${batchLimit !== 1 ? "s" : ""} (cap diário restante). Envie o próximo lote em alguns minutos.`,
          }
        : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/crm/campaigns/[id]/send]", err);
    if (msg.includes("not found")) return ok({ error: "not_found" }, 404);
    if (msg.includes("already sent") || msg.includes("sending")) {
      return badRequest("Campanha já foi enviada ou está sendo enviada");
    }
    if (msg.includes("WhatsApp not configured")) {
      return ok({ error: "whatsapp_not_configured", message: msg }, 422);
    }
    return serverError();
  }
}
