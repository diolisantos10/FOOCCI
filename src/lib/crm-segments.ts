/**
 * CRM Relationship Segment Configuration
 *
 * Defines the day-threshold rules that classify customers into:
 *   QUENTE  — ordered within hotMaxDays
 *   MORNO   — ordered between hotMaxDays+1 and warmMaxDays days ago
 *   FRIO    — ordered warmMaxDays+1 days ago or more (up to lostMinDays)
 *   PERDIDO — ordered lostMinDays+ days ago (or never, depending on context)
 *
 * Stored in RestaurantCRMProfile.segmentConfig (JSONB).
 * Enforced by CrmAudienceService and CRMService.getOverviewStats.
 * CustomerMetricsSyncService continues to use crm-helpers.computeSegment
 * and reads these thresholds at runtime when passed explicitly.
 */

import { prisma } from "@/lib/prisma";

// ─── Config shape ─────────────────────────────────────────────────────────────

export interface SegmentConfig {
  /** Days within which a customer is considered QUENTE. Default 30. */
  hotMaxDays: number;
  /** Max days for MORNO. Must be > hotMaxDays. Default 60. */
  warmMaxDays: number;
  /** Days from which a customer is considered PERDIDO. Must be > warmMaxDays. Default 120. */
  lostMinDays: number;
}

export const DEFAULT_SEGMENT_CONFIG: Readonly<SegmentConfig> = {
  hotMaxDays:  30,
  warmMaxDays: 60,
  lostMinDays: 120,
};

// ─── Derived helpers ──────────────────────────────────────────────────────────

/** Days from which a customer is considered FRIO (= warmMaxDays + 1). */
export function coldMinDays(cfg: SegmentConfig): number {
  return cfg.warmMaxDays + 1;
}

// ─── Parsing / validation ─────────────────────────────────────────────────────

export function parseSegmentConfig(raw: unknown): SegmentConfig {
  const d = DEFAULT_SEGMENT_CONFIG;
  if (!raw || typeof raw !== "object") return { ...d };
  const r = raw as Record<string, unknown>;

  const hot  = typeof r.hotMaxDays  === "number" && r.hotMaxDays  >= 1  ? Math.floor(r.hotMaxDays)  : d.hotMaxDays;
  const warm = typeof r.warmMaxDays === "number" && r.warmMaxDays > hot  ? Math.floor(r.warmMaxDays) : Math.max(hot + 1, d.warmMaxDays);
  const lost = typeof r.lostMinDays === "number" && r.lostMinDays > warm ? Math.floor(r.lostMinDays) : Math.max(warm + 1, d.lostMinDays);

  return { hotMaxDays: hot, warmMaxDays: warm, lostMinDays: lost };
}

// ─── DB helper ────────────────────────────────────────────────────────────────

export async function getSegmentConfig(restaurantId: string): Promise<SegmentConfig> {
  const profile = await prisma.restaurantCRMProfile.findUnique({
    where:  { restaurantId },
    select: { segmentConfig: true },
  });
  return parseSegmentConfig(profile?.segmentConfig);
}

// ─── Date cutoffs ─────────────────────────────────────────────────────────────

export interface SegmentCutoffs {
  hotCutoff:  Date; // customers with lastOrder >= hotCutoff are QUENTE
  warmCutoff: Date; // customers with lastOrder >= warmCutoff (and < hotCutoff) are MORNO
  lostCutoff: Date; // customers with lastOrder < lostCutoff are PERDIDO
}

export function buildCutoffs(cfg: SegmentConfig, now: Date = new Date()): SegmentCutoffs {
  const ms = now.getTime();
  return {
    hotCutoff:  new Date(ms - cfg.hotMaxDays  * 86_400_000),
    warmCutoff: new Date(ms - cfg.warmMaxDays * 86_400_000),
    lostCutoff: new Date(ms - cfg.lostMinDays * 86_400_000),
  };
}
