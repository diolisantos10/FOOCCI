/**
 * crm-revenue-series — pure helpers for the CRM revenue chart.
 *
 * The chart shows honest, period-accurate CRM-attributed revenue over time.
 * Source of truth is CampaignExecution proven conversions (convertedAt + revenue):
 * each row is a real order attributed to a campaign send. No invented revenue.
 *
 * These functions are pure (no DB, no I/O) so they can be unit-tested and shared
 * between the /api/crm/revenue-summary endpoint and the test suite.
 */

export type ChartGranularity = "hour" | "day" | "month";

export interface RevenueBucket {
  /** Stable sortable key, e.g. "2024-01-08" / "2024-01-08T14" / "2024-01". */
  key: string;
  /** Human label for the axis, pt-BR. */
  label: string;
  revenue: number;
  orders: number;
}

/**
 * Choose bucket granularity from the selected period.
 *   - no range (all-time) → month
 *   - ≤ ~36h               → hour   (e.g. "Hoje")
 *   - ≤ 92 days            → day    (week / month windows)
 *   - otherwise            → month  (year / long custom ranges)
 */
export function chartGranularity(from: Date | null, to: Date | null): ChartGranularity {
  if (!from || !to) return "month";
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days <= 1.5) return "hour";
  if (days <= 92) return "day";
  return "month";
}

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Stable key for the bucket a date falls into, at the given granularity. */
export function bucketKey(d: Date, g: ChartGranularity): string {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  if (g === "month") return `${y}-${m}`;
  const day = pad(d.getDate());
  if (g === "day") return `${y}-${m}-${day}`;
  return `${y}-${m}-${day}T${pad(d.getHours())}`;
}

/** Human pt-BR label for a bucket key. */
export function bucketLabel(key: string, g: ChartGranularity): string {
  if (g === "month") {
    const [, m] = key.split("-");
    return MONTHS_PT[Number(m) - 1] ?? key;
  }
  if (g === "day") {
    const [, m, d] = key.split("-");
    return `${d}/${m}`;
  }
  // hour
  const hour = key.split("T")[1] ?? "00";
  return `${hour}h`;
}

/** Advance a date to the start of the next bucket (used to enumerate empty buckets). */
function stepBucketStart(d: Date, g: ChartGranularity): Date {
  if (g === "hour") return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1);
  if (g === "day") return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

function bucketStart(d: Date, g: ChartGranularity): Date {
  if (g === "hour") return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
  if (g === "day") return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Build a continuous revenue series from proven conversion rows.
 *
 * When a [from, to] window is given, every bucket in the window is emitted
 * (zero-filled) so the chart shows a stable axis. Without a window (all-time),
 * only buckets that actually have data are emitted, sorted ascending.
 *
 * Caps the number of buckets to avoid pathological axes; if a windowed series
 * would exceed `maxBuckets`, the granularity should be coarsened by the caller.
 */
export function buildRevenueSeries(
  rows: Array<{ convertedAt: Date; revenue: number }>,
  from: Date | null,
  to: Date | null,
  g: ChartGranularity,
  maxBuckets = 120,
): RevenueBucket[] {
  const acc = new Map<string, { revenue: number; orders: number }>();
  for (const r of rows) {
    const key = bucketKey(r.convertedAt, g);
    const cur = acc.get(key) ?? { revenue: 0, orders: 0 };
    cur.revenue += r.revenue;
    cur.orders += 1;
    acc.set(key, cur);
  }

  if (from && to) {
    const out: RevenueBucket[] = [];
    let cursor = bucketStart(from, g);
    const end = to.getTime();
    let guard = 0;
    while (cursor.getTime() <= end && guard < maxBuckets) {
      const key = bucketKey(cursor, g);
      const hit = acc.get(key);
      out.push({ key, label: bucketLabel(key, g), revenue: hit?.revenue ?? 0, orders: hit?.orders ?? 0 });
      cursor = stepBucketStart(cursor, g);
      guard++;
    }
    return out;
  }

  // All-time: only populated buckets, ascending.
  return [...acc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(-maxBuckets)
    .map(([key, v]) => ({ key, label: bucketLabel(key, g), revenue: v.revenue, orders: v.orders }));
}
