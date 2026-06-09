/**
 * CRMColdCampaignPrepareService — idempotently prepares the NEW cold-recovery
 * campaign (PAUSED, never sends) and runs its preflight, so the whole flow can be
 * driven from a cron-safe endpoint (CRON_SECRET) without an admin secret.
 *
 * Idempotent: if a PAUSED campaign with the same concept key already exists for the
 * restaurant, it is REUSED instead of creating a duplicate. Never sends, never
 * activates a campaign.
 */

import { prisma } from "@/lib/prisma";
import { restartColdCampaign, RestartColdInput } from "./CRMColdCampaignRestartService";
import { buildPreflightForCampaign, PreflightDiagnosis } from "./CRMPreflightDiagnosisService";

export interface PrepareColdOptions extends RestartColdInput {
  dryRun?: boolean;
}

export interface PrepareColdResult {
  ok: boolean;
  dryRun: boolean;
  created: boolean;
  reused: boolean;
  campaignId: string | null;
  status: string | null;
  campaignFamilyKey: string;
  messageFingerprint: string | null;
  preflight: PreflightDiagnosis | null;
  note: string;
}

export async function prepareNewColdCampaign(options: PrepareColdOptions): Promise<PrepareColdResult> {
  const dryRun = options.dryRun !== false; // default DRY-RUN (no create)
  const campaignFamilyKey = options.campaignFamilyKey?.trim() || "reativacao-frios";
  const name = options.name?.trim() || "Recuperar clientes frios";

  // Idempotency: reuse an existing PAUSED campaign for this concept instead of
  // creating duplicates on repeated dispatch.
  const existing = await prisma.campaign.findFirst({
    where: { restaurantId: options.restaurantId, campaignFamilyKey, status: "PAUSED" as never },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, messageFingerprint: true },
  });

  if (dryRun) {
    const preflight = existing ? await buildPreflightForCampaign(existing.id).catch(() => null) : null;
    return {
      ok: true,
      dryRun: true,
      created: false,
      reused: !!existing,
      campaignId: existing?.id ?? null,
      status: existing?.status ?? null,
      campaignFamilyKey,
      messageFingerprint: existing?.messageFingerprint ?? null,
      preflight,
      note: existing
        ? "Já existe uma campanha PAUSED deste conceito — preflight calculado sobre ela. (dry-run, nada criado)"
        : "Nenhuma campanha PAUSED deste conceito ainda. Rode com dryRun=false para criar (PAUSED, não envia).",
    };
  }

  if (existing) {
    const preflight = await buildPreflightForCampaign(existing.id).catch(() => null);
    return {
      ok: true, dryRun: false, created: false, reused: true,
      campaignId: existing.id, status: existing.status, campaignFamilyKey,
      messageFingerprint: existing.messageFingerprint ?? null, preflight,
      note: "Campanha PAUSED deste conceito já existia — reutilizada (nenhuma duplicada criada).",
    };
  }

  const created = await restartColdCampaign({
    restaurantId: options.restaurantId,
    name,
    campaignFamilyKey,
    sourceCampaignId: options.sourceCampaignId,
    reuseMessage: options.reuseMessage,
    message: options.message,
    dedupeWindowDays: options.dedupeWindowDays,
  });
  const preflight = await buildPreflightForCampaign(created.campaignId).catch(() => null);

  return {
    ok: true, dryRun: false, created: true, reused: false,
    campaignId: created.campaignId, status: created.status, campaignFamilyKey,
    messageFingerprint: created.messageFingerprint, preflight,
    note: created.note,
  };
}
