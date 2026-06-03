import { describe, it, expect } from "vitest";
import {
  resolveCustomerSegment,
  resolveCustomerTier,
  resolveCustomerClassification,
  CUSTOMER_SEGMENT_DEFAULTS,
  type SegmentInput,
  type TierInput,
  type ClassificationInput,
} from "../CustomerSegmentService";
import { DEFAULT_SEGMENT_CONFIG, type SegmentConfig } from "@/lib/crm-segments";
import { DEFAULT_SETTINGS, type TierSettingsInput } from "../RelationshipProgramService";

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function baseSegInput(overrides: Partial<SegmentInput> = {}): SegmentInput {
  return {
    lastOrderAt:         null,
    importedLastOrderAt: null,
    totalOrders:         0,
    importedOrderCount:  null,
    cfg:                 DEFAULT_SEGMENT_CONFIG,
    ...overrides,
  };
}

function baseTierInput(overrides: Partial<TierInput> = {}): TierInput {
  return {
    totalSpend:         0,
    totalOrders:        0,
    importedTotalSpent: null,
    importedOrderCount: null,
    settings:           DEFAULT_SETTINGS,
    ...overrides,
  };
}

// ── A. SEM_PEDIDOS — no native, no imported ────────────────────────────────────

describe("Test A — SEM_PEDIDOS: no orders at all", () => {
  it("returns SEM_PEDIDOS when lastOrderAt=null and no imported data", () => {
    const result = resolveCustomerSegment(baseSegInput());
    expect(result.segment).toBe("SEM_PEDIDOS");
    expect(result.daysAgo).toBeNull();
    expect(result.source).toBe("none");
  });
});

// ── B. QUENTE — native order 5 days ago ───────────────────────────────────────

describe("Test B — QUENTE: native order 5 days ago", () => {
  it("classifies as QUENTE with source=native", () => {
    const result = resolveCustomerSegment(baseSegInput({
      lastOrderAt:   daysAgo(5),
      totalOrders:   3,
    }));
    expect(result.segment).toBe("QUENTE");
    expect(result.source).toBe("native");
    expect(result.daysAgo).toBeGreaterThanOrEqual(4);
    expect(result.daysAgo).toBeLessThanOrEqual(6);
  });
});

// ── C. MORNO — native order 45 days ago ───────────────────────────────────────

describe("Test C — MORNO: native order 45 days ago", () => {
  it("classifies as MORNO", () => {
    const result = resolveCustomerSegment(baseSegInput({
      lastOrderAt: daysAgo(45),
      totalOrders: 2,
    }));
    expect(result.segment).toBe("MORNO");
    expect(result.source).toBe("native");
  });
});

// ── D. FRIO — native order 90 days ago (hotMaxDays=30, warmMaxDays=60, lostMinDays=120) ──

describe("Test D — FRIO: native order 90 days ago", () => {
  it("classifies as FRIO (between warmMaxDays and lostMinDays)", () => {
    const result = resolveCustomerSegment(baseSegInput({
      lastOrderAt: daysAgo(90),
      totalOrders: 1,
    }));
    expect(result.segment).toBe("FRIO");
  });
});

// ── E. PERDIDO — native order 150 days ago (lostMinDays=120) ─────────────────

describe("Test E — PERDIDO: native order 150 days ago", () => {
  it("classifies as PERDIDO when past lostMinDays", () => {
    const result = resolveCustomerSegment(baseSegInput({
      lastOrderAt: daysAgo(150),
      totalOrders: 1,
    }));
    expect(result.segment).toBe("PERDIDO");
    expect(result.source).toBe("native");
  });
});

// ── F. Imported-only — importedLastOrderAt 10 days ago ───────────────────────

describe("Test F — imported-only: importedLastOrderAt 10 days ago", () => {
  it("classifies as QUENTE with source=imported", () => {
    const result = resolveCustomerSegment(baseSegInput({
      importedLastOrderAt: daysAgo(10),
      importedOrderCount:  5,
    }));
    expect(result.segment).toBe("QUENTE");
    expect(result.source).toBe("imported");
  });
});

// ── G. Mixed — native 20d, imported 200d → QUENTE (native wins) ──────────────

describe("Test G — mixed data: native order 20d ago wins over imported 200d ago", () => {
  it("uses native lastOrderAt and returns QUENTE, source=mixed", () => {
    const result = resolveCustomerSegment(baseSegInput({
      lastOrderAt:         daysAgo(20),
      totalOrders:         2,
      importedLastOrderAt: daysAgo(200),
      importedOrderCount:  10,
    }));
    expect(result.segment).toBe("QUENTE");
    expect(result.source).toBe("mixed");
  });
});

// ── H. Tier: bronze with default settings ─────────────────────────────────────

describe("Test H — Tier: BRONZE with default settings", () => {
  it("returns BRONZE for spend < R$300", () => {
    const result = resolveCustomerTier(baseTierInput({ totalSpend: 100, totalOrders: 1 }));
    expect(result.tier).toBe("BRONZE");
    expect(result.effectiveSpend).toBe(100);
    expect(result.source).toBe("native");
  });

  it("returns PRATA for spend >= R$300", () => {
    const result = resolveCustomerTier(baseTierInput({ totalSpend: 350, totalOrders: 2 }));
    expect(result.tier).toBe("PRATA");
  });

  it("returns OURO for spend >= R$800", () => {
    const result = resolveCustomerTier(baseTierInput({ totalSpend: 900, totalOrders: 5 }));
    expect(result.tier).toBe("OURO");
  });

  it("returns DIAMANTE for spend >= R$2000", () => {
    const result = resolveCustomerTier(baseTierInput({ totalSpend: 2500, totalOrders: 10 }));
    expect(result.tier).toBe("DIAMANTE");
  });
});

// ── I. Custom tier settings: R$500 qualifies for OURO (goldMinSpend=500) ─────

describe("Test I — custom tier settings", () => {
  const customSettings: TierSettingsInput = {
    ...DEFAULT_SETTINGS,
    goldMinSpend: 500,
  };

  it("promotes to OURO at R$500 when goldMinSpend=500", () => {
    const result = resolveCustomerTier(baseTierInput({
      totalSpend:  520,
      totalOrders: 3,
      settings:    customSettings,
    }));
    expect(result.tier).toBe("OURO");
  });

  it("stays PRATA at R$499 with goldMinSpend=500", () => {
    const result = resolveCustomerTier(baseTierInput({
      totalSpend:  499,
      totalOrders: 2,
      settings:    customSettings,
    }));
    expect(result.tier).toBe("PRATA");
  });
});

// ── J. Tier: imported-only customer ──────────────────────────────────────────

describe("Test J — Tier: imported-only customer", () => {
  it("uses importedTotalSpent when no native orders, source=imported", () => {
    const result = resolveCustomerTier(baseTierInput({
      totalSpend:         0,
      totalOrders:        0,
      importedTotalSpent: 850,
      importedOrderCount: 8,
    }));
    expect(result.tier).toBe("OURO");
    expect(result.effectiveSpend).toBe(850);
    expect(result.source).toBe("imported");
  });
});

// ── K. PERDIDO threshold: lostMinDays=90, customer at 95 days ────────────────

describe("Test K — PERDIDO threshold respected", () => {
  const cfg: SegmentConfig = { hotMaxDays: 30, warmMaxDays: 60, lostMinDays: 90 };

  it("returns PERDIDO at 95 days when lostMinDays=90", () => {
    const result = resolveCustomerSegment(baseSegInput({
      lastOrderAt: daysAgo(95),
      totalOrders: 1,
      cfg,
    }));
    expect(result.segment).toBe("PERDIDO");
  });

  it("returns FRIO at 85 days when lostMinDays=90", () => {
    const result = resolveCustomerSegment(baseSegInput({
      lastOrderAt: daysAgo(85),
      totalOrders: 1,
      cfg,
    }));
    expect(result.segment).toBe("FRIO");
  });
});

// ── L. Thresholds from segmentConfig: hotMaxDays=14 → 20d is MORNO ───────────

describe("Test L — configurable hotMaxDays", () => {
  const cfg: SegmentConfig = { hotMaxDays: 14, warmMaxDays: 60, lostMinDays: 120 };

  it("classifies 20-day-old order as MORNO when hotMaxDays=14", () => {
    const result = resolveCustomerSegment(baseSegInput({
      lastOrderAt: daysAgo(20),
      totalOrders: 1,
      cfg,
    }));
    expect(result.segment).toBe("MORNO");
  });

  it("classifies 10-day-old order as QUENTE when hotMaxDays=14", () => {
    const result = resolveCustomerSegment(baseSegInput({
      lastOrderAt: daysAgo(10),
      totalOrders: 1,
      cfg,
    }));
    expect(result.segment).toBe("QUENTE");
  });
});

// ── Classification ─────────────────────────────────────────────────────────────

describe("resolveCustomerClassification", () => {
  it("combines segment and tier correctly for a native customer", () => {
    const input: ClassificationInput = {
      lastOrderAt:         daysAgo(5),
      importedLastOrderAt: null,
      totalOrders:         3,
      importedOrderCount:  null,
      totalSpend:          450,
      importedTotalSpent:  null,
      cfg:                 DEFAULT_SEGMENT_CONFIG,
      settings:            DEFAULT_SETTINGS,
    };
    const result = resolveCustomerClassification(input);
    expect(result.segment).toBe("QUENTE");
    expect(result.tier).toBe("PRATA");
    expect(result.source).toBe("native");
  });

  it("correctly classifies a PERDIDO + OURO imported customer", () => {
    const input: ClassificationInput = {
      lastOrderAt:         null,
      importedLastOrderAt: daysAgo(200),
      totalOrders:         0,
      importedOrderCount:  15,
      totalSpend:          0,
      importedTotalSpent:  900,
      cfg:                 DEFAULT_SEGMENT_CONFIG,
      settings:            DEFAULT_SETTINGS,
    };
    const result = resolveCustomerClassification(input);
    expect(result.segment).toBe("PERDIDO");
    expect(result.tier).toBe("OURO");
    expect(result.source).toBe("imported");
  });

  it("exposes CUSTOMER_SEGMENT_DEFAULTS as convenience constant", () => {
    expect(CUSTOMER_SEGMENT_DEFAULTS.cfg).toBe(DEFAULT_SEGMENT_CONFIG);
    expect(CUSTOMER_SEGMENT_DEFAULTS.settings).toBe(DEFAULT_SETTINGS);
  });
});

// ── DataSource tracking ────────────────────────────────────────────────────────

describe("DataSource tracking", () => {
  it("source=none when no native and no imported data", () => {
    const result = resolveCustomerSegment(baseSegInput());
    expect(result.source).toBe("none");
  });

  it("source=mixed when both native and imported present", () => {
    const result = resolveCustomerSegment(baseSegInput({
      lastOrderAt:         daysAgo(10),
      totalOrders:         2,
      importedLastOrderAt: daysAgo(100),
      importedOrderCount:  5,
    }));
    expect(result.source).toBe("mixed");
  });
});
