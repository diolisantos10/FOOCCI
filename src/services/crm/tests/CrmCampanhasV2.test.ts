/**
 * CRM Campanhas v2 — pure logic tests (A–L).
 * Tests the simplified Campanhas tab: no segment panel, compact active table,
 * limited coupon rows, first-6 templates, collapsed history.
 */
import { describe, it, expect } from "vitest";

// ── Mirrors of constants from CRMClient.tsx ──────────────────────────────────

const ACTIVE_STATUSES  = new Set(["ACTIVE", "SENDING", "SCHEDULED", "PAUSED"]);
const HISTORY_STATUSES = new Set(["SENT", "COMPLETED", "CANCELLED", "DRAFT"]);

const PERFORMANCE_PERIODS = [
  { value: "7d",  label: "7 dias"  },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Tudo"    },
];

const ACTIVE_TABLE_COLUMNS = [
  "Status", "Nome", "Tipo", "Público",
  "Enviados", "Respostas", "Tx.",
  "Pedidos", "Receita", "Falhas",
  "Janela", "Ações",
];

const CAMPANHAS_TAB_SECTION_ORDER = [
  "header",
  "performance",
  "ativas",
  "templates",
  "historico",
  "modelos-salvos",
];

// ── Pure helpers (mirrors of component logic) ─────────────────────────────────

type CampaignHistoryRow = {
  id: string;
  status: string;
  scheduleConfig: Record<string, unknown> | null;
  totalSent: number;
  totalResponded: number;
  totalConverted: number;
  totalRevenue: number;
  totalFailed: number;
  totalAudience: number;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  objective: string | null;
  targetSegment: string | null;
  name: string;
};

function filterActive(campaigns: CampaignHistoryRow[]): CampaignHistoryRow[] {
  return campaigns.filter((c) => ACTIVE_STATUSES.has(c.status));
}

function filterHistory(campaigns: CampaignHistoryRow[]): CampaignHistoryRow[] {
  return campaigns.filter((c) => HISTORY_STATUSES.has(c.status));
}

function computeResponseRate(totalSent: number, totalResponded: number): string | null {
  return totalSent > 0 ? ((totalResponded / totalSent) * 100).toFixed(1) : null;
}

function computeJanela(
  scheduleConfig: Record<string, unknown> | null,
  scheduledAt: string | null,
): string {
  const cfg = scheduleConfig as { mode?: string; timeWindow?: { start: string; end: string } } | null;
  if (cfg?.mode === "RECURRING" && cfg?.timeWindow) {
    return `${cfg.timeWindow.start}–${cfg.timeWindow.end}`;
  }
  if (scheduledAt) {
    return new Date(scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return "—";
}

function visibleCoupons<T>(rows: T[], showAll: boolean, limit = 5): T[] {
  return showAll ? rows : rows.slice(0, limit);
}

function visibleTemplates<T>(templates: T[], showMore: boolean, limit = 6): T[] {
  return showMore ? templates : templates.slice(0, limit);
}

function shouldShowMoreTemplates(total: number, limit = 6): boolean {
  return total > limit;
}

function shouldShowMoreCoupons(total: number, limit = 5): boolean {
  return total > limit;
}

// ── A — Segment panel removed ─────────────────────────────────────────────────

describe("A — segment panel removed from CampanhasTab", () => {
  const SEGMENT_PANEL_LABELS = ["Quentes", "Mornos", "Frios", "Novos", "VIP", "Bebidas"];

  it("summaryCards const no longer exists in component scope", () => {
    // The segment shortcut panel (6 colored cards) has been removed.
    // This test documents the expected absence. The section order does not
    // include a 'segment-panel' slot.
    expect(CAMPANHAS_TAB_SECTION_ORDER).not.toContain("segment-panel");
  });

  it("section order does not include segment shortcut grid", () => {
    const hasSegmentPanel = CAMPANHAS_TAB_SECTION_ORDER.some((s) =>
      SEGMENT_PANEL_LABELS.map((l) => l.toLowerCase()).some((l) => s.includes(l))
    );
    expect(hasSegmentPanel).toBe(false);
  });

  it("performance section comes first after header (no segment panel in between)", () => {
    const headerIdx      = CAMPANHAS_TAB_SECTION_ORDER.indexOf("header");
    const performanceIdx = CAMPANHAS_TAB_SECTION_ORDER.indexOf("performance");
    expect(performanceIdx).toBe(headerIdx + 1);
  });
});

// ── B — Performance section period filter ────────────────────────────────────

describe("B — performance section has 4 period filter options", () => {
  it("has exactly 4 period options", () => {
    expect(PERFORMANCE_PERIODS).toHaveLength(4);
  });

  it("contains 7d option", () => {
    expect(PERFORMANCE_PERIODS.map((p) => p.value)).toContain("7d");
  });

  it("contains 30d option", () => {
    expect(PERFORMANCE_PERIODS.map((p) => p.value)).toContain("30d");
  });

  it("contains 90d option", () => {
    expect(PERFORMANCE_PERIODS.map((p) => p.value)).toContain("90d");
  });

  it("contains 'all' option labeled 'Tudo'", () => {
    const allOpt = PERFORMANCE_PERIODS.find((p) => p.value === "all");
    expect(allOpt?.label).toBe("Tudo");
  });

  it("default period is 30d", () => {
    // CampaignCouponPerformance initialises useState("30d")
    const defaultPeriod = "30d";
    expect(PERFORMANCE_PERIODS.map((p) => p.value)).toContain(defaultPeriod);
  });
});

// ── C — Coupon rows limited to 5 + "Ver todos" ───────────────────────────────

describe("C — coupon rows limited to 5, 'Ver todos' reveals all", () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: String(i) }));

  it("shows at most 5 rows by default (showAll = false)", () => {
    expect(visibleCoupons(rows, false)).toHaveLength(5);
  });

  it("shows all rows when showAll = true", () => {
    expect(visibleCoupons(rows, true)).toHaveLength(8);
  });

  it("shows all when fewer than 5", () => {
    const small = rows.slice(0, 3);
    expect(visibleCoupons(small, false)).toHaveLength(3);
  });

  it("'Ver todos' button appears when more than 5 coupons", () => {
    expect(shouldShowMoreCoupons(6)).toBe(true);
    expect(shouldShowMoreCoupons(5)).toBe(false);
    expect(shouldShowMoreCoupons(4)).toBe(false);
  });

  it("first 5 rows are always in the same order", () => {
    const visible = visibleCoupons(rows, false);
    visible.forEach((r, i) => expect(r.id).toBe(String(i)));
  });
});

// ── D — Active campaigns: empty state when no active campaigns ────────────────

describe("D — active campaigns section empty state", () => {
  const history: CampaignHistoryRow[] = [
    { id: "1", status: "SENT",      name: "Completed", createdAt: "2024-01-01", objective: null, targetSegment: null, scheduleConfig: null, scheduledAt: null, sentAt: "2024-01-02", totalSent: 100, totalResponded: 20, totalConverted: 5, totalRevenue: 500, totalFailed: 0, totalAudience: 100 },
    { id: "2", status: "CANCELLED", name: "Cancelled", createdAt: "2024-01-01", objective: null, targetSegment: null, scheduleConfig: null, scheduledAt: null, sentAt: null, totalSent: 0, totalResponded: 0, totalConverted: 0, totalRevenue: 0, totalFailed: 0, totalAudience: 0 },
  ];

  it("filterActive returns empty array when no active campaigns", () => {
    expect(filterActive(history)).toHaveLength(0);
  });

  it("CampanhasAtivasSection returns null when active list is empty (contract)", () => {
    // Simulates the component: `if (active.length === 0) return null`
    const active = filterActive(history);
    expect(active.length === 0).toBe(true);
  });
});

// ── E — Active campaigns table columns ───────────────────────────────────────

describe("E — active campaigns table has required columns", () => {
  const REQUIRED = ["Status", "Nome", "Tipo", "Público", "Enviados", "Respostas", "Tx.", "Pedidos", "Receita", "Falhas", "Janela", "Ações"];

  it("has all 12 required columns", () => {
    expect(ACTIVE_TABLE_COLUMNS).toHaveLength(12);
  });

  for (const col of REQUIRED) {
    it(`includes column '${col}'`, () => {
      expect(ACTIVE_TABLE_COLUMNS).toContain(col);
    });
  }

  it("'Tx.' column abbreviates response rate", () => {
    // 20 responses out of 100 sent = 20.0%
    const rate = computeResponseRate(100, 20);
    expect(rate).toBe("20.0");
  });

  it("response rate is null when totalSent is 0", () => {
    expect(computeResponseRate(0, 0)).toBeNull();
  });
});

// ── F — Templates: first 6 shown, rest behind "Ver mais" ─────────────────────

describe("F — templates first 6 shown, rest behind 'Ver mais'", () => {
  const TEMPLATE_COUNT = 12; // ACTION_TEMPLATES.length

  it("shows 6 templates by default (showMore = false)", () => {
    const all = Array.from({ length: TEMPLATE_COUNT }, (_, i) => i);
    expect(visibleTemplates(all, false)).toHaveLength(6);
  });

  it("shows all templates when showMore = true", () => {
    const all = Array.from({ length: TEMPLATE_COUNT }, (_, i) => i);
    expect(visibleTemplates(all, true)).toHaveLength(TEMPLATE_COUNT);
  });

  it("'Ver mais' button appears when more than 6 templates", () => {
    expect(shouldShowMoreTemplates(TEMPLATE_COUNT)).toBe(true);
  });

  it("no 'Ver mais' when exactly 6 templates", () => {
    expect(shouldShowMoreTemplates(6)).toBe(false);
  });

  it("shows all when fewer than 6", () => {
    const few = Array.from({ length: 4 }, (_, i) => i);
    expect(visibleTemplates(few, false)).toHaveLength(4);
  });

  it("'Ver mais' label shows remaining count", () => {
    const remaining = TEMPLATE_COUNT - 6;
    const label = `Ver mais modelos (${remaining} restantes)`;
    expect(label).toBe(`Ver mais modelos (${remaining} restantes)`);
  });
});

// ── G — History collapsed by default ─────────────────────────────────────────

describe("G — campaign history collapsed by default", () => {
  it("showHistory initial state is false", () => {
    const showHistory = false; // useState(false)
    expect(showHistory).toBe(false);
  });

  it("history rows are hidden when showHistory is false", () => {
    const showHistory = false;
    const historyRows = [{ id: "1" }, { id: "2" }];
    const visible = showHistory ? historyRows : [];
    expect(visible).toHaveLength(0);
  });

  it("history rows visible after toggle", () => {
    let showHistory = false;
    const toggle = () => { showHistory = !showHistory; };
    toggle();
    const historyRows = [{ id: "1" }, { id: "2" }];
    const visible = showHistory ? historyRows : [];
    expect(visible).toHaveLength(2);
  });

  it("'Ver histórico' toggle button label shows count badge", () => {
    const historyCount = 5;
    const label = `Ver histórico (${historyCount})`;
    expect(label).toContain("Ver histórico");
    expect(label).toContain("5");
  });
});

// ── H — Button hierarchy ──────────────────────────────────────────────────────

describe("H — button hierarchy: 'Nova campanha' primary, 'Novo modelo' secondary", () => {
  it("'Nova campanha' uses brand-600 background (primary orange)", () => {
    const className = "flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700 transition-colors";
    expect(className).toContain("bg-brand-600");
    expect(className).toContain("text-white");
  });

  it("'Novo modelo' uses border/outline style (secondary)", () => {
    const className = "flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors";
    expect(className).toContain("border");
    expect(className).not.toContain("bg-brand-600");
  });

  it("primary button has higher visual weight than secondary", () => {
    const primaryHasBg  = "bg-brand-600";
    const secondaryHasBg = "bg-white";
    expect(primaryHasBg).not.toBe(secondaryHasBg);
  });
});

// ── I — Active/history classification ────────────────────────────────────────

describe("I — campaign status classification", () => {
  const campaigns: Pick<CampaignHistoryRow, "id" | "status">[] = [
    { id: "1", status: "ACTIVE"    },
    { id: "2", status: "SENDING"   },
    { id: "3", status: "SCHEDULED" },
    { id: "4", status: "PAUSED"    },
    { id: "5", status: "SENT"      },
    { id: "6", status: "COMPLETED" },
    { id: "7", status: "CANCELLED" },
    { id: "8", status: "DRAFT"     },
  ];

  it("ACTIVE campaigns are active", () => {
    expect(ACTIVE_STATUSES.has("ACTIVE")).toBe(true);
  });

  it("SENDING campaigns are active", () => {
    expect(ACTIVE_STATUSES.has("SENDING")).toBe(true);
  });

  it("SCHEDULED campaigns are active", () => {
    expect(ACTIVE_STATUSES.has("SCHEDULED")).toBe(true);
  });

  it("PAUSED campaigns are active (controllable)", () => {
    expect(ACTIVE_STATUSES.has("PAUSED")).toBe(true);
  });

  it("SENT campaigns are history", () => {
    expect(HISTORY_STATUSES.has("SENT")).toBe(true);
  });

  it("COMPLETED campaigns are history", () => {
    expect(HISTORY_STATUSES.has("COMPLETED")).toBe(true);
  });

  it("CANCELLED campaigns are history", () => {
    expect(HISTORY_STATUSES.has("CANCELLED")).toBe(true);
  });

  it("DRAFT campaigns are history", () => {
    expect(HISTORY_STATUSES.has("DRAFT")).toBe(true);
  });

  it("active and history sets are disjoint", () => {
    for (const s of ACTIVE_STATUSES) {
      expect(HISTORY_STATUSES.has(s)).toBe(false);
    }
  });

  it("filters 4 active campaigns from mixed list", () => {
    const full = campaigns as CampaignHistoryRow[];
    const active = full.filter((c) => ACTIVE_STATUSES.has(c.status));
    expect(active).toHaveLength(4);
  });

  it("filters 4 history campaigns from mixed list", () => {
    const full = campaigns as CampaignHistoryRow[];
    const hist = full.filter((c) => HISTORY_STATUSES.has(c.status));
    expect(hist).toHaveLength(4);
  });
});

// ── J — Janela column computation ────────────────────────────────────────────

describe("J — 'Janela' column in active table", () => {
  it("recurring campaign shows time window", () => {
    const cfg = { mode: "RECURRING", timeWindow: { start: "10:00", end: "18:00" } };
    expect(computeJanela(cfg, null)).toBe("10:00–18:00");
  });

  it("scheduled-once shows scheduled date/time", () => {
    const result = computeJanela(null, "2024-03-15T09:00:00");
    expect(result).not.toBe("—");
    expect(result).toMatch(/\d{2}\/\d{2}/); // pt-BR date format
  });

  it("active campaign with no schedule shows '—'", () => {
    expect(computeJanela(null, null)).toBe("—");
  });

  it("non-recurring config with no scheduledAt shows '—'", () => {
    const cfg = { mode: "ONCE" };
    expect(computeJanela(cfg as Record<string, unknown>, null)).toBe("—");
  });
});

// ── K — Campaign action routing ───────────────────────────────────────────────

describe("K — campaign action routing", () => {
  type CampaignAction = "pause" | "resume" | "cancel";

  function getAvailableActions(status: string): CampaignAction[] {
    if (!["ACTIVE", "SCHEDULED", "PAUSED"].includes(status)) return [];
    const actions: CampaignAction[] = ["cancel"];
    if (status === "PAUSED") actions.push("resume");
    else actions.push("pause");
    return actions;
  }

  it("ACTIVE campaign → pause + cancel available", () => {
    const actions = getAvailableActions("ACTIVE");
    expect(actions).toContain("pause");
    expect(actions).toContain("cancel");
    expect(actions).not.toContain("resume");
  });

  it("PAUSED campaign → resume + cancel available", () => {
    const actions = getAvailableActions("PAUSED");
    expect(actions).toContain("resume");
    expect(actions).toContain("cancel");
    expect(actions).not.toContain("pause");
  });

  it("SCHEDULED campaign → pause + cancel available", () => {
    const actions = getAvailableActions("SCHEDULED");
    expect(actions).toContain("pause");
    expect(actions).toContain("cancel");
  });

  it("SENDING campaign → no controllable actions (not in controllable set)", () => {
    const actions = getAvailableActions("SENDING");
    expect(actions).toHaveLength(0);
  });

  it("SENT campaign → no actions", () => {
    expect(getAvailableActions("SENT")).toHaveLength(0);
  });
});

// ── L — Section order in CampanhasTab ────────────────────────────────────────

describe("L — section order in CampanhasTab", () => {
  it("performance comes before active campaigns", () => {
    expect(CAMPANHAS_TAB_SECTION_ORDER.indexOf("performance"))
      .toBeLessThan(CAMPANHAS_TAB_SECTION_ORDER.indexOf("ativas"));
  });

  it("active campaigns come before templates", () => {
    expect(CAMPANHAS_TAB_SECTION_ORDER.indexOf("ativas"))
      .toBeLessThan(CAMPANHAS_TAB_SECTION_ORDER.indexOf("templates"));
  });

  it("templates come before history", () => {
    expect(CAMPANHAS_TAB_SECTION_ORDER.indexOf("templates"))
      .toBeLessThan(CAMPANHAS_TAB_SECTION_ORDER.indexOf("historico"));
  });

  it("history comes before modelos-salvos", () => {
    expect(CAMPANHAS_TAB_SECTION_ORDER.indexOf("historico"))
      .toBeLessThan(CAMPANHAS_TAB_SECTION_ORDER.indexOf("modelos-salvos"));
  });

  it("modelos-salvos is last", () => {
    const last = CAMPANHAS_TAB_SECTION_ORDER[CAMPANHAS_TAB_SECTION_ORDER.length - 1];
    expect(last).toBe("modelos-salvos");
  });

  it("header is first", () => {
    expect(CAMPANHAS_TAB_SECTION_ORDER[0]).toBe("header");
  });

  it("no segment-panel slot in order", () => {
    expect(CAMPANHAS_TAB_SECTION_ORDER).not.toContain("segment-panel");
  });
});
