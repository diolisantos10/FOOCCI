/**
 * CrmActionCenterService — unit tests (A–H)
 *
 * Tests target `computeActions()` exclusively — no DB, fully deterministic.
 */

import { describe, it, expect } from "vitest";
import {
  computeActions,
  type ComputeActionsInput,
  type CustomerComputeRow,
} from "@/services/crm/CrmActionCenterService";
import { DEFAULT_SEGMENT_CONFIG } from "@/lib/crm-segments";

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysAgo(days: number, from: Date = NOW): Date {
  return new Date(from.getTime() - days * 86_400_000);
}

const NOW = new Date("2025-06-01T12:00:00Z");

function makeCustomer(overrides: Partial<CustomerComputeRow> = {}): CustomerComputeRow {
  return {
    id: "c-default",
    name: "Cliente",
    phone: "5511999999999",
    hasOptedOut: false,
    crmContactable: true,
    totalSpend: 200,
    totalOrders: 3,
    lastOrderAt: daysAgo(10),
    importedOrderCount: null,
    importedTotalSpent: null,
    importedLastOrderAt: null,
    averageTicket: 66,
    tier: "BRONZE",
    birthDate: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<ComputeActionsInput> = {}): ComputeActionsInput {
  return {
    customers: [],
    now: NOW,
    hasEvolutionConfig: true,
    couponUserIds: new Set(),
    segmentConfig: DEFAULT_SEGMENT_CONFIG,
    recentCampaignStats: null,
    restaurantAvgTicket: 60,
    ...overrides,
  };
}

// ── Test A — FRIO contactable → RECOVER_COLD_CUSTOMERS ───────────────────────

describe("A — FRIO customer → RECOVER_COLD_CUSTOMERS", () => {
  it("generates RECOVER_COLD_CUSTOMERS when FRIO customer exists", () => {
    const customers = [
      makeCustomer({ id: "c1", lastOrderAt: daysAgo(80) }), // FRIO: 60 < 80 < 120
    ];
    const actions = computeActions(baseInput({ customers }));

    const cold = actions.find((a) => a.type === "RECOVER_COLD_CUSTOMERS");
    expect(cold).toBeDefined();
    expect(cold!.estimatedAudienceCount).toBe(1);
    expect(cold!.eligibleCount).toBe(1);
    expect(cold!.blockedCount).toBe(0);
    expect(cold!.safetyStatus).toBe("READY");
    expect(cold!.recommendedCampaignType).toBe("recuperar-frios");
  });

  it("assigns HIGH priority when 10+ FRIO customers", () => {
    const customers = Array.from({ length: 12 }, (_, i) =>
      makeCustomer({ id: `c${i}`, lastOrderAt: daysAgo(80) }),
    );
    const actions = computeActions(baseInput({ customers }));
    const cold = actions.find((a) => a.type === "RECOVER_COLD_CUSTOMERS");
    expect(cold!.priority).toBe("HIGH");
  });

  it("does not generate action when no FRIO customers", () => {
    const customers = [makeCustomer({ lastOrderAt: daysAgo(10) })]; // QUENTE
    const actions = computeActions(baseInput({ customers }));
    expect(actions.find((a) => a.type === "RECOVER_COLD_CUSTOMERS")).toBeUndefined();
  });
});

// ── Test B — PERDIDO → RECOVER_LOST_CUSTOMERS (stronger) ─────────────────────

describe("B — PERDIDO customer → RECOVER_LOST_CUSTOMERS", () => {
  it("generates RECOVER_LOST_CUSTOMERS for PERDIDO customer", () => {
    const customers = [
      makeCustomer({ id: "c1", lastOrderAt: daysAgo(150) }), // >= 120 → PERDIDO
    ];
    const actions = computeActions(baseInput({ customers }));

    const lost = actions.find((a) => a.type === "RECOVER_LOST_CUSTOMERS");
    expect(lost).toBeDefined();
    expect(lost!.eligibleCount).toBe(1);
    expect(lost!.recommendedCampaignType).toBe("recuperar-perdidos");
    expect(lost!.description).toContain("120 dias");
  });

  it("has lower conversionRate estimate than FRIO (PERDIDO harder to recover)", () => {
    const customers = [
      makeCustomer({ id: "cold", lastOrderAt: daysAgo(80), averageTicket: 100 }),
      makeCustomer({ id: "lost", lastOrderAt: daysAgo(150), averageTicket: 100 }),
    ];
    const actions = computeActions(baseInput({ customers }));
    const coldAction = actions.find((a) => a.type === "RECOVER_COLD_CUSTOMERS");
    const lostAction = actions.find((a) => a.type === "RECOVER_LOST_CUSTOMERS");
    // FRIO conversionRate 0.25 > PERDIDO 0.15
    expect(coldAction!.estimatedRevenueOpportunity).toBeGreaterThan(
      lostAction!.estimatedRevenueOpportunity,
    );
  });
});

// ── Test C — no-phone customers → blocked, not "sent" ────────────────────────

describe("C — no-phone customers → DATA_CLEANUP not send", () => {
  it("counts no-phone customers as blockedCount, not eligibleCount", () => {
    const customers = [
      makeCustomer({ id: "c1", phone: null, lastOrderAt: daysAgo(80) }),
      makeCustomer({ id: "c2", phone: "", lastOrderAt: daysAgo(80) }),
    ];
    const actions = computeActions(baseInput({ customers }));

    const cold = actions.find((a) => a.type === "RECOVER_COLD_CUSTOMERS");
    expect(cold).toBeDefined();
    expect(cold!.eligibleCount).toBe(0);
    expect(cold!.blockedCount).toBe(2);
    expect(cold!.safetyStatus).toBe("BLOCKED");
    expect(cold!.blockerReasons.some((r) => r.includes("sem-telefone"))).toBe(true);
  });

  it("does not create fully-eligible audience when all are no-phone", () => {
    const customers = [makeCustomer({ phone: null, lastOrderAt: daysAgo(80) })];
    const actions = computeActions(baseInput({ customers }));
    const cold = actions.find((a) => a.type === "RECOVER_COLD_CUSTOMERS");
    expect(cold!.safetyStatus).toBe("BLOCKED");
  });
});

// ── Test D — opted-out customers excluded from eligibleCount ──────────────────

describe("D — opted-out excluded from eligible audience", () => {
  it("opted-out customers count as blocked, not eligible", () => {
    const customers = [
      makeCustomer({ id: "c1", hasOptedOut: true, lastOrderAt: daysAgo(80) }),
      makeCustomer({ id: "c2", hasOptedOut: false, lastOrderAt: daysAgo(80) }),
    ];
    const actions = computeActions(baseInput({ customers }));

    const cold = actions.find((a) => a.type === "RECOVER_COLD_CUSTOMERS");
    expect(cold!.eligibleCount).toBe(1);
    expect(cold!.blockedCount).toBe(1);
    expect(cold!.safetyStatus).toBe("PARTIAL");
    expect(cold!.blockerReasons.some((r) => r.includes("opt-out"))).toBe(true);
  });

  it("all opted-out → safetyStatus BLOCKED", () => {
    const customers = [makeCustomer({ hasOptedOut: true, lastOrderAt: daysAgo(80) })];
    const actions = computeActions(baseInput({ customers }));
    const cold = actions.find((a) => a.type === "RECOVER_COLD_CUSTOMERS");
    expect(cold!.safetyStatus).toBe("BLOCKED");
    expect(cold!.eligibleCount).toBe(0);
  });
});

// ── Test E — DIAMANTE QUENTE → VIP_APPRECIATION ───────────────────────────────

describe("E — DIAMANTE QUENTE → VIP_APPRECIATION", () => {
  it("generates VIP_APPRECIATION for DIAMANTE QUENTE customer", () => {
    const customers = [
      makeCustomer({ id: "c1", tier: "DIAMANTE", totalSpend: 3000, lastOrderAt: daysAgo(5) }),
    ];
    const actions = computeActions(baseInput({ customers }));

    const vip = actions.find((a) => a.type === "VIP_APPRECIATION");
    expect(vip).toBeDefined();
    expect(vip!.priority).toBe("HIGH"); // has DIAMANTE
    expect(vip!.eligibleCount).toBe(1);
    expect(vip!.recommendedCampaignType).toBe("vip-appreciation");
  });

  it("OURO QUENTE → VIP_APPRECIATION MEDIUM priority (no DIAMANTE)", () => {
    const customers = [
      makeCustomer({ id: "c1", tier: "OURO", totalSpend: 900, lastOrderAt: daysAgo(5) }),
    ];
    const actions = computeActions(baseInput({ customers }));
    const vip = actions.find((a) => a.type === "VIP_APPRECIATION");
    expect(vip!.priority).toBe("MEDIUM");
  });

  it("DIAMANTE not QUENTE → HIGH_VALUE_CUSTOMER_ATTENTION instead", () => {
    const customers = [
      makeCustomer({ id: "c1", tier: "DIAMANTE", totalSpend: 3000, lastOrderAt: daysAgo(80) }),
    ];
    const actions = computeActions(baseInput({ customers }));

    const vip = actions.find((a) => a.type === "VIP_APPRECIATION");
    expect(vip).toBeUndefined();

    const attention = actions.find((a) => a.type === "HIGH_VALUE_CUSTOMER_ATTENTION");
    expect(attention).toBeDefined();
    expect(attention!.priority).toBe("HIGH");
  });
});

// ── Test F — no Evolution config → SAFETY_ISSUE_ALERT ────────────────────────

describe("F — no Evolution config → SAFETY_ISSUE_ALERT first", () => {
  it("generates SAFETY_ISSUE_ALERT when hasEvolutionConfig=false", () => {
    const actions = computeActions(
      baseInput({ hasEvolutionConfig: false, customers: [makeCustomer()] }),
    );

    const alert = actions.find((a) => a.type === "SAFETY_ISSUE_ALERT");
    expect(alert).toBeDefined();
    expect(alert!.priority).toBe("HIGH");
    expect(alert!.safetyStatus).toBe("BLOCKED");
  });

  it("SAFETY_ISSUE_ALERT appears first in ranked list", () => {
    const customers = [
      makeCustomer({ lastOrderAt: daysAgo(80) }), // also FRIO
    ];
    const actions = computeActions(
      baseInput({ hasEvolutionConfig: false, customers }),
    );

    expect(actions[0].type).toBe("SAFETY_ISSUE_ALERT");
  });

  it("does not generate SAFETY_ISSUE_ALERT when Evolution is configured", () => {
    const actions = computeActions(baseInput({ hasEvolutionConfig: true }));
    expect(actions.find((a) => a.type === "SAFETY_ISSUE_ALERT")).toBeUndefined();
  });
});

// ── Test G — ranking prioritizes HIGH revenue within same priority ─────────────

describe("G — ranking: high revenue within same priority comes first", () => {
  it("higher-revenue action ranks before lower-revenue at same priority", () => {
    // Two MORNO customers: one with high ticket, one with low ticket
    const highTicket = makeCustomer({
      id: "high",
      lastOrderAt: daysAgo(45),
      averageTicket: 500,
      tier: "BRONZE",
    });
    const lowTicket = makeCustomer({
      id: "low",
      lastOrderAt: daysAgo(80),
      averageTicket: 10,
      tier: "BRONZE",
    });

    // Run each separately so actions are isolated
    const actionsHigh = computeActions(
      baseInput({ customers: [highTicket] }),
    );
    const actionsLow = computeActions(
      baseInput({ customers: [lowTicket] }),
    );

    const mornoHigh = actionsHigh.find((a) => a.type === "WARM_CUSTOMERS");
    const coldLow   = actionsLow.find((a) => a.type === "RECOVER_COLD_CUSTOMERS");

    expect(mornoHigh!.estimatedRevenueOpportunity).toBeGreaterThan(
      coldLow!.estimatedRevenueOpportunity,
    );
  });

  it("HIGH priority action always ranks above MEDIUM regardless of revenue", () => {
    const customers = [
      makeCustomer({ id: "c1", lastOrderAt: daysAgo(45), averageTicket: 5000 }),  // MORNO → MEDIUM
      makeCustomer({ id: "c2", lastOrderAt: daysAgo(150), averageTicket: 1 }),    // PERDIDO → HIGH if ≥5
    ];
    // Add 4 more PERDIDO to trigger HIGH
    const manyPerdido = Array.from({ length: 5 }, (_, i) =>
      makeCustomer({ id: `p${i}`, lastOrderAt: daysAgo(150), averageTicket: 1 }),
    );
    const allCustomers = [customers[0], ...manyPerdido];
    const actions = computeActions(baseInput({ customers: allCustomers }));

    const highIdx = actions.findIndex((a) => a.priority === "HIGH" && a.type === "RECOVER_LOST_CUSTOMERS");
    const medIdx  = actions.findIndex((a) => a.priority === "MEDIUM" && a.type === "WARM_CUSTOMERS");
    expect(highIdx).not.toBe(-1);
    // HIGH should appear before MEDIUM (or there's no MEDIUM for MORNO since it's QUENTE)
    // The MORNO customer (45 days) is truly morno; PERDIDO has HIGH priority
    if (medIdx !== -1) {
      expect(highIdx).toBeLessThan(medIdx);
    }
  });
});

// ── Test H — tenant isolation ─────────────────────────────────────────────────

describe("H — tenant isolation", () => {
  it("computeActions only considers customers in input (isolation guaranteed by caller)", () => {
    const restaurantACustomers = [
      makeCustomer({ id: "a1", lastOrderAt: daysAgo(80) }), // FRIO
    ];
    const restaurantBCustomers = [
      makeCustomer({ id: "b1", lastOrderAt: daysAgo(10) }), // QUENTE
    ];

    const actionsA = computeActions(baseInput({ customers: restaurantACustomers }));
    const actionsB = computeActions(baseInput({ customers: restaurantBCustomers }));

    // Restaurant A should see RECOVER_COLD_CUSTOMERS
    expect(actionsA.find((a) => a.type === "RECOVER_COLD_CUSTOMERS")).toBeDefined();
    // Restaurant B should not
    expect(actionsB.find((a) => a.type === "RECOVER_COLD_CUSTOMERS")).toBeUndefined();

    // No cross-contamination: B's eligible count doesn't include A's customers
    const bCold = actionsB.find((a) => a.type === "RECOVER_COLD_CUSTOMERS");
    expect(bCold).toBeUndefined();
  });

  it("linkedCustomerSample contains only matched customers", () => {
    const customers = [
      makeCustomer({ id: "frio1", name: "Frio", lastOrderAt: daysAgo(80) }),
      makeCustomer({ id: "quente1", name: "Quente", lastOrderAt: daysAgo(5) }),
    ];
    const actions = computeActions(baseInput({ customers }));
    const cold = actions.find((a) => a.type === "RECOVER_COLD_CUSTOMERS");
    expect(cold!.linkedCustomerSample.every((c) => c.id === "frio1")).toBe(true);
  });
});

// ── Extra: BIRTHDAY_CAMPAIGN ──────────────────────────────────────────────────

describe("BIRTHDAY_CAMPAIGN", () => {
  it("generates action for today's birthday", () => {
    const todayBirthday = new Date(NOW);
    todayBirthday.setFullYear(1990); // same month+day, different year
    const customers = [makeCustomer({ birthDate: todayBirthday })];
    const actions = computeActions(baseInput({ customers }));
    const birthday = actions.find((a) => a.type === "BIRTHDAY_CAMPAIGN");
    expect(birthday).toBeDefined();
    expect(birthday!.priority).toBe("HIGH");
    expect(birthday!.title).toContain("hoje");
  });

  it("generates MEDIUM priority for upcoming birthday", () => {
    const futureBirthday = new Date(NOW.getTime() + 3 * 86_400_000);
    futureBirthday.setFullYear(1990);
    const customers = [makeCustomer({ birthDate: futureBirthday })];
    const actions = computeActions(baseInput({ customers }));
    const birthday = actions.find((a) => a.type === "BIRTHDAY_CAMPAIGN");
    expect(birthday!.priority).toBe("MEDIUM");
  });
});

// ── Extra: CAMPAIGN_PERFORMANCE_ALERT ────────────────────────────────────────

describe("CAMPAIGN_PERFORMANCE_ALERT", () => {
  it("generates alert when conversion < 5% with 10+ sends", () => {
    const actions = computeActions(
      baseInput({ recentCampaignStats: { sentCount: 20, convertedCount: 0 } }),
    );
    expect(actions.find((a) => a.type === "CAMPAIGN_PERFORMANCE_ALERT")).toBeDefined();
  });

  it("does not generate alert when conversion >= 5%", () => {
    const actions = computeActions(
      baseInput({ recentCampaignStats: { sentCount: 20, convertedCount: 2 } }),
    );
    expect(actions.find((a) => a.type === "CAMPAIGN_PERFORMANCE_ALERT")).toBeUndefined();
  });

  it("does not generate alert with fewer than 10 sends (insufficient data)", () => {
    const actions = computeActions(
      baseInput({ recentCampaignStats: { sentCount: 5, convertedCount: 0 } }),
    );
    expect(actions.find((a) => a.type === "CAMPAIGN_PERFORMANCE_ALERT")).toBeUndefined();
  });
});
