/**
 * CRMCampaignArchiveService — safely takes a campaign OUT of operation by setting
 * its status to CANCELLED. It never deletes the row (history + ledger memory are
 * preserved) and NEVER sets a sending/active status, so it can never start a send.
 *
 * Idempotent: a campaign already CANCELLED is a no-op. Defaults to DRY-RUN.
 */

import { prisma } from "@/lib/prisma";

// Only safe, out-of-operation targets are allowed — never ACTIVE/SCHEDULED/SENDING.
const SAFE_TARGETS = new Set(["CANCELLED"]);

export interface ArchiveCampaignOptions {
  dryRun?: boolean;
  campaignId: string;
  toStatus?: string; // defaults to CANCELLED
}

export interface ArchiveCampaignResult {
  ok: boolean;
  dryRun: boolean;
  campaignId: string;
  found: boolean;
  name: string | null;
  previousStatus: string | null;
  targetStatus: string;
  changed: boolean;
  alreadyArchived: boolean;
  note: string;
}

export async function archiveCampaign(options: ArchiveCampaignOptions): Promise<ArchiveCampaignResult> {
  const dryRun = options.dryRun !== false; // default DRY-RUN
  const campaignId = options.campaignId;
  const targetStatus = (options.toStatus ?? "CANCELLED").toUpperCase();

  const base = { ok: true, dryRun, campaignId, targetStatus } as const;

  if (!campaignId) {
    return { ...base, found: false, name: null, previousStatus: null, changed: false, alreadyArchived: false,
      ok: false, note: "campaignId é obrigatório — nada feito." };
  }
  if (!SAFE_TARGETS.has(targetStatus)) {
    return { ...base, found: false, name: null, previousStatus: null, changed: false, alreadyArchived: false,
      ok: false, note: `Status alvo '${targetStatus}' não permitido — apenas ${[...SAFE_TARGETS].join(", ")}.` };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, status: true },
  });
  if (!campaign) {
    return { ...base, found: false, name: null, previousStatus: null, changed: false, alreadyArchived: false,
      note: "Campanha não encontrada." };
  }

  const previousStatus = String(campaign.status);
  if (previousStatus === targetStatus) {
    return { ...base, found: true, name: campaign.name, previousStatus, changed: false, alreadyArchived: true,
      note: `Campanha já está ${targetStatus} — nada a fazer.` };
  }

  if (dryRun) {
    return { ...base, found: true, name: campaign.name, previousStatus, changed: false, alreadyArchived: false,
      note: `Mudaria ${previousStatus} → ${targetStatus} (dry-run, nada alterado).` };
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: targetStatus as never } });

  return { ...base, found: true, name: campaign.name, previousStatus, changed: true, alreadyArchived: false,
    note: `Campanha encerrada: ${previousStatus} → ${targetStatus}. Histórico e memória do ledger preservados.` };
}
