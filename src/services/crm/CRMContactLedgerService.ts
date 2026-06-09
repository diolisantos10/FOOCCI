/**
 * CRMContactLedgerService — writes/reads the immutable CRM impact memory.
 *
 * The ledger is the source of truth for "who was already impacted by what", and it
 * survives campaign deletion/recreation (no FKs). Dedupe + preflight read it; the
 * runner + automations write it. It never stores full message text.
 */

import { prisma } from "@/lib/prisma";
import type { CrmReasonCode } from "./crmReasonCodes";

export type LedgerContactType =
  | "CAMPAIGN" | "AUTOMATION" | "BIRTHDAY" | "REACTIVATION" | "REVIEW_REQUEST" | "POST_ORDER" | "MANUAL";
export type LedgerStatus = "SENT" | "BLOCKED" | "FAILED" | "SKIPPED";

export interface LedgerEntry {
  restaurantId: string;
  customerId?: string | null;
  phone?: string | null;
  campaignId?: string | null;
  campaignFamilyKey?: string | null;
  messageFingerprint?: string | null;
  channel?: string;
  contactType: LedgerContactType;
  status: LedgerStatus;
  reasonCode?: CrmReasonCode | null;
  usedPriorityOverride?: boolean;
  sourceExecutionId?: string | null;
  metadata?: Record<string, unknown> | null;
}

function toData(e: LedgerEntry) {
  const now = new Date();
  return {
    restaurantId: e.restaurantId,
    customerId: e.customerId ?? null,
    phone: e.phone ?? null,
    campaignId: e.campaignId ?? null,
    campaignFamilyKey: e.campaignFamilyKey ?? null,
    messageFingerprint: e.messageFingerprint ?? null,
    channel: e.channel ?? "WHATSAPP",
    contactType: e.contactType,
    status: e.status,
    reasonCode: e.reasonCode ?? null,
    usedPriorityOverride: e.usedPriorityOverride ?? false,
    sentAt: e.status === "SENT" ? now : null,
    blockedAt: e.status === "BLOCKED" ? now : null,
    failedAt: e.status === "FAILED" ? now : null,
    sourceExecutionId: e.sourceExecutionId ?? null,
    metadata: (e.metadata ?? undefined) as object | undefined,
  };
}

/** Records a single ledger entry. Never throws into the caller's hot path. */
export async function recordLedger(entry: LedgerEntry): Promise<void> {
  try {
    await prisma.cRMContactLedger.create({ data: toData(entry) });
  } catch (err) {
    console.error("[CRMContactLedger] record failed:", err instanceof Error ? err.message : err);
  }
}

export async function recordLedgerBatch(entries: LedgerEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await prisma.cRMContactLedger.createMany({ data: entries.map(toData) });
  } catch (err) {
    console.error("[CRMContactLedger] batch record failed:", err instanceof Error ? err.message : err);
  }
}

function sinceWindow(windowDays?: number): Date | undefined {
  if (!windowDays || windowDays <= 0) return undefined; // 0 / undefined = no window (lifetime)
  return new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
}

/** Customer ids already SENT this CONCEPT (campaignFamilyKey) within the window. */
export async function getImpactedByConcept(
  restaurantId: string, campaignFamilyKey: string, windowDays?: number,
): Promise<Set<string>> {
  if (!campaignFamilyKey) return new Set();
  const since = sinceWindow(windowDays);
  const rows = await prisma.cRMContactLedger.findMany({
    where: { restaurantId, campaignFamilyKey, status: "SENT", ...(since ? { sentAt: { gte: since } } : {}) },
    select: { customerId: true },
  });
  return new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id));
}

/** Customer ids already SENT this MESSAGE fingerprint within the window. */
export async function getImpactedByMessage(
  restaurantId: string, messageFingerprint: string, windowDays?: number,
): Promise<Set<string>> {
  if (!messageFingerprint) return new Set();
  const since = sinceWindow(windowDays);
  const rows = await prisma.cRMContactLedger.findMany({
    where: { restaurantId, messageFingerprint, status: "SENT", ...(since ? { sentAt: { gte: since } } : {}) },
    select: { customerId: true },
  });
  return new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id));
}

/** Customer ids already SENT this exact campaignId (lifetime). */
export async function getImpactedByCampaign(restaurantId: string, campaignId: string): Promise<Set<string>> {
  const rows = await prisma.cRMContactLedger.findMany({
    where: { restaurantId, campaignId, status: "SENT" },
    select: { customerId: true },
  });
  return new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id));
}
