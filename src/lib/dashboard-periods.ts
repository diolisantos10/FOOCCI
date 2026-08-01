/**
 * dashboard-periods.ts — Pure helpers for dashboard period ranges and chart bucketing.
 *
 * All functions are pure: no DB, no I/O, no side effects.
 * The optional `now` parameter makes every function deterministically testable.
 *
 * Bucket granularity strategy:
 *   today / yesterday           → hour  (24 hourly buckets, 0–23)
 *   this_week / 7d              → day   (N daily buckets, where N = period length)
 *   current_month / 30d         → day
 *   custom ≤2 days              → hour
 *   custom >2 days              → day
 *
 * Comparison window rules (exact, per spec):
 *   today          → yesterday 0h → yesterday at same elapsed time (not full day)
 *   yesterday      → the day before yesterday (full day)
 *   this_week      → same elapsed span of last week (not full 7-day week)
 *   7d             → the 7 days immediately before
 *   current_month  → same days 1–N of previous month (capped at last day of prev month)
 *   30d            → the 30 days before the current window
 *   custom         → same duration, immediately before
 */

export type Period =
  | "today" | "yesterday" | "this_week" | "7d"
  | "current_month" | "last_month" | "30d" | "custom";

export type BucketGranularity = "hour" | "day";

export interface PeriodRange {
  rangeStart:  Date;
  rangeEnd:    Date;
  prevStart:   Date;
  prevEnd:     Date;
  period:      Period;
  label:       string;
  prevLabel:   string;
  days:        number;
  isToday:     boolean;
  granularity: BucketGranularity;
}

export interface ChartBucket {
  bucketKey: string;  // "07" for hour, "2026-06-15" for day
  label:     string;  // "7h" for hour, "Sex 15" or "15/06" for day
  revenue:   number;
  orders:    number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Start of the business day in Brazil time (UTC-3 = 03:00 UTC).
 * offsetDays=0 → today midnight BRT.
 */
function brazilMidnight(offsetDays: number, now: Date): Date {
  const d = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays,
    3, 0, 0,
  ));
  // If today's 03:00 UTC hasn't arrived yet, roll back one day
  if (offsetDays === 0 && now.getTime() < d.getTime()) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

const DAY_NAMES_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const DAY_NAMES_LONG  = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;

/** "vs. quinta passada" / "vs. domingo passado" for a same-weekday-last-week comparison. */
function lastWeekdayLabel(dow: number): string {
  const name   = DAY_NAMES_LONG[dow] ?? "";
  const gender = dow === 0 || dow === 6 ? "passado" : "passada"; // domingo/sábado are masculine
  return `vs. ${name} ${gender}`;
}

/** Human-readable day label from an ISO date string. */
function dayBucketLabel(iso: string, totalBuckets: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dow = new Date(y, m - 1, d).getDay();
  const dn  = DAY_NAMES_SHORT[dow] ?? "";
  const dd  = String(d).padStart(2, "0");
  // ≤7 buckets: "Seg 02"; more buckets: "02/06" (less verbose)
  return totalBuckets <= 7 ? `${dn} ${dd}` : `${dd}/${String(m).padStart(2, "0")}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Parse YYYY-MM-DD as Brazil midnight (03:00 UTC). Returns null on bad input. */
export function parseBrazilDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T03:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Compute the current and comparison period windows for a given period key.
 *
 * Comparison windows are symmetric: same elapsed duration, same relative position.
 */
export function computePeriodRange(
  period:         Period,
  startDateParam: string | null,
  endDateParam:   string | null,
  now:            Date = new Date(),
): PeriodRange {
  const todayStart = brazilMidnight(0, now);
  const brtNow     = new Date(now.getTime() - 3 * 3_600_000); // BRT local time

  // ── today ─────────────────────────────────────────────────────────────────
  if (period === "today") {
    // Compare to the SAME WEEKDAY last week (Thu vs last Thu), same elapsed time —
    // weekday-to-weekday is the meaningful comparison for a restaurant.
    const prevStart = new Date(todayStart.getTime() - 7 * 86_400_000);
    const prevEnd   = new Date(now.getTime()        - 7 * 86_400_000);
    return {
      rangeStart: todayStart, rangeEnd: now,
      prevStart,              prevEnd,
      period, label: "Hoje", prevLabel: lastWeekdayLabel(brtNow.getUTCDay()),
      days: 1, isToday: true, granularity: "hour",
    };
  }

  // ── yesterday ─────────────────────────────────────────────────────────────
  if (period === "yesterday") {
    const yStart = new Date(todayStart.getTime() - 86_400_000);
    const yEnd   = todayStart;
    // Same weekday the previous week (yesterday − 7 days).
    const yDow   = ((brtNow.getUTCDay() - 1) + 7) % 7;
    return {
      rangeStart: yStart, rangeEnd: yEnd,
      prevStart: new Date(yStart.getTime() - 7 * 86_400_000),
      prevEnd:   new Date(yEnd.getTime()   - 7 * 86_400_000),
      period, label: "Ontem", prevLabel: lastWeekdayLabel(yDow),
      days: 1, isToday: false, granularity: "hour",
    };
  }

  // ── this_week ─────────────────────────────────────────────────────────────
  if (period === "this_week") {
    const dow          = brtNow.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
    const daysSinceMon = dow === 0 ? 6 : dow - 1;
    const weekStart    = new Date(todayStart.getTime() - daysSinceMon * 86_400_000);
    const days         = Math.max(1, daysSinceMon + 1);
    // Comparison: last week Monday → same day-of-week last week at same time.
    // prevEnd = now - 7d (not weekStart) so the elapsed span is identical.
    const prevStart = new Date(weekStart.getTime() - 7 * 86_400_000);
    const prevEnd   = new Date(now.getTime()        - 7 * 86_400_000);
    return {
      rangeStart: weekStart, rangeEnd: now,
      prevStart,              prevEnd,
      period, label: "Esta semana", prevLabel: "vs. semana anterior",
      days, isToday: false, granularity: "day",
    };
  }

  // ── 7d ────────────────────────────────────────────────────────────────────
  if (period === "7d") {
    const rangeStart = new Date(todayStart.getTime() - 6 * 86_400_000);
    return {
      rangeStart, rangeEnd: now,
      prevStart: new Date(rangeStart.getTime() - 7 * 86_400_000),
      prevEnd:   rangeStart,
      period, label: "Últimos 7 dias", prevLabel: "vs. 7 dias anteriores",
      days: 7, isToday: false, granularity: "day",
    };
  }

  // ── current_month ─────────────────────────────────────────────────────────
  if (period === "current_month") {
    const y          = brtNow.getUTCFullYear();
    const m          = brtNow.getUTCMonth(); // 0-indexed
    const rangeStart = new Date(Date.UTC(y, m, 1, 3, 0, 0));
    const prevStart  = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0));
    const elapsed    = now.getTime() - rangeStart.getTime();
    // prevEnd = same elapsed into previous month.
    // Cap at rangeStart (= start of current month = end of previous month)
    // to handle February edge cases (e.g., today=Mar 31 → cap at Mar 1).
    const prevEnd = new Date(Math.min(prevStart.getTime() + elapsed, rangeStart.getTime()));
    const days    = Math.max(1, Math.ceil(elapsed / 86_400_000));
    return {
      rangeStart, rangeEnd: now,
      prevStart,  prevEnd,
      period, label: "Este mês", prevLabel: "vs. mesmo período mês anterior",
      days, isToday: false, granularity: "day",
    };
  }

  // ── last_month (mês anterior — mês-calendário fechado) ─────────────────────
  if (period === "last_month") {
    const y = brtNow.getUTCFullYear();
    const m = brtNow.getUTCMonth(); // mês atual (0-indexed)
    const rangeStart = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0)); // 1º do mês passado
    const rangeEnd   = new Date(Date.UTC(y, m,     1, 3, 0, 0)); // 1º do mês atual (fim exclusivo)
    const prevStart  = new Date(Date.UTC(y, m - 2, 1, 3, 0, 0)); // mês retrasado
    const days = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000));
    return {
      rangeStart, rangeEnd,
      prevStart, prevEnd: rangeStart,
      period, label: "Mês anterior", prevLabel: "vs. mês retrasado",
      days, isToday: false, granularity: "day",
    };
  }

  // ── 30d ───────────────────────────────────────────────────────────────────
  if (period === "30d") {
    const rangeStart = new Date(todayStart.getTime() - 29 * 86_400_000);
    return {
      rangeStart, rangeEnd: now,
      prevStart: new Date(rangeStart.getTime() - 30 * 86_400_000),
      prevEnd:   rangeStart,
      period, label: "Últimos 30 dias", prevLabel: "vs. 30 dias anteriores",
      days: 30, isToday: false, granularity: "day",
    };
  }

  // ── custom ────────────────────────────────────────────────────────────────
  const rawStart  = startDateParam ? parseBrazilDate(startDateParam) : null;
  const rawEnd    = endDateParam   ? parseBrazilDate(endDateParam)   : null;
  const safeStart = rawStart ?? todayStart;
  const endDay    = rawEnd   ?? now;
  // endDate is inclusive: push boundary to end of that day
  const safeEnd   = new Date(Math.min(endDay.getTime() + 86_400_000, now.getTime()));
  const days      = Math.max(1, Math.ceil((safeEnd.getTime() - safeStart.getTime()) / 86_400_000));
  const label     = startDateParam && endDateParam
    ? `${startDateParam.slice(5)} – ${endDateParam.slice(5)}`
    : "Personalizado";
  const granularity: BucketGranularity = days <= 2 ? "hour" : "day";
  // Compare to the SAME window shifted back a whole number of weeks, so the
  // weekdays line up (Mon–Fri vs last week's Mon–Fri) instead of bleeding into
  // a weekend — a weekend in the comparison window skews a weekday range. The
  // shift is the smallest multiple of 7 ≥ the range, so it never overlaps.
  const weekShiftDays = Math.ceil(days / 7) * 7;
  const shiftMs       = weekShiftDays * 86_400_000;
  return {
    rangeStart: safeStart, rangeEnd: safeEnd,
    prevStart:  new Date(safeStart.getTime() - shiftMs),
    prevEnd:    new Date(safeEnd.getTime()   - shiftMs),
    period, label,
    prevLabel:  weekShiftDays === 7 ? "vs. semana passada" : `vs. ${weekShiftDays} dias antes`,
    days, isToday: false, granularity,
  };
}

// ── Chart bucket builders ─────────────────────────────────────────────────────

function buildHourlyBuckets(
  orders: { createdAt: Date; total: number }[],
): ChartBucket[] {
  const rev = new Array<number>(24).fill(0);
  const ord = new Array<number>(24).fill(0);
  for (const o of orders) {
    const h = new Date(o.createdAt.getTime() - 3 * 3_600_000).getUTCHours();
    rev[h] = (rev[h] ?? 0) + o.total;
    ord[h] = (ord[h] ?? 0) + 1;
  }
  return Array.from({ length: 24 }, (_, h) => ({
    bucketKey: String(h).padStart(2, "0"),
    label:     `${h}h`,
    revenue:   Math.round((rev[h] ?? 0) * 100) / 100,
    orders:    ord[h] ?? 0,
  }));
}

function buildDailyBuckets(
  orders:      { createdAt: Date; total: number }[],
  periodStart: Date,
  numBuckets:  number,
): ChartBucket[] {
  // Generate ISO date keys for each day in the period (BRT)
  const slots: string[] = [];
  for (let i = 0; i < numBuckets; i++) {
    // periodStart is already at 03:00 UTC (BRT midnight).
    // Subtracting 3h gives 00:00 UTC, so .toISOString().slice(0,10) = BRT date.
    const d = new Date(periodStart.getTime() + i * 86_400_000 - 3 * 3_600_000);
    slots.push(d.toISOString().slice(0, 10));
  }

  const rev: Record<string, number> = {};
  const ord: Record<string, number> = {};
  for (const s of slots) { rev[s] = 0; ord[s] = 0; }

  for (const o of orders) {
    const key = new Date(o.createdAt.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
    if (key in rev) {
      rev[key]! += o.total;
      ord[key]! += 1;
    }
  }

  return slots.map(date => ({
    bucketKey: date,
    label:     dayBucketLabel(date, numBuckets),
    revenue:   Math.round((rev[date] ?? 0) * 100) / 100,
    orders:    ord[date] ?? 0,
  }));
}

/**
 * Build time-series chart buckets from a list of orders.
 *
 * @param orders      Orders to aggregate (must have createdAt and total).
 * @param periodStart Start of the period window (Brazil midnight = 03:00 UTC).
 * @param numBuckets  Number of buckets to generate (24 for hourly, N for daily).
 * @param granularity "hour" or "day".
 */
export function buildChartBuckets(
  orders: { createdAt: Date; total: number }[],
  periodStart: Date,
  numBuckets:  number,
  granularity: BucketGranularity,
): ChartBucket[] {
  return granularity === "hour"
    ? buildHourlyBuckets(orders)
    : buildDailyBuckets(orders, periodStart, Math.min(numBuckets, 90));
}
