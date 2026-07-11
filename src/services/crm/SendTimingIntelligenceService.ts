/**
 * SendTimingIntelligenceService
 *
 * Learns the best CRM send hours for a restaurant from REAL outcomes:
 * the hour-of-day distribution of sends that later CONVERTED
 * (CampaignExecution.converted = true — the only positive-outcome signal
 * persisted in the schema; clicks/replies are not stored per execution).
 *
 * Design principles (additive, opt-in):
 * - Pure read-side intelligence: never sends, never mutates.
 * - No opinion without evidence: fewer than MIN_SAMPLE_SIZE converted sends
 *   returns null, and callers MUST fall back to their existing behavior.
 * - Never overrides the merchant: pickBestHourWithin only ever returns an
 *   hour INSIDE the already-configured send window.
 *
 * The runner integration is gated by CRM_LEARNED_TIMING_ENABLED === "true"
 * (env, default OFF) — see ScheduledCampaignRunnerService.runCampaignBatch.
 */

import { prisma } from "@/lib/prisma";

export interface LearnedSendTiming {
  /** Normalized score per local hour-of-day (0-23). Best hour has score 1. */
  hourScores: Record<number, number>;
  /** Up to 3 best hours, highest score first (ties → earlier hour first). */
  topHours: number[];
  /** Number of positive-outcome executions the distribution was built from. */
  sampleSize: number;
}

/** Below this many converted sends the service has NO opinion (returns null). */
export const MIN_SAMPLE_SIZE = 30;

/** Upper bound on rows aggregated per call (most recent first) — keeps the
 *  query cheap and the signal fresh for very large tenants. */
const MAX_SAMPLE_SIZE = 5000;

const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/** Local hour-of-day (0-23) of a UTC instant in the given IANA timezone. */
function hourInTimezone(date: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  });
  const hour = parseInt(fmt.format(date), 10);
  return Number.isFinite(hour) ? hour % 24 : 0;
}

/** "HH:MM" → minutes since midnight. Numbers are treated as whole hours. */
function toMinutes(value: string | number): number {
  if (typeof value === "number") return Math.max(0, Math.min(24, value)) * 60;
  const [h = 0, m = 0] = value.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export class SendTimingIntelligenceService {
  /**
   * Aggregate the restaurant's converted campaign executions into an
   * hour-of-day score distribution (hours in the restaurant's timezone).
   *
   * Returns null when there are fewer than MIN_SAMPLE_SIZE converted sends —
   * not enough data means NO opinion, and callers keep their current behavior.
   */
  static async bestSendHours(
    restaurantId: string,
    timezone: string = DEFAULT_TIMEZONE,
  ): Promise<LearnedSendTiming | null> {
    const rows = await prisma.campaignExecution.findMany({
      where: {
        restaurantId,
        converted: true,
        sentAt: { not: null },
      },
      select: { sentAt: true },
      orderBy: { sentAt: "desc" },
      take: MAX_SAMPLE_SIZE,
    });

    const sampleSize = rows.length;
    if (sampleSize < MIN_SAMPLE_SIZE) return null;

    // Count converted sends per local hour of the SEND time (the decision we
    // want to inform is "when to send", not "when conversions happen").
    const counts: Record<number, number> = {};
    for (const row of rows) {
      if (!row.sentAt) continue;
      const hour = hourInTimezone(row.sentAt, timezone);
      counts[hour] = (counts[hour] ?? 0) + 1;
    }

    const maxCount = Math.max(...Object.values(counts));
    const hourScores: Record<number, number> = {};
    for (const [hour, count] of Object.entries(counts)) {
      hourScores[Number(hour)] = count / maxCount;
    }

    const topHours = Object.entries(hourScores)
      .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
      .slice(0, 3)
      .map(([hour]) => Number(hour));

    return { hourScores, topHours, sampleSize };
  }

  /**
   * Best-scoring hour STRICTLY INSIDE the merchant-configured window
   * [windowStart, windowEnd). Accepts "HH:MM" strings or whole-hour numbers.
   *
   * Returns null when no scored hour overlaps the window (or the window is
   * empty/inverted) — the caller must then keep its current behavior. The
   * returned hour is always one whose 60-minute block overlaps the window,
   * so acting on it can never leave the merchant's window.
   */
  static pickBestHourWithin(
    windowStart: string | number,
    windowEnd: string | number,
    hourScores: Record<number, number>,
  ): number | null {
    const startMins = toMinutes(windowStart);
    const endMins = toMinutes(windowEnd);
    if (endMins <= startMins) return null;

    let best: number | null = null;
    let bestScore = -Infinity;
    for (let hour = 0; hour < 24; hour++) {
      const blockStart = hour * 60;
      const blockEnd = blockStart + 60;
      const overlapsWindow = blockEnd > startMins && blockStart < endMins;
      if (!overlapsWindow) continue;

      const score = hourScores[hour];
      if (score === undefined) continue;
      if (score > bestScore) {
        bestScore = score;
        best = hour;
      }
    }
    return best;
  }
}
