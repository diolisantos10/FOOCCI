/**
 * CustomerSegmentService
 *
 * Authoritative resolver for customer segment (QUENTE/MORNO/FRIO/PERDIDO/SEM_PEDIDOS)
 * and tier (BRONZE/PRATA/OURO/DIAMANTE).
 *
 * Design:
 *   - Pure functions (resolveCustomerSegment, resolveCustomerTier, resolveCustomerClassification)
 *     take explicit inputs and have no side effects — easy to test and reuse.
 *   - "Effective" values prefer real Foocci orders over imported historical summaries
 *     while still surfacing the imported data when no native orders exist.
 *   - DataSource tracks where the classification data came from.
 *
 * Imported vs native logic:
 *   - "native"   — customer has real Foocci orders only
 *   - "imported" — customer has only the external-import summary (no Foocci orders yet)
 *   - "mixed"    — customer has both real and imported data
 *   - "none"     — no order data at all
 */

import {
  DEFAULT_SEGMENT_CONFIG,
  type SegmentConfig,
} from "@/lib/crm-segments";
import {
  DEFAULT_SETTINGS,
  computeTierWithSettings,
  type TierSettingsInput,
} from "@/services/crm/RelationshipProgramService";
import type { CustomerSegmentValue, CustomerTierValue } from "@/services/crm/crm-helpers";

// ── Exported types ─────────────────────────────────────────────────────────────

export type DataSource = "native" | "imported" | "mixed" | "none";

export interface SegmentInput {
  /** Last native Foocci order date. */
  lastOrderAt:         Date | null;
  /** Last order date from the external-import summary. */
  importedLastOrderAt: Date | null;
  /** Count of real Foocci orders. */
  totalOrders:         number;
  /** Count from external-import summary. */
  importedOrderCount:  number | null;
  cfg:                 SegmentConfig;
  now?:                Date;
}

export interface TierInput {
  totalSpend:         number;
  totalOrders:        number;
  importedTotalSpent: number | null;
  importedOrderCount: number | null;
  settings:           TierSettingsInput;
}

/** Combined input accepted by resolveCustomerClassification. */
export interface ClassificationInput extends SegmentInput {
  totalSpend:         number;
  importedTotalSpent: number | null;
  settings:           TierSettingsInput;
}

export interface SegmentResult {
  segment: CustomerSegmentValue;
  daysAgo: number | null;
  source:  DataSource;
}

export interface TierResult {
  tier:            CustomerTierValue;
  effectiveSpend:  number;
  effectiveOrders: number;
  source:          DataSource;
}

export interface CustomerClassification {
  segment: CustomerSegmentValue;
  tier:    CustomerTierValue;
  source:  DataSource;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function dataSource(nativeOrders: number, importedOrders: number | null): DataSource {
  const hasNative   = nativeOrders > 0;
  const hasImported = (importedOrders ?? 0) > 0;
  if (hasNative && hasImported) return "mixed";
  if (hasNative)   return "native";
  if (hasImported) return "imported";
  return "none";
}

// ── Pure resolvers ─────────────────────────────────────────────────────────────

/**
 * Classify a customer into a relationship segment.
 *
 * Native Foocci orders take precedence over the imported historical summary
 * when determining the effective last-order date.
 */
export function resolveCustomerSegment(input: SegmentInput): SegmentResult {
  const { lastOrderAt, importedLastOrderAt, totalOrders, importedOrderCount, cfg } = input;
  const now    = input.now ?? new Date();
  const source = dataSource(totalOrders, importedOrderCount);

  const hasNative   = totalOrders > 0 && lastOrderAt !== null;
  const hasImported = importedLastOrderAt !== null;
  const effectiveLast = hasNative ? lastOrderAt : hasImported ? importedLastOrderAt : null;

  if (!effectiveLast) return { segment: "SEM_PEDIDOS", daysAgo: null, source };

  const daysAgo = Math.floor((now.getTime() - effectiveLast.getTime()) / 86_400_000);

  if (daysAgo <= cfg.hotMaxDays)  return { segment: "QUENTE",  daysAgo, source };
  if (daysAgo <= cfg.warmMaxDays) return { segment: "MORNO",   daysAgo, source };
  if (daysAgo <  cfg.lostMinDays) return { segment: "FRIO",    daysAgo, source };
  return                                 { segment: "PERDIDO", daysAgo, source };
}

/**
 * Compute a customer's loyalty tier.
 *
 * Uses native Foocci spend/orders when available; falls back to the
 * imported historical summary for customers who haven't ordered on Foocci yet.
 */
export function resolveCustomerTier(input: TierInput): TierResult {
  const { totalSpend, totalOrders, importedTotalSpent, importedOrderCount, settings } = input;

  const hasNative   = totalOrders > 0;
  const hasImported = (importedOrderCount ?? 0) > 0 || (importedTotalSpent ?? 0) > 0;

  const source: DataSource =
    hasNative && hasImported ? "mixed"   :
    hasNative                ? "native"  :
    hasImported              ? "imported":
                               "none";

  const effectiveSpend  = hasNative ? totalSpend  : (importedTotalSpent  ?? 0);
  const effectiveOrders = hasNative ? totalOrders : (importedOrderCount  ?? 0);

  return {
    tier: computeTierWithSettings(effectiveSpend, effectiveOrders, settings),
    effectiveSpend,
    effectiveOrders,
    source,
  };
}

/** Resolve both segment and tier in one call. */
export function resolveCustomerClassification(input: ClassificationInput): CustomerClassification {
  const seg  = resolveCustomerSegment(input);
  const tier = resolveCustomerTier({
    totalSpend:         input.totalSpend,
    totalOrders:        input.totalOrders,
    importedTotalSpent: input.importedTotalSpent,
    importedOrderCount: input.importedOrderCount,
    settings:           input.settings,
  });
  return { segment: seg.segment, tier: tier.tier, source: seg.source };
}

// ── Convenience defaults ───────────────────────────────────────────────────────

export const CUSTOMER_SEGMENT_DEFAULTS = {
  cfg:      DEFAULT_SEGMENT_CONFIG,
  settings: DEFAULT_SETTINGS,
} as const;
