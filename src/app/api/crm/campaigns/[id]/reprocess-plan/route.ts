/**
 * GET /api/crm/campaigns/[id]/reprocess-plan
 *
 * READ-ONLY preview of a safe recoverable-failure reprocess. Sends NOTHING and
 * mutates NOTHING. Returns the recoverable pool, the deduped next batch (capped
 * to 5 for Evolution Web), and an instance-health gate — so the UI can show a
 * confirmation before any (future) live reprocess is wired.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, notFound, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { buildReprocessPlan } from "@/services/crm/crmReprocessPlanner";
import { META_CLOUD_MAX_PER_RUN } from "@/services/crm/ScheduledCampaignRunnerService";
import { isWhatsAppChannelConnected } from "@/services/crm/crmWhatsAppChannel";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const campaign = await prisma.campaign.findUnique({
      where:  { id: params.id },
      select: {
        id: true, restaurantId: true, name: true,
        executions: {
          select: { id: true, customerId: true, customerName: true, customerPhone: true, status: true, failedReason: true, errorMessage: true, sentAt: true, createdAt: true },
        },
      },
    });
    if (!campaign || campaign.restaurantId !== ctx.restaurantId) return notFound("Campaign not found");

    // Portão de saúde do canal (somente leitura). Nenhum segredo exposto.
    // Falha ao apurar conta como NÃO conectado — ausência de informação não é
    // informação, e liberar o reprocessamento no escuro dispara contra um canal
    // possivelmente fora do ar.
    const connected = await isWhatsAppChannelConnected(ctx.restaurantId);

    const plan = buildReprocessPlan(campaign.executions, { batchLimit: META_CLOUD_MAX_PER_RUN });
    const nextBatchSize = Math.min(plan.nextBatch.length, META_CLOUD_MAX_PER_RUN);

    // Instance must be connected to safely reprocess.
    const safeToSend = connected && plan.eligibleToReprocess > 0;
    const message = !connected
      ? "Instância WhatsApp desconectada. Reconecte antes de reprocessar."
      : plan.eligibleToReprocess === 0
        ? "Nenhuma falha recuperável para reprocessar agora."
        : `Pronto para reprocessar ${nextBatchSize} contato${nextBatchSize !== 1 ? "s" : ""} no próximo lote.`;

    return ok({
      campaignId:   campaign.id,
      campaignName: campaign.name,
      instance:     { connected },
      recoverableExecutions: plan.recoverableExecutions,
      distinctRecipients:    plan.distinctRecipients,
      duplicatesRemoved:     plan.duplicatesRemoved,
      alreadySentExcluded:   plan.alreadySentExcluded,
      eligibleToReprocess:   plan.eligibleToReprocess,
      batchLimit:            plan.batchLimit,
      nextBatch: plan.nextBatch.map((b) => ({
        customerId:   b.customerId,
        customerName: b.customerName,
        maskedPhone:  b.maskedPhone,
        reason:       b.reason,
        retryability: b.retryability,
      })),
      safeToSend,
      message,
    });
  } catch (err) {
    console.error("[GET /api/crm/campaigns/[id]/reprocess-plan]", err);
    return serverError();
  }
}
