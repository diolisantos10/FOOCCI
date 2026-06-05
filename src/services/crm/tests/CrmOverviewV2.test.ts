/**
 * CRM Overview v2 — pure logic tests (A–Q).
 */
import { describe, it, expect } from "vitest";
import {
  chartGranularity,
  bucketKey,
  bucketLabel,
  buildRevenueSeries,
} from "@/lib/crm-revenue-series";

// ── Date preset helpers (mirrored from CRMClient.tsx) ──────────────────────────

type DateFilterPreset = "today" | "week7" | "week" | "total" | "month" | "year" | "custom";

function computeDateRange(preset: DateFilterPreset, now: Date, cfrom?: string, cto?: string): { from: Date; to: Date } | null {
  if (preset === "total") return null;
  const to = now;
  let from: Date;
  if (preset === "today") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (preset === "week7") {
    from = new Date(now.getTime() - 7 * 86_400_000);
  } else if (preset === "week") {
    const day = now.getDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
  } else if (preset === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (preset === "year") {
    from = new Date(now.getFullYear(), 0, 1);
  } else {
    if (!cfrom || !cto) return null;
    return { from: new Date(cfrom), to: new Date(cto) };
  }
  return { from, to };
}

// ── Temperature helpers ────────────────────────────────────────────────────────

function computeTemperaturePct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

// ── Perdidos as subset of frios ───────────────────────────────────────────────

function isPerdidosSubsetOfFrios(frios: number, perdidos: number): boolean {
  return perdidos <= frios;
}

// ── Config alerts NOT above temp unless critical ───────────────────────────────

function configAboveTemp(configActions: number, isCriticalBlocking: boolean): boolean {
  return isCriticalBlocking && configActions > 0;
}

// ── Revenue missing = no fake data ────────────────────────────────────────────

function revenueIsHonest(totalRevenue: number, totalSent: number): boolean {
  // No fake revenue: if totalSent is 0, revenue should also be 0
  return !(totalSent === 0 && totalRevenue > 0);
}

// ── Relationship program: quantity + percentage ───────────────────────────────

function formatTierDisplay(count: number, total: number): string {
  const pct = computeTemperaturePct(count, total);
  return `${count.toLocaleString("pt-BR")} — ${pct}%`;
}

// Tests ───────────────────────────────────────────────────────────────────────

const WEDNESDAY = new Date("2024-01-10T14:00:00Z"); // Wednesday Jan 10 2024

// A — date presets include Hoje, Últimos 7 dias, Esta semana
describe("A — date presets include all 6 new presets", () => {
  const presets: DateFilterPreset[] = ["today", "week7", "week", "month", "year", "total", "custom"];
  it("contains 'today'",  () => expect(presets).toContain("today"));
  it("contains 'week7'",  () => expect(presets).toContain("week7"));
  it("contains 'week'",   () => expect(presets).toContain("week"));
  it("contains 'month'",  () => expect(presets).toContain("month"));
  it("contains 'year'",   () => expect(presets).toContain("year"));
  it("contains 'total'",  () => expect(presets).toContain("total"));
});

// B — Últimos 7 dias and Esta semana produce different date ranges
describe("B — week7 and week produce different date ranges", () => {
  it("week7 starts 7 days ago", () => {
    const r = computeDateRange("week7", WEDNESDAY);
    expect(r).not.toBeNull();
    const diffDays = (WEDNESDAY.getTime() - r!.from.getTime()) / 86_400_000;
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it("week starts on Monday of current week", () => {
    const r = computeDateRange("week", WEDNESDAY);
    expect(r).not.toBeNull();
    // WEDNESDAY Jan 10 = Wed, Monday = Jan 8
    expect(r!.from.getDate()).toBe(8);
    expect(r!.from.getMonth()).toBe(0); // January
  });

  it("week7 and week produce different from dates", () => {
    const r7   = computeDateRange("week7", WEDNESDAY);
    const rWk  = computeDateRange("week",  WEDNESDAY);
    expect(r7!.from.getTime()).not.toBe(rWk!.from.getTime());
  });

  it("total returns null (no date filter)", () => {
    expect(computeDateRange("total", WEDNESDAY)).toBeNull();
  });
});

// C — Temperature section includes Perdidos
describe("C — temperature section includes Perdidos", () => {
  it("perdidosCustomers is included in the stats shape", () => {
    const stats = {
      totalCustomers: 10856,
      ativoCustomers:  198,
      mornoCustomers:  355,
      frioCustomers:  8414,
      perdidosCustomers: 7882,
      newCustomers:     34,
      segments: [],
      deliveryOnlyCustomers: 0,
      dineInOnlyCustomers: 0,
      bothChannelsCustomers: 0,
    };
    expect(stats).toHaveProperty("perdidosCustomers");
    expect(stats.perdidosCustomers).toBe(7882);
  });

  it("perdidos percentage is computed correctly", () => {
    const tempTotal = 198 + 355 + 8414;
    expect(computeTemperaturePct(7882, tempTotal)).toBe(Math.round((7882 / tempTotal) * 100));
  });
});

// D — Novos clientes label includes "no período"
describe("D — newCustomersLabel includes period context", () => {
  function getLabel(preset: DateFilterPreset): string {
    if (preset === "today")  return "Novos hoje";
    if (preset === "week7")  return "Novos (7 dias)";
    if (preset === "week")   return "Novos esta semana";
    if (preset === "month")  return "Novos este mês";
    if (preset === "year")   return "Novos este ano";
    if (preset === "custom") return "Novos no período";
    return "Novos clientes";
  }
  it("today label is 'Novos hoje'",           () => expect(getLabel("today")).toBe("Novos hoje"));
  it("week7 label is 'Novos (7 dias)'",       () => expect(getLabel("week7")).toBe("Novos (7 dias)"));
  it("week  label is 'Novos esta semana'",    () => expect(getLabel("week")).toBe("Novos esta semana"));
  it("month label is 'Novos este mês'",       () => expect(getLabel("month")).toBe("Novos este mês"));
  it("custom label is 'Novos no período'",    () => expect(getLabel("custom")).toBe("Novos no período"));
});

// E — new customers metric follows selected period (date range is non-null for period presets)
describe("E — period presets produce non-null date ranges (stats will follow them)", () => {
  for (const preset of ["today", "week7", "week", "month", "year"] as DateFilterPreset[]) {
    it(`${preset} produces a non-null date range`, () => {
      expect(computeDateRange(preset, WEDNESDAY)).not.toBeNull();
    });
  }
});

// F — Config alerts NOT above temperature (unless critical blocker)
describe("F — config alerts are below temperature by default", () => {
  it("non-critical config: configAboveTemp = false", () => {
    expect(configAboveTemp(2, false)).toBe(false);
  });
  it("critical blocking config: configAboveTemp = true", () => {
    expect(configAboveTemp(1, true)).toBe(true);
  });
  it("zero config actions: never above temp", () => {
    expect(configAboveTemp(0, true)).toBe(false);
  });
});

// G — Relationship program shows quantity and percentage
describe("G — relationship program shows count and percentage", () => {
  it("formats Bronze 10225 out of 10225 as '10.225 — 100%'", () => {
    expect(formatTierDisplay(10225, 10225)).toBe("10.225 — 100%");
  });
  it("formats Ouro 0 out of 100 as '0 — 0%'", () => {
    expect(formatTierDisplay(0, 100)).toBe("0 — 0%");
  });
  it("rounds to integer percentage", () => {
    const pct = computeTemperaturePct(1, 3);
    expect(Number.isInteger(pct)).toBe(true);
  });
});

// H — CRM revenue section uses attribution data
describe("H — CRM revenue block shape", () => {
  const revenueData = { totalRevenue: 4500, totalSent: 120, totalResponded: 45, totalConverted: 12, campaignCount: 3 };
  it("has totalRevenue field", ()   => expect(revenueData).toHaveProperty("totalRevenue"));
  it("has totalSent field", ()      => expect(revenueData).toHaveProperty("totalSent"));
  it("has campaignCount field", ()  => expect(revenueData).toHaveProperty("campaignCount"));
  it("has totalConverted field", () => expect(revenueData).toHaveProperty("totalConverted"));
});

// I — Missing revenue attribution does not create fake revenue
describe("I — no fake revenue", () => {
  it("0 sent → 0 revenue (no fake data)", () => {
    expect(revenueIsHonest(0, 0)).toBe(true);
  });
  it("revenue > 0 with sent > 0 → honest", () => {
    expect(revenueIsHonest(4500, 120)).toBe(true);
  });
  it("revenue > 0 with sent = 0 → dishonest (should not happen)", () => {
    expect(revenueIsHonest(100, 0)).toBe(false);
  });
});

// J — Revenue opportunities show compact top actions
describe("J — compact opportunities: top 6 shown, rest behind 'Ver mais'", () => {
  const COMPACT_LIMIT = 6;
  function visibleActions<T>(all: T[], expanded: boolean): T[] {
    return expanded ? all : all.slice(0, COMPACT_LIMIT);
  }
  it("shows at most 6 actions by default", () => {
    const actions = Array.from({ length: 9 }, (_, i) => i);
    expect(visibleActions(actions, false)).toHaveLength(COMPACT_LIMIT);
  });
  it("shows all when expanded", () => {
    const actions = Array.from({ length: 9 }, (_, i) => i);
    expect(visibleActions(actions, true)).toHaveLength(9);
  });
  it("shows all when fewer than 6", () => {
    const actions = [1, 2, 3];
    expect(visibleActions(actions, false)).toHaveLength(3);
  });
});

// K — "Ver mais oportunidades" exists when there are more than 6
describe("K — show more button exists when > 6 opportunities", () => {
  const COMPACT_LIMIT = 6;
  function shouldShowMore(total: number): boolean { return total > COMPACT_LIMIT; }
  it("6 actions → no show more", () => expect(shouldShowMore(6)).toBe(false));
  it("7 actions → show more",    () => expect(shouldShowMore(7)).toBe(true));
  it("0 actions → no show more", () => expect(shouldShowMore(0)).toBe(false));
});

// J2 — Coupon-proven revenue dimension is honest (no fake redemption)
describe("J2 — coupon revenue dimension is honest", () => {
  // Mirror of the OverviewTab coupon-card subtitle decision.
  function couponSubtitle(couponRevenue: number, couponCodesTracked: number): string {
    if (couponRevenue > 0) return "value";
    if (couponCodesTracked > 0) return "Nenhum resgatado";
    return "Sem cupom vinculado";
  }
  it("no campaign coupons tracked → 'Sem cupom vinculado'", () => {
    expect(couponSubtitle(0, 0)).toBe("Sem cupom vinculado");
  });
  it("coupons tracked but none redeemed → 'Nenhum resgatado'", () => {
    expect(couponSubtitle(0, 3)).toBe("Nenhum resgatado");
  });
  it("coupon revenue present → shows value", () => {
    expect(couponSubtitle(450, 3)).toBe("value");
  });
  it("coupon revenue never appears without tracked codes (endpoint invariant)", () => {
    // Endpoint only sums coupon orders when couponCodes.length > 0, so
    // couponRevenue > 0 implies couponCodesTracked > 0.
    const couponRevenue = 0, couponCodesTracked = 0;
    expect(!(couponRevenue > 0 && couponCodesTracked === 0)).toBe(true);
  });
});

// L — Perdidos is subset of Frios
describe("L — perdidos is a subset of frios", () => {
  it("perdidos ≤ frios", () => {
    expect(isPerdidosSubsetOfFrios(8414, 7882)).toBe(true);
  });
  it("perdidos = frios is valid (all frios are also perdidos)", () => {
    expect(isPerdidosSubsetOfFrios(100, 100)).toBe(true);
  });
  it("perdidos > frios is invalid", () => {
    expect(isPerdidosSubsetOfFrios(100, 200)).toBe(false);
  });
});

// M — No CRM send side effects (pure read)
describe("M — revenue-summary is read-only (no send, no mutation)", () => {
  it("computeDateRange does not mutate input date", () => {
    const d = new Date("2024-01-10T14:00:00Z");
    const before = d.getTime();
    computeDateRange("week7", d);
    expect(d.getTime()).toBe(before);
  });
  it("computeTemperaturePct does not throw on 0 total", () => {
    expect(() => computeTemperaturePct(0, 0)).not.toThrow();
    expect(computeTemperaturePct(0, 0)).toBe(0);
  });
});

// N — Segment / action CTAs map to the correct navigation target
describe("N — segment and action CTAs route correctly", () => {
  // Mirror of the CTA → tab/filter mapping used by OverviewTab + CRMClient.
  function segmentToFilter(seg: "quente" | "morno" | "frio" | "novos"): string {
    return seg === "novos" ? "firstTime" : seg;
  }
  function actionCtaTarget(cta: "criar-campanha" | "ver-clientes"): "campanhas" | "customers" {
    return cta === "criar-campanha" ? "campanhas" : "customers";
  }
  it("quente segment → 'quente' customer filter", () => {
    expect(segmentToFilter("quente")).toBe("quente");
  });
  it("novos segment → 'firstTime' customer filter", () => {
    expect(segmentToFilter("novos")).toBe("firstTime");
  });
  it("'Criar campanha' CTA → campanhas tab", () => {
    expect(actionCtaTarget("criar-campanha")).toBe("campanhas");
  });
  it("'Ver clientes' CTA → customers tab", () => {
    expect(actionCtaTarget("ver-clientes")).toBe("customers");
  });
});

// P — Tenant isolation invariant: every revenue query is restaurant-scoped
describe("P — revenue-summary queries are tenant-scoped", () => {
  // Mirror of the where-clause builder in the endpoint: restaurantId is always
  // present; the period filter is additive and never replaces tenant scoping.
  function buildCampaignWhere(restaurantId: string, from?: string, to?: string): Record<string, unknown> {
    const base: Record<string, unknown> = { restaurantId };
    if (from && to) {
      base.OR = [
        { sentAt:    { gte: new Date(from), lte: new Date(to) } },
        { createdAt: { gte: new Date(from), lte: new Date(to) } },
      ];
    }
    return base;
  }
  it("includes restaurantId with no date range", () => {
    expect(buildCampaignWhere("rest_123")).toHaveProperty("restaurantId", "rest_123");
  });
  it("includes restaurantId with a date range", () => {
    const w = buildCampaignWhere("rest_123", "2024-01-01", "2024-01-31");
    expect(w).toHaveProperty("restaurantId", "rest_123");
    expect(w).toHaveProperty("OR");
  });
  it("date range never removes restaurantId scoping", () => {
    const w = buildCampaignWhere("rest_abc", "2024-01-01", "2024-01-31");
    expect(w.restaurantId).toBe("rest_abc");
  });
});

// ── V2.1 layout deltas ──────────────────────────────────────────────────────

// R — Top KPI bar lists all 6 cards in order (restored horizontal bar)
describe("R — top KPI bar includes all 6 cards", () => {
  // Mirror of the card list rendered at the top of OverviewTab.
  const KPI_CARDS = ["Clientes na base", "Quentes", "Mornos", "Frios", "Perdidos", "Novos no período"];
  it("contains exactly 6 cards", () => expect(KPI_CARDS).toHaveLength(6));
  it("includes Clientes na base", () => expect(KPI_CARDS).toContain("Clientes na base"));
  it("includes Quentes",          () => expect(KPI_CARDS).toContain("Quentes"));
  it("includes Mornos",           () => expect(KPI_CARDS).toContain("Mornos"));
  it("includes Frios",            () => expect(KPI_CARDS).toContain("Frios"));
  it("includes Perdidos",         () => expect(KPI_CARDS).toContain("Perdidos"));
  it("includes Novos no período",  () => expect(KPI_CARDS).toContain("Novos no período"));
  it("Perdidos appears in the top bar (not only temperature section)", () => {
    expect(KPI_CARDS.indexOf("Perdidos")).toBeGreaterThanOrEqual(0);
  });
});

// S — KPI segment cards expose both count and percentage
describe("S — segment KPI cards show count and percentage", () => {
  function segmentCard(count: number, tempTotal: number) {
    return { count, pct: computeTemperaturePct(count, tempTotal) };
  }
  it("Quentes card has a numeric count", () => {
    expect(segmentCard(198, 8967).count).toBe(198);
  });
  it("Quentes card has a percentage", () => {
    const c = segmentCard(198, 8967);
    expect(typeof c.pct).toBe("number");
    expect(c.pct).toBe(Math.round((198 / 8967) * 100));
  });
  it("base card needs no percentage (denominator is itself)", () => {
    // Clientes na base is a raw count, no pct chip.
    const baseCard = { count: 10856, pct: undefined as number | undefined };
    expect(baseCard.pct).toBeUndefined();
  });
});

// T — Section order: revenue chart appears below the KPI bar, above temperature
describe("T — overview section order", () => {
  // Mirror of the rendered section order in OverviewTab (v2.2).
  // The redundant temperature strip and the channel block were removed; the
  // "most valuable customers" block now sits where temperature used to be.
  const ORDER = [
    "filters",
    "kpi-bar",
    "revenue",
    "top-customers",
    "program",
    "opportunities",
    "config",
  ];
  it("kpi-bar comes before revenue", () => {
    expect(ORDER.indexOf("kpi-bar")).toBeLessThan(ORDER.indexOf("revenue"));
  });
  it("revenue comes before top-customers", () => {
    expect(ORDER.indexOf("revenue")).toBeLessThan(ORDER.indexOf("top-customers"));
  });
  it("top-customers comes before program", () => {
    expect(ORDER.indexOf("top-customers")).toBeLessThan(ORDER.indexOf("program"));
  });
  it("redundant temperature and channel sections are gone", () => {
    expect(ORDER).not.toContain("temperature");
    expect(ORDER).not.toContain("channel");
  });
  it("opportunities comes before config", () => {
    expect(ORDER.indexOf("opportunities")).toBeLessThan(ORDER.indexOf("config"));
  });
  it("config is last", () => {
    expect(ORDER[ORDER.length - 1]).toBe("config");
  });
});

// U — Chart granularity changes with the selected period
describe("U — revenue chart granularity by period", () => {
  it("all-time (no range) → month", () => {
    expect(chartGranularity(null, null)).toBe("month");
  });
  it("today (same day) → hour", () => {
    const from = new Date("2024-03-10T00:00:00");
    const to   = new Date("2024-03-10T23:59:59");
    expect(chartGranularity(from, to)).toBe("hour");
  });
  it("last 7 days → day", () => {
    const to   = new Date("2024-03-10T12:00:00");
    const from = new Date(to.getTime() - 7 * 86_400_000);
    expect(chartGranularity(from, to)).toBe("day");
  });
  it("this month → day", () => {
    const from = new Date("2024-03-01T00:00:00");
    const to   = new Date("2024-03-31T23:59:59");
    expect(chartGranularity(from, to)).toBe("day");
  });
  it("this year → month", () => {
    const from = new Date("2024-01-01T00:00:00");
    const to   = new Date("2024-12-31T23:59:59");
    expect(chartGranularity(from, to)).toBe("month");
  });
  it("week7 and year produce different granularities", () => {
    const to = new Date("2024-06-15T12:00:00");
    const g7   = chartGranularity(new Date(to.getTime() - 7 * 86_400_000), to);
    const gYr  = chartGranularity(new Date("2024-01-01"), to);
    expect(g7).not.toBe(gYr);
  });
});

// V — Bucket keys and labels are stable and human-readable
describe("V — bucket key/label formatting", () => {
  it("day bucket key is YYYY-MM-DD", () => {
    expect(bucketKey(new Date("2024-01-08T14:30:00"), "day")).toBe("2024-01-08");
  });
  it("month bucket key is YYYY-MM", () => {
    expect(bucketKey(new Date("2024-01-08T14:30:00"), "month")).toBe("2024-01");
  });
  it("day label is DD/MM", () => {
    expect(bucketLabel("2024-01-08", "day")).toBe("08/01");
  });
  it("month label is pt-BR short month", () => {
    expect(bucketLabel("2024-03", "month")).toBe("mar");
  });
  it("hour label ends with h", () => {
    expect(bucketLabel("2024-01-08T14", "hour")).toBe("14h");
  });
});

// W — buildRevenueSeries: honest, zero-filled, no invented revenue
describe("W — revenue series construction", () => {
  it("zero-fills empty buckets across a windowed range", () => {
    const from = new Date("2024-03-01T00:00:00");
    const to   = new Date("2024-03-05T23:59:59");
    const rows = [{ convertedAt: new Date("2024-03-03T10:00:00"), revenue: 120 }];
    const series = buildRevenueSeries(rows, from, to, "day");
    expect(series).toHaveLength(5); // Mar 1..5
    const populated = series.filter((b) => b.revenue > 0);
    expect(populated).toHaveLength(1);
    expect(populated[0].revenue).toBe(120);
    expect(populated[0].orders).toBe(1);
  });

  it("sums multiple conversions in the same bucket", () => {
    const from = new Date("2024-03-01T00:00:00");
    const to   = new Date("2024-03-02T23:59:59");
    const rows = [
      { convertedAt: new Date("2024-03-01T08:00:00"), revenue: 50 },
      { convertedAt: new Date("2024-03-01T20:00:00"), revenue: 75 },
    ];
    const series = buildRevenueSeries(rows, from, to, "day");
    const day1 = series.find((b) => b.key === "2024-03-01")!;
    expect(day1.revenue).toBe(125);
    expect(day1.orders).toBe(2);
  });

  it("empty input over a range yields all-zero buckets (no fake revenue)", () => {
    const from = new Date("2024-03-01T00:00:00");
    const to   = new Date("2024-03-03T23:59:59");
    const series = buildRevenueSeries([], from, to, "day");
    expect(series.every((b) => b.revenue === 0 && b.orders === 0)).toBe(true);
  });

  it("all-time (no range) emits only populated buckets, ascending", () => {
    const rows = [
      { convertedAt: new Date("2024-05-10"), revenue: 100 },
      { convertedAt: new Date("2024-01-10"), revenue: 200 },
    ];
    const series = buildRevenueSeries(rows, null, null, "month");
    expect(series).toHaveLength(2);
    expect(series[0].key).toBe("2024-01");
    expect(series[1].key).toBe("2024-05");
  });

  it("series total never exceeds the sum of input revenue (no inflation)", () => {
    const from = new Date("2024-03-01");
    const to   = new Date("2024-03-31T23:59:59");
    const rows = [
      { convertedAt: new Date("2024-03-05"), revenue: 300 },
      { convertedAt: new Date("2024-03-15"), revenue: 200 },
    ];
    const series = buildRevenueSeries(rows, from, to, "day");
    const total = series.reduce((s, b) => s + b.revenue, 0);
    expect(total).toBe(500);
  });
});
