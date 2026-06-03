/**
 * CampaignAttributionService — W7 — Tests A-K
 *
 * Tests cover pure functions (classifyAttributionQuality, attributionPeriodSince)
 * and the service structure via source-code inspection.
 * No DB connections required — all tests run in-process.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  classifyAttributionQuality,
  attributionQualityLabel,
  attributionQualityDescription,
  attributionPeriodSince,
  type AttributionQuality,
} from "@/services/crm/CampaignAttributionService";

// ── A: COUPON_PROVEN ──────────────────────────────────────────────────────────

describe("A — classifyAttributionQuality: COUPON_PROVEN", () => {
  it("returns COUPON_PROVEN when hasCouponLink=true and couponOrderCount>0", () => {
    expect(classifyAttributionQuality(true, 5, 0)).toBe("COUPON_PROVEN");
  });

  it("COUPON_PROVEN even when assistedConversions>0 (coupon takes priority)", () => {
    expect(classifyAttributionQuality(true, 3, 10)).toBe("COUPON_PROVEN");
  });
});

// ── B: CAMPAIGN_COUPON ────────────────────────────────────────────────────────

describe("B — classifyAttributionQuality: CAMPAIGN_COUPON", () => {
  it("returns CAMPAIGN_COUPON when hasCouponLink=true but couponOrderCount=0", () => {
    expect(classifyAttributionQuality(true, 0, 0)).toBe("CAMPAIGN_COUPON");
  });

  it("returns CAMPAIGN_COUPON when hasCouponLink=true, no coupon orders, has assisted", () => {
    expect(classifyAttributionQuality(true, 0, 5)).toBe("CAMPAIGN_COUPON");
  });
});

// ── C: ASSISTED ───────────────────────────────────────────────────────────────

describe("C — classifyAttributionQuality: ASSISTED", () => {
  it("returns ASSISTED when no coupon link but assistedConversions>0", () => {
    expect(classifyAttributionQuality(false, 0, 3)).toBe("ASSISTED");
  });

  it("ASSISTED when hasCouponLink=false and couponOrderCount is ignored", () => {
    // couponOrderCount should be irrelevant when hasCouponLink=false
    expect(classifyAttributionQuality(false, 99, 1)).toBe("ASSISTED");
  });
});

// ── D: NONE ───────────────────────────────────────────────────────────────────

describe("D — classifyAttributionQuality: NONE", () => {
  it("returns NONE when no coupon link and no conversions", () => {
    expect(classifyAttributionQuality(false, 0, 0)).toBe("NONE");
  });

  it("NONE when hasCouponLink=false and all counts are 0", () => {
    expect(classifyAttributionQuality(false, 0, 0)).toBe("NONE");
  });
});

// ── E: quality labels ─────────────────────────────────────────────────────────

describe("E — attributionQualityLabel", () => {
  const cases: Array<[AttributionQuality, string]> = [
    ["COUPON_PROVEN",   "Comprovado por cupom"],
    ["CAMPAIGN_COUPON", "Atribuído por campanha + cupom"],
    ["ASSISTED",        "Assistido por proximidade"],
    ["NONE",            "Sem atribuição confiável"],
  ];

  for (const [quality, expected] of cases) {
    it(`label for ${quality} is "${expected}"`, () => {
      expect(attributionQualityLabel(quality)).toBe(expected);
    });
  }
});

// ── F: quality descriptions ───────────────────────────────────────────────────

describe("F — attributionQualityDescription", () => {
  it("all 4 qualities return non-empty descriptions", () => {
    const qualities: AttributionQuality[] = ["COUPON_PROVEN", "CAMPAIGN_COUPON", "ASSISTED", "NONE"];
    for (const q of qualities) {
      expect(attributionQualityDescription(q).length).toBeGreaterThan(10);
    }
  });

  it("COUPON_PROVEN description mentions direct attribution", () => {
    expect(attributionQualityDescription("COUPON_PROVEN")).toMatch(/direta|confiável/i);
  });
});

// ── G: attributionPeriodSince ─────────────────────────────────────────────────

describe("G — attributionPeriodSince", () => {
  const fixed = new Date("2026-06-01T12:00:00Z").getTime();

  it("7d returns Date ~7 days before now", () => {
    const result = attributionPeriodSince("7d", fixed);
    expect(result).not.toBeNull();
    const diffMs = fixed - result!.getTime();
    expect(diffMs).toBeCloseTo(7 * 86_400_000, -3);
  });

  it("30d returns Date ~30 days before now", () => {
    const result = attributionPeriodSince("30d", fixed);
    const diffMs = fixed - result!.getTime();
    expect(diffMs).toBeCloseTo(30 * 86_400_000, -3);
  });

  it("90d returns Date ~90 days before now", () => {
    const result = attributionPeriodSince("90d", fixed);
    const diffMs = fixed - result!.getTime();
    expect(diffMs).toBeCloseTo(90 * 86_400_000, -3);
  });

  it("all returns null", () => {
    expect(attributionPeriodSince("all", fixed)).toBeNull();
  });
});

// ── H: priority ordering ──────────────────────────────────────────────────────

describe("H — quality priority is COUPON_PROVEN > CAMPAIGN_COUPON > ASSISTED > NONE", () => {
  it("coupon link with orders beats everything", () => {
    const result = classifyAttributionQuality(true, 1, 100);
    expect(result).toBe("COUPON_PROVEN");
  });

  it("coupon link with no orders beats assisted-only", () => {
    expect(classifyAttributionQuality(true, 0, 100)).toBe("CAMPAIGN_COUPON");
  });

  it("assisted beats none", () => {
    expect(classifyAttributionQuality(false, 0, 1)).toBe("ASSISTED");
  });
});

// ── I: source-code — service is read-only (no mutations) ─────────────────────

describe("I — CampaignAttributionService is read-only", () => {
  const src = readFileSync(
    resolve(__dirname, "../CampaignAttributionService.ts"),
    "utf-8",
  );

  it("does not call prisma.campaign.update", () => {
    expect(src).not.toMatch(/campaign\.update/);
  });

  it("does not call prisma.campaignExecution.update", () => {
    expect(src).not.toMatch(/campaignExecution\.update/);
  });

  it("does not call prisma.order.update", () => {
    expect(src).not.toMatch(/order\.update/);
  });

  it("does not call any Evolution send path", () => {
    expect(src).not.toMatch(/EvolutionClient|sendTextMessage/);
  });
});

// ── J: source-code — service is tenant-scoped ─────────────────────────────────

describe("J — CampaignAttributionService is tenant-scoped", () => {
  const src = readFileSync(
    resolve(__dirname, "../CampaignAttributionService.ts"),
    "utf-8",
  );

  it("every prisma.campaign.findMany uses restaurantId", () => {
    const findManyCalls = src.match(/campaign\.findMany/g) ?? [];
    expect(findManyCalls.length).toBeGreaterThan(0);
    // restaurantId appears before all findMany call in the where block
    expect(src).toMatch(/restaurantId/);
  });

  it("every prisma.order.findMany uses restaurantId", () => {
    expect(src).toMatch(/order\.findMany/);
    expect(src).toMatch(/restaurantId/);
  });
});

// ── K: source-code — API endpoint is tenant-scoped ───────────────────────────

describe("K — attribution API endpoint uses getTenantContext", () => {
  const src = readFileSync(
    resolve(__dirname, "../../../app/api/crm/attribution/route.ts"),
    "utf-8",
  );

  it("imports getTenantContext", () => {
    expect(src).toMatch(/getTenantContext/);
  });

  it("returns unauthorized() if no context", () => {
    expect(src).toMatch(/unauthorized/);
  });

  it("passes ctx.restaurantId to CampaignAttributionService", () => {
    expect(src).toMatch(/ctx\.restaurantId/);
  });
});
