/**
 * CRMContactLedgerCleanupService — surgically rolls back an over-broad backfill.
 *
 * The global backfill (no campaignId) inserted one CRMContactLedger row for EVERY
 * CampaignExecution SENT across ALL campaigns — not only the cold-recovery one.
 * Those rows are all tagged `metadata.backfill = true`. This service:
 *
 *   • REMOVES backfill rows that do NOT belong to the campaign we want to keep
 *     (e.g. everything except the old cold campaign's real SENTs);
 *   • optionally RELABELS the kept rows to the canonical concept key
 *     (e.g. "reativacao-frios") so the new campaign dedupes by concept correctly.
 *
 * Safe: defaults to DRY-RUN (counts only, writes nothing). Touches ONLY rows with
 * metadata.backfill = true — never hand-written or runtime ledger rows. Never
 * sends, never mutates a campaign, never touches CampaignExecution history.
 */

import { prisma } from "@/lib/prisma";

const BACKFILL_FILTER = { path: ["backfill"], equals: true } as const;

export interface BackfillCleanupOptions {
  dryRun?: boolean;
  /** Campaign whose SENT ledger rows must be PRESERVED (the old cold campaign). */
  keepCampaignId: string;
  /** Optional canonical concept key to set on the kept rows (e.g. "reativacao-frios"). */
  relabelTo?: string | null;
}

export interface BackfillCleanupResult {
  ok: boolean;
  dryRun: boolean;
  keepCampaignId: string;
  relabelTo: string | null;
  totalBackfillRecords: number;
  keepRecords: number;
  removeRecords: number;
  byCampaign: Array<{ campaignId: string | null; count: number; action: "KEEP" | "REMOVE" }>;
  keptFamilyKeys: Array<{ campaignFamilyKey: string | null; count: number }>;
  relabelCandidates: number;
  deleted: number;
  relabeled: number;
  warnings: string[];
}

export async function cleanupBackfilledLedger(options: BackfillCleanupOptions): Promise<BackfillCleanupResult> {
  const dryRun = options.dryRun !== false; // default DRY-RUN for safety
  const keepCampaignId = options.keepCampaignId;
  const relabelTo = options.relabelTo ?? null;
  const warnings: string[] = [];

  if (!keepCampaignId) {
    return {
      ok: false, dryRun, keepCampaignId: "", relabelTo,
      totalBackfillRecords: 0, keepRecords: 0, removeRecords: 0,
      byCampaign: [], keptFamilyKeys: [], relabelCandidates: 0,
      deleted: 0, relabeled: 0, warnings: ["keepCampaignId é obrigatório — abortado para evitar limpeza ampla."],
    };
  }

  // Composition of the backfilled rows, grouped by source campaign (counts only).
  const grouped = await prisma.cRMContactLedger.groupBy({
    by: ["campaignId"],
    where: { metadata: BACKFILL_FILTER },
    _count: { id: true },
  });

  const byCampaign = grouped
    .map((g) => ({
      campaignId: g.campaignId,
      count: g._count.id,
      action: (g.campaignId === keepCampaignId ? "KEEP" : "REMOVE") as "KEEP" | "REMOVE",
    }))
    .sort((a, b) => b.count - a.count);

  const totalBackfillRecords = byCampaign.reduce((s, c) => s + c.count, 0);
  const keepRecords = byCampaign.filter((c) => c.action === "KEEP").reduce((s, c) => s + c.count, 0);
  const removeRecords = totalBackfillRecords - keepRecords;

  // Family keys currently on the rows we will keep (so we can see if a relabel is needed).
  const keptFamilyGroups = await prisma.cRMContactLedger.groupBy({
    by: ["campaignFamilyKey"],
    where: { metadata: BACKFILL_FILTER, campaignId: keepCampaignId },
    _count: { id: true },
  });
  const keptFamilyKeys = keptFamilyGroups
    .map((g) => ({ campaignFamilyKey: g.campaignFamilyKey, count: g._count.id }))
    .sort((a, b) => b.count - a.count);

  const relabelCandidates = relabelTo
    ? keptFamilyKeys.filter((k) => k.campaignFamilyKey !== relabelTo).reduce((s, k) => s + k.count, 0)
    : 0;

  if (keepRecords === 0) warnings.push(`Nenhum registro de backfill encontrado para keepCampaignId=${keepCampaignId} — verifique o id antes de prosseguir.`);

  let deleted = 0;
  let relabeled = 0;

  if (!dryRun) {
    // 1) Remove backfill rows that do NOT belong to the campaign we keep.
    const del = await prisma.cRMContactLedger.deleteMany({
      where: { metadata: BACKFILL_FILTER, NOT: { campaignId: keepCampaignId } },
    });
    deleted = del.count;

    // 2) Optionally relabel the kept rows to the canonical concept key.
    if (relabelTo) {
      const upd = await prisma.cRMContactLedger.updateMany({
        where: { metadata: BACKFILL_FILTER, campaignId: keepCampaignId, NOT: { campaignFamilyKey: relabelTo } },
        data: { campaignFamilyKey: relabelTo },
      });
      relabeled = upd.count;
    }
  }

  return {
    ok: true,
    dryRun,
    keepCampaignId,
    relabelTo,
    totalBackfillRecords,
    keepRecords,
    removeRecords,
    byCampaign,
    keptFamilyKeys,
    relabelCandidates,
    deleted,
    relabeled,
    warnings,
  };
}
