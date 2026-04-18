/**
 * Adaptive CRM Brain service.
 *
 * Adaptation loop:
 *   1. Every CRM message sent → logged in CRMActionLog (style + intent)
 *   2. Outcomes updated asynchronously (responded / converted / revenue)
 *   3. computeStyleWeights() reads last 30d of logs, applies Laplace-smoothed
 *      conversion rates, then rank-decays to weights
 *   4. Tone profile multipliers shift weights toward the restaurant's personality
 *   5. Next message generation uses these weights → high-converters get more traffic
 *
 * Anti-staleness:
 *   - Weights are cached in RestaurantCRMProfile.styleWeights
 *   - profileVersion is bumped each recompute
 *   - Caller can force recompute; otherwise cache is used
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, type ServiceResult } from "@/types";
import type { CRMMessageStyle, CRMToneProfile } from "@prisma/client";
import type { StyleWeights, MessageIntent, MessageStyle } from "@/lib/crm-messages";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_STYLES: MessageStyle[] = ["FRIENDLY", "PLAYFUL", "DIRECT", "EMOTIONAL", "PREMIUM"];

/** Rank-decay weights for positions 1–5 (must sum to 1.0). */
const RANK_WEIGHTS = [0.50, 0.25, 0.13, 0.08, 0.04];

/**
 * Tone multipliers: each tone boosts two styles by 30%.
 * After applying, weights are renormalised to sum=1.
 */
const TONE_BOOSTS: Record<CRMToneProfile, Partial<Record<MessageStyle, number>>> = {
  CASUAL:        { PLAYFUL: 1.3, FRIENDLY: 1.3 },
  PREMIUM_FEEL:  { PREMIUM: 1.3, EMOTIONAL: 1.3 },
  FRIENDLY:      { FRIENDLY: 1.3, EMOTIONAL: 1.3 },
  SALES_FORWARD: { DIRECT: 1.3, PREMIUM: 1.3 },
};

const LOOKBACK_DAYS = 30;

// ── Types ─────────────────────────────────────────────────────────────────────

export type StyleStats = {
  style:          MessageStyle;
  sent:           number;
  converted:      number;
  conversionRate: number; // smoothed
  revenue:        number;
  weight:         number; // final weight after tone boost
};

export type BrainSummary = {
  topStyle:        MessageStyle;
  totalSent:       number;
  totalConverted:  number;
  overallRate:     number;
  styles:          StyleStats[];
  toneProfile:     string;
  profileVersion:  number;
};

export type LogActionInput = {
  customerId?:   string;
  actionType:    MessageIntent;
  messageStyle:  MessageStyle;
  messageText:   string;
};

export type RecordOutcomeInput = {
  responded?:  boolean;
  converted?:  boolean;
  revenue?:    number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function laplace(conversions: number, total: number): number {
  return (conversions + 1) / (total + 2);
}

function normalise(weights: Record<string, number>): Record<string, number> {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum === 0) return weights;
  return Object.fromEntries(
    Object.entries(weights).map(([k, v]) => [k, v / sum])
  );
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AdaptiveCRMService {

  // ── Action logging ─────────────────────────────────────────────────────────

  static async logAction(
    restaurantId: string,
    input: LogActionInput
  ): Promise<ServiceResult<{ id: string }>> {
    const log = await prisma.cRMActionLog.create({
      data: {
        restaurantId,
        customerId:   input.customerId ?? null,
        actionType:   input.actionType,
        messageStyle: input.messageStyle as CRMMessageStyle,
        messageText:  input.messageText,
      },
    });
    return serviceOk({ id: log.id });
  }

  static async recordOutcome(
    restaurantId: string,
    logId: string,
    input: RecordOutcomeInput
  ): Promise<ServiceResult<null>> {
    const log = await prisma.cRMActionLog.findFirst({
      where: { id: logId, restaurantId },
    });
    if (!log) return serviceFail("Log não encontrado", 404);

    await prisma.cRMActionLog.update({
      where: { id: logId },
      data: {
        ...(input.responded  !== undefined && { responded: input.responded, respondedAt: new Date() }),
        ...(input.converted  !== undefined && { converted: input.converted, convertedAt: new Date() }),
        ...(input.revenue    !== undefined && { revenue: new Decimal(input.revenue) }),
      },
    });
    return serviceOk(null);
  }

  // ── Weight computation ─────────────────────────────────────────────────────

  /**
   * Compute StyleWeights from the last LOOKBACK_DAYS of action logs.
   *
   * Algorithm:
   *   1. For each style: count sent + converted in window
   *   2. Laplace-smooth the conversion rate → smoothedRate
   *   3. Rank styles by smoothedRate
   *   4. Assign rank-decay weights (50/25/13/8/4%)
   *   5. Apply tone profile multipliers
   *   6. Renormalise to sum=1
   */
  static async computeStyleWeights(
    restaurantId: string
  ): Promise<StyleWeights> {
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

    const rows = await prisma.cRMActionLog.groupBy({
      by: ["messageStyle"],
      where: { restaurantId, createdAt: { gte: cutoff } },
      _count: { _all: true },
    });

    // Also get conversions per style
    const convRows = await prisma.cRMActionLog.groupBy({
      by: ["messageStyle"],
      where: { restaurantId, createdAt: { gte: cutoff }, converted: true },
      _count: { _all: true },
    });

    const sentMap = new Map<string, number>(
      rows.map((r) => [r.messageStyle, r._count._all])
    );
    const convMap = new Map<string, number>(
      convRows.map((r) => [r.messageStyle, r._count._all])
    );

    // Compute smoothed rates
    const rated = ALL_STYLES.map((style) => ({
      style,
      sent:        sentMap.get(style)  ?? 0,
      conversions: convMap.get(style)  ?? 0,
      smoothed:    laplace(convMap.get(style) ?? 0, sentMap.get(style) ?? 0),
    }));

    // Sort by smoothed rate descending
    rated.sort((a, b) => b.smoothed - a.smoothed);

    // Assign rank-decay weights
    const rawWeights: Record<string, number> = {};
    rated.forEach((item, idx) => {
      rawWeights[item.style] = RANK_WEIGHTS[idx] ?? 0.01;
    });

    // Apply tone profile boosts
    const profile = await prisma.restaurantCRMProfile.findUnique({
      where: { restaurantId },
      select: { toneProfile: true },
    });

    if (profile?.toneProfile) {
      const boosts = TONE_BOOSTS[profile.toneProfile];
      for (const [style, mult] of Object.entries(boosts)) {
        if (rawWeights[style] !== undefined) {
          rawWeights[style]! *= mult;
        }
      }
    }

    return normalise(rawWeights) as StyleWeights;
  }

  /**
   * Recompute and persist weights, bump profileVersion.
   * Call this when enough new data has accumulated (e.g., every 10 actions).
   */
  static async refreshWeights(restaurantId: string): Promise<StyleWeights> {
    const weights = await this.computeStyleWeights(restaurantId);

    await prisma.restaurantCRMProfile.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        styleWeights:   weights,
        profileVersion: 1,
      },
      update: {
        styleWeights:   weights,
        profileVersion: { increment: 1 },
      },
    });

    return weights;
  }

  /** Return cached weights, recomputing if the cache is missing. */
  static async getWeights(restaurantId: string): Promise<StyleWeights> {
    const profile = await prisma.restaurantCRMProfile.findUnique({
      where: { restaurantId },
      select: { styleWeights: true },
    });

    if (profile?.styleWeights && typeof profile.styleWeights === "object") {
      const w = profile.styleWeights as Record<string, number>;
      if (Object.keys(w).length > 0) return w as StyleWeights;
    }

    // Cache miss → compute on the fly (not persisted here; use refreshWeights for that)
    return this.computeStyleWeights(restaurantId);
  }

  // ── Tone profile ───────────────────────────────────────────────────────────

  static async setToneProfile(
    restaurantId: string,
    tone: CRMToneProfile
  ): Promise<ServiceResult<null>> {
    await prisma.restaurantCRMProfile.upsert({
      where: { restaurantId },
      create: { restaurantId, toneProfile: tone },
      update: { toneProfile: tone },
    });
    // Weights will be refreshed on next getWeights call
    return serviceOk(null);
  }

  // ── Brain summary ──────────────────────────────────────────────────────────

  static async getBrainSummary(restaurantId: string): Promise<ServiceResult<BrainSummary>> {
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

    const [profile, sentRows, convRows, revenueRows] = await Promise.all([
      prisma.restaurantCRMProfile.findUnique({ where: { restaurantId } }),
      prisma.cRMActionLog.groupBy({
        by: ["messageStyle"],
        where: { restaurantId, createdAt: { gte: cutoff } },
        _count: { _all: true },
      }),
      prisma.cRMActionLog.groupBy({
        by: ["messageStyle"],
        where: { restaurantId, createdAt: { gte: cutoff }, converted: true },
        _count: { _all: true },
      }),
      prisma.cRMActionLog.groupBy({
        by: ["messageStyle"],
        where: { restaurantId, createdAt: { gte: cutoff }, converted: true },
        _sum: { revenue: true },
      }),
    ]);

    const weights = await this.getWeights(restaurantId);

    const sentMap    = new Map(sentRows.map((r) => [r.messageStyle, r._count._all]));
    const convMap    = new Map(convRows.map((r) => [r.messageStyle, r._count._all]));
    const revenueMap = new Map(revenueRows.map((r) => [r.messageStyle, Number(r._sum.revenue ?? 0)]));

    const styles: StyleStats[] = ALL_STYLES.map((style) => {
      const sent        = sentMap.get(style as CRMMessageStyle)  ?? 0;
      const converted   = convMap.get(style as CRMMessageStyle)  ?? 0;
      const revenue     = revenueMap.get(style as CRMMessageStyle) ?? 0;
      const smoothed    = laplace(converted, sent);
      return {
        style,
        sent,
        converted,
        conversionRate: parseFloat(smoothed.toFixed(3)),
        revenue,
        weight: parseFloat((weights[style] ?? 0).toFixed(3)),
      };
    }).sort((a, b) => b.weight - a.weight);

    const totalSent      = styles.reduce((s, x) => s + x.sent, 0);
    const totalConverted = styles.reduce((s, x) => s + x.converted, 0);
    const overallRate    = laplace(totalConverted, totalSent);

    return serviceOk({
      topStyle:       styles[0]?.style ?? "FRIENDLY",
      totalSent,
      totalConverted,
      overallRate:    parseFloat(overallRate.toFixed(3)),
      styles,
      toneProfile:    profile?.toneProfile ?? "FRIENDLY",
      profileVersion: profile?.profileVersion ?? 0,
    });
  }

  // ── Recent action log ──────────────────────────────────────────────────────

  static async getRecentActions(
    restaurantId: string,
    limit = 20
  ): Promise<ServiceResult<Array<{
    id: string;
    actionType: string;
    messageStyle: string;
    converted: boolean;
    responded: boolean;
    createdAt: string;
    customerId: string | null;
  }>>> {
    const rows = await prisma.cRMActionLog.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, actionType: true, messageStyle: true,
        converted: true, responded: true, createdAt: true, customerId: true,
      },
    });

    return serviceOk(
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }))
    );
  }
}
