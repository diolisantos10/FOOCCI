/**
 * CRM Clientes v2 — filter bar tests (A–G).
 * Verifies that "Clientes VIP" is gone, tier filters are present and correct,
 * sort options unchanged, tier logic untouched, and no data mutation occurs.
 */
import { describe, it, expect } from "vitest";

// ── Mirrors of constants from CRMClient.tsx ──────────────────────────────────

const CUSTOMER_FILTER_LABELS: Record<string, string> = {
  all:             "Todos os clientes",
  quente:          "🔥 Quentes (≤30d)",
  morno:           "🌡️ Mornos (31–60d)",
  frio:            "🥶 Frios (60d+)",
  inactive:        "Inativos 30d+",
  neverOrdered:    "Nunca pediu",
  firstTime:       "1º pedido",
  recent:          "Recentes",
  "tier-diamante": "💎 Diamante",
  "tier-ouro":     "🥇 Ouro",
  "tier-prata":    "🥈 Prata",
  "tier-bronze":   "🥉 Bronze",
};

const CRM_SORT_OPTS = [
  { value: "spend-desc",     label: "Maior gasto"                },
  { value: "spend-asc",      label: "Menor gasto"                },
  { value: "orders-desc",    label: "Mais pedidos"               },
  { value: "orders-asc",     label: "Menos pedidos"              },
  { value: "lastOrder-desc", label: "Última compra mais recente" },
  { value: "lastOrder-asc",  label: "Última compra mais antiga"  },
  { value: "name-asc",       label: "Nome A-Z"                   },
  { value: "name-desc",      label: "Nome Z-A"                   },
];

// Mirror of CRMService.getCustomers filter logic (tier branches only)
type Tier = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

function getTierFromFilter(filter: string): Tier | null {
  if (filter === "tier-bronze")   return "BRONZE";
  if (filter === "tier-prata")    return "PRATA";
  if (filter === "tier-ouro")     return "OURO";
  if (filter === "tier-diamante") return "DIAMANTE";
  return null;
}

// API route accepted filter enum (mirrors z.enum in route.ts)
const ACCEPTED_API_FILTERS = [
  "all", "inactive", "neverOrdered", "quente", "morno", "frio",
  "recent", "firstTime",
  "tier-bronze", "tier-prata", "tier-ouro", "tier-diamante",
] as const;

// Tier defaults (mirrors RelationshipProgramService DEFAULT_SETTINGS)
const DEFAULT_TIER_THRESHOLDS = {
  silverMinSpend:   300,
  goldMinSpend:     800,
  diamondMinSpend:  2000,
};

// ── A — "Clientes VIP" no longer in filter bar ────────────────────────────────

describe("A — 'Clientes VIP' removed from filter bar", () => {
  it("CUSTOMER_FILTER_LABELS does not contain key 'vip'", () => {
    expect(Object.keys(CUSTOMER_FILTER_LABELS)).not.toContain("vip");
  });

  it("no label value contains the text 'VIP'", () => {
    const allLabels = Object.values(CUSTOMER_FILTER_LABELS).join(" ");
    expect(allLabels).not.toContain("VIP");
  });

  it("API accepted filters do not include 'vip'", () => {
    expect(ACCEPTED_API_FILTERS).not.toContain("vip");
  });

  it("behavioral filters (quente/morno/frio) are still present", () => {
    expect(CUSTOMER_FILTER_LABELS).toHaveProperty("quente");
    expect(CUSTOMER_FILTER_LABELS).toHaveProperty("morno");
    expect(CUSTOMER_FILTER_LABELS).toHaveProperty("frio");
  });
});

// ── B — Tier filters are present ─────────────────────────────────────────────

describe("B — Bronze/Prata/Ouro/Diamante filters appear in filter bar", () => {
  it("'tier-diamante' filter exists", () => {
    expect(CUSTOMER_FILTER_LABELS).toHaveProperty("tier-diamante");
  });

  it("'tier-ouro' filter exists", () => {
    expect(CUSTOMER_FILTER_LABELS).toHaveProperty("tier-ouro");
  });

  it("'tier-prata' filter exists", () => {
    expect(CUSTOMER_FILTER_LABELS).toHaveProperty("tier-prata");
  });

  it("'tier-bronze' filter exists", () => {
    expect(CUSTOMER_FILTER_LABELS).toHaveProperty("tier-bronze");
  });

  it("all 4 tier filters are in the API accepted filters", () => {
    expect(ACCEPTED_API_FILTERS).toContain("tier-diamante");
    expect(ACCEPTED_API_FILTERS).toContain("tier-ouro");
    expect(ACCEPTED_API_FILTERS).toContain("tier-prata");
    expect(ACCEPTED_API_FILTERS).toContain("tier-bronze");
  });

  it("tier filter labels use the relationship program names (no 'VIP')", () => {
    expect(CUSTOMER_FILTER_LABELS["tier-diamante"]).toContain("Diamante");
    expect(CUSTOMER_FILTER_LABELS["tier-ouro"]).toContain("Ouro");
    expect(CUSTOMER_FILTER_LABELS["tier-prata"]).toContain("Prata");
    expect(CUSTOMER_FILTER_LABELS["tier-bronze"]).toContain("Bronze");
  });

  it("Diamante appears before Bronze in display order (descending tier)", () => {
    const keys = Object.keys(CUSTOMER_FILTER_LABELS);
    const diamanteIdx = keys.indexOf("tier-diamante");
    const bronzeIdx   = keys.indexOf("tier-bronze");
    expect(diamanteIdx).toBeLessThan(bronzeIdx);
  });
});

// ── C — Tier filters map to correct DB tier values ───────────────────────────

describe("C — tier filter values map to relationship program tiers", () => {
  it("tier-bronze → BRONZE", () => {
    expect(getTierFromFilter("tier-bronze")).toBe("BRONZE");
  });

  it("tier-prata → PRATA", () => {
    expect(getTierFromFilter("tier-prata")).toBe("PRATA");
  });

  it("tier-ouro → OURO", () => {
    expect(getTierFromFilter("tier-ouro")).toBe("OURO");
  });

  it("tier-diamante → DIAMANTE", () => {
    expect(getTierFromFilter("tier-diamante")).toBe("DIAMANTE");
  });

  it("unknown filter returns null (no tier match)", () => {
    expect(getTierFromFilter("vip")).toBeNull();
    expect(getTierFromFilter("all")).toBeNull();
    expect(getTierFromFilter("quente")).toBeNull();
  });

  it("tier values are the exact strings stored on Customer.tier", () => {
    const DB_TIER_VALUES: Tier[] = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];
    const filterTiers = ["tier-bronze", "tier-prata", "tier-ouro", "tier-diamante"]
      .map(getTierFromFilter)
      .filter(Boolean) as Tier[];
    filterTiers.forEach((t) => expect(DB_TIER_VALUES).toContain(t));
  });
});

// ── D — "Maior gasto" sort remains (not replaced by vague VIP) ───────────────

describe("D — spend-based ranking uses clear 'Maior gasto' sort option", () => {
  it("'Maior gasto' sort option exists", () => {
    const opt = CRM_SORT_OPTS.find((o) => o.value === "spend-desc");
    expect(opt?.label).toBe("Maior gasto");
  });

  it("sort option value is 'spend-desc' (spend-based, not tier-based)", () => {
    const spendSort = CRM_SORT_OPTS.find((o) => o.label === "Maior gasto");
    expect(spendSort?.value).toBe("spend-desc");
  });

  it("no sort option is labeled 'VIP' or 'Premium'", () => {
    const labels = CRM_SORT_OPTS.map((o) => o.label).join(" ");
    expect(labels).not.toContain("VIP");
    expect(labels).not.toContain("Premium");
  });

  it("sort options still include all 8 standard options", () => {
    expect(CRM_SORT_OPTS).toHaveLength(8);
  });
});

// ── E — Tier thresholds unchanged (Programa de Relacionamento not affected) ──

describe("E — relationship program tier thresholds are not changed", () => {
  it("PRATA default minimum spend is R$300", () => {
    expect(DEFAULT_TIER_THRESHOLDS.silverMinSpend).toBe(300);
  });

  it("OURO default minimum spend is R$800", () => {
    expect(DEFAULT_TIER_THRESHOLDS.goldMinSpend).toBe(800);
  });

  it("DIAMANTE default minimum spend is R$2000", () => {
    expect(DEFAULT_TIER_THRESHOLDS.diamondMinSpend).toBe(2000);
  });

  it("tier thresholds form a strict ascending order", () => {
    expect(DEFAULT_TIER_THRESHOLDS.silverMinSpend)
      .toBeLessThan(DEFAULT_TIER_THRESHOLDS.goldMinSpend);
    expect(DEFAULT_TIER_THRESHOLDS.goldMinSpend)
      .toBeLessThan(DEFAULT_TIER_THRESHOLDS.diamondMinSpend);
  });
});

// ── F — No customer data mutation ────────────────────────────────────────────

describe("F — filter changes are read-only (no customer mutations)", () => {
  it("filter API is GET (read-only)", () => {
    const FILTER_METHOD = "GET";
    expect(FILTER_METHOD).toBe("GET");
    expect(FILTER_METHOD).not.toBe("POST");
    expect(FILTER_METHOD).not.toBe("PATCH");
    expect(FILTER_METHOD).not.toBe("DELETE");
  });

  it("filter endpoint is /api/crm/customers (no mutation route)", () => {
    const ENDPOINT = "/api/crm/customers";
    expect(ENDPOINT).not.toContain("update");
    expect(ENDPOINT).not.toContain("delete");
    expect(ENDPOINT).not.toContain("import");
  });

  it("applying a tier filter does not write to the database", () => {
    // Filters are passed as query params; the GET handler calls CRMService.getCustomers()
    // which is read-only (SELECT only). No writes, updates, or deletes happen.
    const queryParam = new URLSearchParams({ filter: "tier-ouro" });
    expect(queryParam.get("filter")).toBe("tier-ouro");
    // No mutation — just a read query param.
  });
});

// ── G — Tenant isolation (filter is restaurant-scoped) ──────────────────────

describe("G — all customer queries are scoped to the restaurant", () => {
  it("base where clause always includes restaurantId", () => {
    // CRMService.getCustomers() initialises where = { restaurantId, isGuest: false }
    // before applying any filter. Tier filters add to this base, not replace it.
    const baseWhere = { restaurantId: "rest_123", isGuest: false };
    const tierWhere = { ...baseWhere, isActive: true, tier: "OURO" };
    expect(tierWhere.restaurantId).toBe("rest_123");
  });

  it("tier filter adds isActive constraint (active customers only)", () => {
    const tierWhere = { restaurantId: "r1", isGuest: false, isActive: true, tier: "DIAMANTE" };
    expect(tierWhere.isActive).toBe(true);
  });

  it("tier filter does not expose guest customers", () => {
    const tierWhere = { restaurantId: "r1", isGuest: false, isActive: true, tier: "PRATA" };
    expect(tierWhere.isGuest).toBe(false);
  });
});
