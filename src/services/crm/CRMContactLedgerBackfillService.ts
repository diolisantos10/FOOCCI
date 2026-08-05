/**
 * CRMContactLedgerBackfillService — populates the impact ledger from EXISTING
 * CampaignExecution SENT rows, so the CRM remembers who was already impacted
 * before the ledger existed.
 *
 * Safe: read-only on campaigns, never sends, never calls the WhatsApp channel, never deletes
 * history. Idempotent (deduped by sourceExecutionId). Preserves the original
 * sentAt so dedupe windows stay correct.
 */

import { prisma } from "@/lib/prisma";
import { generateMessageFingerprint, suggestCampaignFamilyKey } from "./messageFingerprint";

const SENT_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

export interface BackfillOptions {
  dryRun?: boolean;
  restaurantId?: string;
  campaignId?: string;
  campaignFamilyKey?: string;
  limit?: number;
}

export interface BackfillResult {
  ok: boolean;
  dryRun: boolean;
  sentFound: number;
  alreadyInLedger: number;
  created: number;          // dryRun → how many WOULD be created
  withoutCampaign: number;
  withoutFamilyKey: number;
  withoutFingerprint: number;
  warnings: string[];
}

export async function backfillContactLedger(options: BackfillOptions = {}): Promise<BackfillResult> {
  const dryRun = options.dryRun !== false; // default DRY-RUN for safety
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 5000);
  const warnings: string[] = [];

  const execs = await prisma.campaignExecution.findMany({
    where: {
      status: { in: [...SENT_STATUSES] },
      ...(options.campaignId ? { campaignId: options.campaignId } : {}),
      ...(options.restaurantId ? { restaurantId: options.restaurantId } : {}),
    },
    orderBy: { sentAt: "asc" },
    take: limit,
    select: { id: true, campaignId: true, restaurantId: true, customerId: true, customerPhone: true, sentAt: true },
  });

  if (execs.length === 0) {
    return { ok: true, dryRun, sentFound: 0, alreadyInLedger: 0, created: 0, withoutCampaign: 0, withoutFamilyKey: 0, withoutFingerprint: 0, warnings };
  }

  // Load the parent campaigns (some may have been deleted → soft data only).
  const campaignIds = [...new Set(execs.map((e) => e.campaignId).filter((id): id is string => !!id))];
  const campaigns = await prisma.campaign.findMany({
    where: { id: { in: campaignIds } },
    select: { id: true, name: true, objective: true, message: true, restaurantId: true, campaignFamilyKey: true, messageFingerprint: true },
  });
  const campMap = new Map(campaigns.map((c) => [c.id, c]));

  // Idempotency: skip executions already in the ledger.
  const existing = new Set(
    (await prisma.cRMContactLedger.findMany({ where: { sourceExecutionId: { in: execs.map((e) => e.id) } }, select: { sourceExecutionId: true } }))
      .map((r) => r.sourceExecutionId),
  );

  let alreadyInLedger = 0, withoutCampaign = 0, withoutFamilyKey = 0, withoutFingerprint = 0;
  const toCreate: Array<Record<string, unknown>> = [];

  for (const e of execs) {
    if (existing.has(e.id)) { alreadyInLedger++; continue; }
    const camp = e.campaignId ? campMap.get(e.campaignId) : undefined;
    if (!camp) withoutCampaign++;

    const familyKey =
      camp?.campaignFamilyKey ||
      (camp ? suggestCampaignFamilyKey({ name: camp.name, objective: camp.objective }) : (options.campaignFamilyKey ?? null));
    const fingerprint =
      camp?.messageFingerprint || (camp?.message ? generateMessageFingerprint(camp.message) : null);

    if (!familyKey) withoutFamilyKey++;
    if (!fingerprint) withoutFingerprint++;

    const restaurantId = e.restaurantId ?? camp?.restaurantId ?? options.restaurantId ?? null;
    if (!restaurantId) { warnings.push(`Execução ${e.id} sem restaurantId — ignorada.`); continue; }

    toCreate.push({
      restaurantId,
      customerId: e.customerId ?? null,
      phone: e.customerPhone ?? null,
      campaignId: e.campaignId ?? null,
      campaignFamilyKey: familyKey,
      messageFingerprint: fingerprint,
      channel: "WHATSAPP",
      contactType: "CAMPAIGN",
      status: "SENT",
      reasonCode: "SENT",
      sourceExecutionId: e.id,
      sentAt: e.sentAt ?? new Date(),
      metadata: { backfill: true },
    });
  }

  if (withoutFamilyKey > 0) warnings.push(`${withoutFamilyKey} execução(ões) sem campaignFamilyKey (campanha apagada/sem nome).`);
  if (withoutFingerprint > 0) warnings.push(`${withoutFingerprint} execução(ões) sem messageFingerprint.`);

  if (!dryRun && toCreate.length > 0) {
    await prisma.cRMContactLedger.createMany({ data: toCreate as never });
  }

  return {
    ok: true,
    dryRun,
    sentFound: execs.length,
    alreadyInLedger,
    created: toCreate.length,
    withoutCampaign,
    withoutFamilyKey,
    withoutFingerprint,
    warnings,
  };
}
