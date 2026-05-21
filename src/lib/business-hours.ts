/**
 * Business hours utilities — shared across all channels (ordering UI, finalize API,
 * WhatsApp agent, future admin triggers).
 *
 * Supports both legacy single-period rows (openTime + closeTime) and the newer
 * periodsJson format ([{ open, close }, ...]) for split shifts like lunch 11–15
 * and dinner 18–23.
 *
 * All callers should use `isRestaurantOpenNow` (async, DB lookup) or
 * `isOpenFromRow` (sync, row already in memory).
 */

import { prisma } from "@/lib/prisma";

export interface TimePeriod {
  open:  string; // "HH:MM"
  close: string; // "HH:MM"
}

export function toMinutes(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

export function isInPeriod(nowMin: number, period: TimePeriod): boolean {
  const open  = toMinutes(period.open);
  const close = toMinutes(period.close);
  // Midnight-crossing: close ≤ open means the period wraps past midnight (e.g. 22:00–01:00)
  if (close <= open) return nowMin >= open || nowMin < close;
  return nowMin >= open && nowMin < close;
}

/**
 * Returns the effective time periods for a BusinessHours row.
 * - If `periodsJson` is set and non-empty, it takes precedence over openTime/closeTime.
 * - Otherwise falls back to a single period from openTime/closeTime.
 * - Returns [] when `isOpen` is false.
 */
export function getPeriodsForRow(row: {
  isOpen:      boolean;
  openTime:    string;
  closeTime:   string;
  periodsJson: unknown;
}): TimePeriod[] {
  if (!row.isOpen) return [];
  if (row.periodsJson) {
    const parsed = row.periodsJson as TimePeriod[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  }
  return [{ open: row.openTime, close: row.closeTime }];
}

/**
 * Sync open-check for when the row is already in memory (e.g. page.tsx).
 * Returns true (open) when no row exists — no config means no restriction.
 */
export function isOpenFromRow(
  row: { isOpen: boolean; openTime: string; closeTime: string; periodsJson: unknown } | null | undefined,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!row) return true;
  const local  = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const nowMin = local.getHours() * 60 + local.getMinutes();
  return getPeriodsForRow(row).some((p) => isInPeriod(nowMin, p));
}

/**
 * Async open-check that fetches from DB.
 * Uses restaurant.timezone. Falls back to "America/Sao_Paulo".
 * Returns true (open) when no BusinessHours row is configured for today.
 */
export async function isRestaurantOpenNow(
  restaurantId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const restaurant = await prisma.restaurant.findUnique({
    where:  { id: restaurantId },
    select: { timezone: true },
  });
  const tz    = restaurant?.timezone ?? "America/Sao_Paulo";
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const dow   = local.getDay();

  const row = await prisma.businessHours.findUnique({
    where:  { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: dow } },
    select: { isOpen: true, openTime: true, closeTime: true, periodsJson: true },
  });

  if (!row) return true;
  const nowMin = local.getHours() * 60 + local.getMinutes();
  return getPeriodsForRow(row).some((p) => isInPeriod(nowMin, p));
}
