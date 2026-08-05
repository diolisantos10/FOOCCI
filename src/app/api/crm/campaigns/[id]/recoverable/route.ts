/**
 * GET /api/crm/campaigns/[id]/recoverable
 *
 * READ-ONLY diagnostics + reprocess PREVIEW for a campaign's failed recipients.
 * Sends NOTHING. It classifies every execution, returns the failure taxonomy,
 * and lists the recipients that "Reprocessar falhas recuperáveis" would target —
 * capped to the Evolution Web safe batch — so an operator can review before any
 * retry is wired to an action.
 *
 * Recoverable = provider failures that are transient (FAILED kind + RETRYABLE_LATER:
 * generic 5xx, timeout, unknown, and a dropped-session "instance disconnected" —
 * the live POST gate only sends those once the instance is reconnected). It NEVER
 * includes invalid phone (permanent), opt-out (never), validation HTTP 400 / auth
 * (need a fix first), or safety blocks (those auto-retry on the next cron cycle).
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, notFound, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { classifyExecution, summarizeExecutions } from "@/services/crm/crmExecutionClassification";
import { META_CLOUD_MAX_PER_RUN } from "@/services/crm/ScheduledCampaignRunnerService";
import { computeRecoverablePlan, REPROCESSABLE_CAMPAIGN_STATUSES } from "@/services/crm/recoverableReprocessPlan";
import { isWhatsAppChannelConnected } from "@/services/crm/crmWhatsAppChannel";
import { maskPhone } from "@/lib/wa-text-ordering-flag";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const campaign = await prisma.campaign.findUnique({
      where:  { id: params.id },
      select: {
        id: true, restaurantId: true, name: true, status: true,
        executions: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true, customerId: true, customerName: true, customerPhone: true,
            status: true, failedReason: true, errorMessage: true,
            sentAt: true, createdAt: true,
          },
        },
      },
    });

    if (!campaign || campaign.restaurantId !== ctx.restaurantId) {
      return notFound("Campaign not found");
    }

    const summary = summarizeExecutions(
      campaign.executions.map((e) => ({ status: e.status, failedReason: e.failedReason, errorMessage: e.errorMessage })),
    );

    // The exact pool a safe reprocess would attempt: transient provider failures.
    const recoverableRows = campaign.executions.filter((e) => {
      const c = classifyExecution({ status: e.status, failedReason: e.failedReason, errorMessage: e.errorMessage });
      return c.kind === "FAILED" && c.retryability === "RETRYABLE_LATER";
    });

    // Preview is capped to the Evolution Web safe batch — one reprocess run would
    // attempt at most this many.
    const preview = recoverableRows.slice(0, META_CLOUD_MAX_PER_RUN).map((e) => {
      const c = classifyExecution({ status: e.status, failedReason: e.failedReason, errorMessage: e.errorMessage });
      return {
        executionId:       e.id,
        customerName:      e.customerName ?? "",
        phoneMasked:       maskPhone(e.customerPhone ?? ""),
        category:          c.category,
        badge:             c.badge,
        retryability:      c.retryability,
        retryabilityLabel: c.retryabilityLabel,
        // Provider error detail is available but not raw-JSON by default.
        providerError:     e.failedReason ?? null,
        lastAttemptAt:     (e.sentAt ?? e.createdAt)?.toISOString() ?? null,
      };
    });

    // Deduped reprocess plan — the EXACT recipients a live reprocess would attempt.
    // Same pure function the POST recomputes from, so preview and send agree.
    const plan = computeRecoverablePlan(
      campaign.executions.map((e) => ({
        id: e.id, customerId: e.customerId, customerName: e.customerName,
        customerPhone: e.customerPhone, status: e.status,
        failedReason: e.failedReason, errorMessage: e.errorMessage,
      })),
      META_CLOUD_MAX_PER_RUN,
    );

    // Estado vivo da conexão (somente leitura) para a UI liberar ou não a ação.
    // Falha ao apurar conta como NÃO conectado: liberar o botão sem saber é
    // convidar o lojista a disparar contra um canal fora do ar.
    const channelConnected = await isWhatsAppChannelConnected(campaign.restaurantId);

    const campaignReprocessable = REPROCESSABLE_CAMPAIGN_STATUSES.has(campaign.status);
    const safeToSend = campaignReprocessable && channelConnected && plan.nextBatchCount > 0;

    return ok({
      campaignId:   campaign.id,
      campaignName: campaign.name,
      campaignStatus: campaign.status,
      safeSend: {
        provider:    "META_CLOUD",
        maxPerCycle: META_CLOUD_MAX_PER_RUN,
        note:        `Modo seguro: até ${META_CLOUD_MAX_PER_RUN} envios por ciclo.`,
      },
      // Deduped plan + live gate for the "Reprocessar N agora" action.
      plan: {
        recoverableExecutions: plan.recoverableExecutions,
        distinctRecipients:    plan.distinctRecipients,
        duplicatesRemoved:     plan.duplicatesRemoved,
        cap:                   plan.cap,
        nextBatchCount:        plan.nextBatchCount,
      },
      instance:   { connected: channelConnected },
      safeToSend,
      diagnostics: {
        sent:             summary.sent,
        skipped:          summary.skipped,
        blockedSafety:    summary.blockedSafety,
        failedProvider:   summary.failedProvider,
        recoverableLater: summary.recoverableLater,
        byRetryability:   summary.byRetryability,
        reasonGroups:     summary.reasonGroups,
      },
      recoverableTotal: recoverableRows.length,
      recoverablePreview: preview,
      recommendation: recoverableRows.length === 0
        ? "Nenhuma falha recuperável agora. Falhas que precisam de correção (telefone, 400, instância) ou opt-out não são reenviadas automaticamente."
        : `${recoverableRows.length} destinatário(s) com falha temporária podem ser reenviados depois — em lotes de até ${META_CLOUD_MAX_PER_RUN} por ciclo (modo seguro WhatsApp Web).`,
    });
  } catch (err) {
    console.error("[GET /api/crm/campaigns/[id]/recoverable]", err);
    return serverError();
  }
}
