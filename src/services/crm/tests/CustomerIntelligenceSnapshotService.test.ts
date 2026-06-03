import { describe, it, expect } from "vitest";
import {
  computeSnapshot,
  computeNextBestAction,
  buildCustomerIntelligenceContext,
  type SnapshotComputeInput,
} from "../CustomerIntelligenceSnapshotService";
import { DEFAULT_SEGMENT_CONFIG } from "@/lib/crm-segments";
import { DEFAULT_SETTINGS } from "../RelationshipProgramService";

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function baseInput(overrides: Partial<SnapshotComputeInput> = {}): SnapshotComputeInput {
  const { customer: customerOverride, ...rest } = overrides;
  return {
    customer: {
      id:                  "cust-1",
      name:                "Maria Silva",
      phone:               "+5511999990000",
      totalOrders:         0,
      totalSpend:          0,
      averageTicket:       null,
      lastOrderAt:         null,
      importedLastOrderAt: null,
      importedOrderCount:  null,
      importedTotalSpent:  null,
      hasOptedOut:         false,
      crmContactable:      true,
      contactStatus:       "CONTACTABLE",
      ...(customerOverride ?? {}),
    },
    favoriteProducts:      [],
    favoriteCategories:    [],
    lastProducts:          [],
    orderDates:            [],
    couponOrderCount:      0,
    campaignReceivedCount: 0,
    lastCampaignAt:        null,
    responseCount:         0,
    lastResponseAt:        null,
    lastOrderDelivered:    false,
    segmentConfig:         DEFAULT_SEGMENT_CONFIG,
    tierSettings:          DEFAULT_SETTINGS,
    ...rest,
  };
}

// ── Test A — high-value hot customer → VIP / review action ──────────────────────

describe("Test A — high-value hot customer", () => {
  it("returns VIP_APPRECIATION for a DIAMANTE hot customer", () => {
    const snap = computeSnapshot(baseInput({
      customer: {
        id: "c", name: "VIP", phone: "+5511999990000",
        totalOrders: 20, totalSpend: 3000, averageTicket: 150,
        lastOrderAt: daysAgo(3), importedLastOrderAt: null,
        importedOrderCount: null, importedTotalSpent: null,
        hasOptedOut: false, crmContactable: true, contactStatus: "CONTACTABLE",
      },
      lastOrderDelivered: true,
      orderDates: [daysAgo(3), daysAgo(13), daysAgo(23)],
    }));
    expect(snap.segment).toBe("QUENTE");
    expect(snap.tier).toBe("DIAMANTE");
    expect(snap.nextBestAction.actionType).toBe("VIP_APPRECIATION");
    expect(snap.nextBestAction.priority).toBe("HIGH");
    expect(snap.nextBestAction.safeToContact).toBe(true);
  });
});

// ── Test B — cold customer → reactivation ───────────────────────────────────────

describe("Test B — cold customer", () => {
  it("returns REACTIVATION for a FRIO customer", () => {
    const snap = computeSnapshot(baseInput({
      customer: {
        id: "c", name: "Cold", phone: "+5511999990000",
        totalOrders: 3, totalSpend: 250, averageTicket: 83,
        lastOrderAt: daysAgo(90), importedLastOrderAt: null,
        importedOrderCount: null, importedTotalSpent: null,
        hasOptedOut: false, crmContactable: true, contactStatus: "CONTACTABLE",
      },
    }));
    expect(snap.segment).toBe("FRIO");
    expect(snap.nextBestAction.actionType).toBe("REACTIVATION");
    expect(snap.nextBestAction.priority).toBe("HIGH");
  });
});

// ── Test C — lost customer → stronger comeback ──────────────────────────────────

describe("Test C — lost customer", () => {
  it("returns WINBACK with STRONG_DISCOUNT for a PERDIDO customer", () => {
    const snap = computeSnapshot(baseInput({
      customer: {
        id: "c", name: "Lost", phone: "+5511999990000",
        totalOrders: 5, totalSpend: 400, averageTicket: 80,
        lastOrderAt: daysAgo(200), importedLastOrderAt: null,
        importedOrderCount: null, importedTotalSpent: null,
        hasOptedOut: false, crmContactable: true, contactStatus: "CONTACTABLE",
      },
    }));
    expect(snap.segment).toBe("PERDIDO");
    expect(snap.nextBestAction.actionType).toBe("WINBACK");
    expect(snap.nextBestAction.suggestedOfferType).toBe("STRONG_DISCOUNT");
    expect(snap.nextBestAction.priority).toBe("HIGH");
  });

  it("keeps STRONG_DISCOUNT even for a coupon-using lost customer", () => {
    const snap = computeSnapshot(baseInput({
      customer: {
        id: "c", name: "Lost", phone: "+5511999990000",
        totalOrders: 5, totalSpend: 400, averageTicket: 80,
        lastOrderAt: daysAgo(200), importedLastOrderAt: null,
        importedOrderCount: null, importedTotalSpent: null,
        hasOptedOut: false, crmContactable: true, contactStatus: "CONTACTABLE",
      },
      couponOrderCount: 4,
    }));
    expect(snap.nextBestAction.suggestedOfferType).toBe("STRONG_DISCOUNT");
  });
});

// ── Test D — no orders → first-order action ─────────────────────────────────────

describe("Test D — no orders", () => {
  it("returns WELCOME_FIRST_ORDER for a contactable customer with no orders", () => {
    const snap = computeSnapshot(baseInput());
    expect(snap.segment).toBe("SEM_PEDIDOS");
    expect(snap.nextBestAction.actionType).toBe("WELCOME_FIRST_ORDER");
    expect(snap.nextBestAction.suggestedOfferType).toBe("FIRST_ORDER_INCENTIVE");
    expect(snap.nextBestAction.recommendedChannel).toBe("WHATSAPP");
  });
});

// ── Test E — opted-out customer → no contact ────────────────────────────────────

describe("Test E — opted-out customer", () => {
  it("returns NO_ACTION and safeToContact=false", () => {
    const snap = computeSnapshot(baseInput({
      customer: {
        id: "c", name: "Opted", phone: "+5511999990000",
        totalOrders: 10, totalSpend: 2500, averageTicket: 250,
        lastOrderAt: daysAgo(2), importedLastOrderAt: null,
        importedOrderCount: null, importedTotalSpent: null,
        hasOptedOut: true, crmContactable: false, contactStatus: "OPT_OUT",
      },
    }));
    expect(snap.contactability).toBe("OPTED_OUT");
    expect(snap.nextBestAction.actionType).toBe("NO_ACTION");
    expect(snap.nextBestAction.safeToContact).toBe(false);
    expect(snap.nextBestAction.recommendedChannel).toBe("NONE");
  });
});

// ── Test F — no phone → no WhatsApp action ──────────────────────────────────────

describe("Test F — no phone customer", () => {
  it("returns DATA_ENRICHMENT on INTERNAL channel, not WhatsApp", () => {
    const snap = computeSnapshot(baseInput({
      customer: {
        id: "c", name: "NoPhone", phone: null,
        totalOrders: 4, totalSpend: 600, averageTicket: 150,
        lastOrderAt: daysAgo(10), importedLastOrderAt: null,
        importedOrderCount: null, importedTotalSpent: null,
        hasOptedOut: false, crmContactable: false, contactStatus: "SEM_TELEFONE",
      },
    }));
    expect(snap.contactability).toBe("NO_PHONE");
    expect(snap.nextBestAction.actionType).toBe("DATA_ENRICHMENT");
    expect(snap.nextBestAction.recommendedChannel).toBe("INTERNAL");
    expect(snap.nextBestAction.safeToContact).toBe(false);
  });
});

// ── Test G — favorite products computed from OrderItems ─────────────────────────

describe("Test G — favorite products passthrough", () => {
  it("includes favorite products and categories in the snapshot", () => {
    const snap = computeSnapshot(baseInput({
      customer: {
        id: "c", name: "Foodie", phone: "+5511999990000",
        totalOrders: 8, totalSpend: 700, averageTicket: 87.5,
        lastOrderAt: daysAgo(5), importedLastOrderAt: null,
        importedOrderCount: null, importedTotalSpent: null,
        hasOptedOut: false, crmContactable: true, contactStatus: "CONTACTABLE",
      },
      favoriteProducts:   [{ name: "Pizza Margherita", count: 12 }, { name: "Coca-Cola", count: 8 }],
      favoriteCategories: [{ name: "Pizzas", count: 12 }, { name: "Bebidas", count: 8 }],
      lastProducts:       ["Pizza Margherita", "Coca-Cola"],
      lastOrderDelivered: true,
      orderDates:         [daysAgo(5), daysAgo(15)],
    }));
    expect(snap.favoriteProducts[0]!.name).toBe("Pizza Margherita");
    expect(snap.favoriteCategories[0]!.name).toBe("Pizzas");
    expect(snap.lastProducts).toContain("Coca-Cola");
  });
});

// ── Test H — imported-only customer marked source imported ──────────────────────

describe("Test H — imported-only customer", () => {
  it("marks source=imported and uses imported figures", () => {
    const snap = computeSnapshot(baseInput({
      customer: {
        id: "c", name: "Imported", phone: "+5511999990000",
        totalOrders: 0, totalSpend: 0, averageTicket: 95,
        lastOrderAt: null, importedLastOrderAt: daysAgo(40),
        importedOrderCount: 6, importedTotalSpent: 570,
        hasOptedOut: false, crmContactable: true, contactStatus: "CONTACTABLE",
      },
    }));
    expect(snap.source).toBe("imported");
    expect(snap.totalOrders).toBe(6);
    expect(snap.totalSpent).toBe(570);
    expect(snap.segment).toBe("MORNO"); // 40 days ago, hot=30 warm=60
  });
});

// ── Test I — campaign history included ──────────────────────────────────────────

describe("Test I — campaign history", () => {
  it("surfaces campaign + response counts and dates", () => {
    const lastC = daysAgo(7);
    const lastR = daysAgo(6);
    const snap = computeSnapshot(baseInput({
      customer: {
        id: "c", name: "Engaged", phone: "+5511999990000",
        totalOrders: 3, totalSpend: 300, averageTicket: 100,
        lastOrderAt: daysAgo(20), importedLastOrderAt: null,
        importedOrderCount: null, importedTotalSpent: null,
        hasOptedOut: false, crmContactable: true, contactStatus: "CONTACTABLE",
      },
      campaignReceivedCount: 4,
      lastCampaignAt:        lastC,
      responseCount:         2,
      lastResponseAt:        lastR,
    }));
    expect(snap.campaignReceivedCount).toBe(4);
    expect(snap.lastCampaignAt).toBe(lastC.toISOString());
    expect(snap.responseCount).toBe(2);
    expect(snap.lastResponseAt).toBe(lastR.toISOString());
  });
});

// ── Test J — prompt context does not invent missing data ────────────────────────

describe("Test J — prompt context safety", () => {
  it("marks unknown ticket and omits empty preference lists", () => {
    const snap = computeSnapshot(baseInput());
    const ctx = buildCustomerIntelligenceContext(snap);
    expect(ctx).toContain("desconhecido");
    expect(ctx).not.toContain("Produtos favoritos:"); // empty list omitted
    expect(ctx).toContain("Não invente dados");
  });

  it("includes preference lines only when data is present", () => {
    const snap = computeSnapshot(baseInput({
      customer: {
        id: "c", name: "Foodie", phone: "+5511999990000",
        totalOrders: 5, totalSpend: 500, averageTicket: 100,
        lastOrderAt: daysAgo(5), importedLastOrderAt: null,
        importedOrderCount: null, importedTotalSpent: null,
        hasOptedOut: false, crmContactable: true, contactStatus: "CONTACTABLE",
      },
      favoriteProducts: [{ name: "Burger", count: 5 }],
    }));
    const ctx = buildCustomerIntelligenceContext(snap);
    expect(ctx).toContain("Produtos favoritos: Burger");
  });
});

// ── Extra — warm reminder + review window + frequency labels ─────────────────────

describe("NBA edge cases", () => {
  it("returns GENTLE_REMINDER for a warm customer", () => {
    const nba = computeNextBestAction({
      contactability: "CONTACTABLE",
      segment: "MORNO", tier: "PRATA",
      totalOrders: 3, averageTicket: 80, couponUser: false,
      daysSinceLastOrder: 45, lastOrderDelivered: false,
    });
    expect(nba.actionType).toBe("GENTLE_REMINDER");
  });

  it("returns REVIEW_REQUEST for a recent delivered non-VIP hot order", () => {
    const nba = computeNextBestAction({
      contactability: "CONTACTABLE",
      segment: "QUENTE", tier: "BRONZE",
      totalOrders: 2, averageTicket: 50, couponUser: false,
      daysSinceLastOrder: 2, lastOrderDelivered: true,
    });
    expect(nba.actionType).toBe("REVIEW_REQUEST");
    expect(nba.suggestedOfferType).toBe("NO_DISCOUNT_NEEDED");
  });

  it("computes weekly frequency label from order dates", () => {
    const snap = computeSnapshot(baseInput({
      customer: {
        id: "c", name: "Regular", phone: "+5511999990000",
        totalOrders: 4, totalSpend: 400, averageTicket: 100,
        lastOrderAt: daysAgo(2), importedLastOrderAt: null,
        importedOrderCount: null, importedTotalSpent: null,
        hasOptedOut: false, crmContactable: true, contactStatus: "CONTACTABLE",
      },
      orderDates: [daysAgo(2), daysAgo(9), daysAgo(16), daysAgo(23)],
    }));
    expect(snap.averageDaysBetweenOrders).toBe(7);
    expect(snap.orderFrequencyLabel).toBe("semanal");
  });
});
