/**
 * ReviewRequestService — CRM W8 — Tests A-M
 *
 * Pure-function tests (evaluateReviewEligibility, selectReviewLink,
 * buildReviewMessage) + Action Center integration + source-code safety
 * inspection. No DB, no network — fully deterministic.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  evaluateReviewEligibility,
  selectReviewLink,
  buildReviewMessage,
  availableReviewLinks,
  isIfoodSource,
  CUSTOMER_REVIEW_COOLDOWN_DAYS,
  MAX_ORDER_AGE_DAYS,
  type ReviewEligibilityInput,
} from "@/services/crm/ReviewRequestService";

import { computeActions, type ComputeActionsInput, type CustomerComputeRow } from "@/services/crm/CrmActionCenterService";
import { DEFAULT_SEGMENT_CONFIG } from "@/lib/crm-segments";

const NOW = new Date("2026-06-03T12:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000);
}

function baseInput(overrides: Partial<ReviewEligibilityInput> = {}): ReviewEligibilityInput {
  return {
    customerName: "Diego Santos",
    hasOptedOut: false,
    crmContactable: true,
    phone: "5511999999999",
    googleReviewUrl: "https://g.page/r/restaurante",
    ifoodReviewUrl: null,
    orderStatus: "DELIVERED",
    orderSource: "whatsapp",
    orderDate: daysAgo(2),
    alreadyRequestedForOrder: false,
    customerLastReviewRequestAt: null,
    hasComplaintSignal: false,
    safetyDecision: null,
    tone: "friendly",
    emojiUsage: "minimal",
    now: NOW,
    ...overrides,
  };
}

// ── A: Delivered + Google + safe → eligible ──────────────────────────────────

describe("A — delivered order + Google link + safe customer → eligible", () => {
  it("is eligible and prefers Google", () => {
    const d = evaluateReviewEligibility(baseInput());
    expect(d.eligible).toBe(true);
    expect(d.blocks).toHaveLength(0);
    expect(d.preferredPlatform).toBe("GOOGLE");
    expect(d.preferredReviewLink).toBe("https://g.page/r/restaurante");
    expect(d.draftMessage).toContain("https://g.page/r/restaurante");
    expect(d.requiresApproval).toBe(true);
  });
});

// ── B: iFood link only → eligible with iFood ─────────────────────────────────

describe("B — delivered order + iFood link only → eligible with iFood", () => {
  it("prefers iFood when only iFood configured", () => {
    const d = evaluateReviewEligibility(baseInput({
      googleReviewUrl: null,
      ifoodReviewUrl: "https://www.ifood.com.br/avaliar/abc",
      orderSource: "import",
    }));
    expect(d.eligible).toBe(true);
    expect(d.preferredPlatform).toBe("IFOOD");
    expect(d.draftMessage).toContain("iFood");
  });
});

// ── C: No review links → blocked ─────────────────────────────────────────────

describe("C — no review links → blocked", () => {
  it("blocks with NO_REVIEW_LINKS and no draft", () => {
    const d = evaluateReviewEligibility(baseInput({ googleReviewUrl: null, ifoodReviewUrl: null }));
    expect(d.eligible).toBe(false);
    expect(d.blocks).toContain("NO_REVIEW_LINKS");
    expect(d.draftMessage).toBeNull();
    expect(d.availableLinks).toHaveLength(0);
  });
});

// ── D: Pending order → blocked ───────────────────────────────────────────────

describe("D — pending order → blocked", () => {
  it("blocks with ORDER_NOT_DELIVERED", () => {
    const d = evaluateReviewEligibility(baseInput({ orderStatus: "PENDING" }));
    expect(d.eligible).toBe(false);
    expect(d.blocks).toContain("ORDER_NOT_DELIVERED");
  });
});

// ── E: Cancelled order → blocked ─────────────────────────────────────────────

describe("E — cancelled order → blocked", () => {
  it("blocks with ORDER_NOT_DELIVERED", () => {
    const d = evaluateReviewEligibility(baseInput({ orderStatus: "CANCELLED" }));
    expect(d.eligible).toBe(false);
    expect(d.blocks).toContain("ORDER_NOT_DELIVERED");
  });
});

// ── F: Same order already requested → blocked ────────────────────────────────

describe("F — same order already requested → blocked", () => {
  it("blocks with REVIEW_ALREADY_REQUESTED_FOR_ORDER", () => {
    const d = evaluateReviewEligibility(baseInput({ alreadyRequestedForOrder: true }));
    expect(d.eligible).toBe(false);
    expect(d.blocks).toContain("REVIEW_ALREADY_REQUESTED_FOR_ORDER");
  });
});

// ── G: Customer requested recently → blocked ─────────────────────────────────

describe("G — customer requested review recently → blocked", () => {
  it("blocks within cooldown window", () => {
    const d = evaluateReviewEligibility(baseInput({
      customerLastReviewRequestAt: daysAgo(CUSTOMER_REVIEW_COOLDOWN_DAYS - 1),
    }));
    expect(d.eligible).toBe(false);
    expect(d.blocks).toContain("CUSTOMER_ASKED_REVIEW_RECENTLY");
  });

  it("does NOT block once cooldown has elapsed", () => {
    const d = evaluateReviewEligibility(baseInput({
      customerLastReviewRequestAt: daysAgo(CUSTOMER_REVIEW_COOLDOWN_DAYS + 1),
    }));
    expect(d.eligible).toBe(true);
  });
});

// ── H: Opted-out customer → blocked ──────────────────────────────────────────

describe("H — opted-out customer → blocked", () => {
  it("blocks with CUSTOMER_OPTED_OUT", () => {
    const d = evaluateReviewEligibility(baseInput({ hasOptedOut: true }));
    expect(d.eligible).toBe(false);
    expect(d.blocks).toContain("CUSTOMER_OPTED_OUT");
  });
});

// ── I: No phone → blocked ────────────────────────────────────────────────────

describe("I — no phone → blocked", () => {
  it("blocks with MISSING_PHONE", () => {
    const d = evaluateReviewEligibility(baseInput({ phone: null }));
    expect(d.eligible).toBe(false);
    expect(d.blocks).toContain("MISSING_PHONE");
  });

  it("blocks on empty/whitespace phone", () => {
    const d = evaluateReviewEligibility(baseInput({ phone: "  " }));
    expect(d.blocks).toContain("MISSING_PHONE");
  });
});

// ── J: ContactSafetyService blocked → blocked ────────────────────────────────

describe("J — ContactSafetyService blocked → blocked", () => {
  it("blocks with SAFETY_BLOCKED when safetyDecision not sendable", () => {
    const d = evaluateReviewEligibility(baseInput({
      safetyDecision: { sendable: false, reason: "QUIET_HOURS", detail: "quiet hours" },
    }));
    expect(d.eligible).toBe(false);
    expect(d.blocks).toContain("SAFETY_BLOCKED");
  });

  it("does NOT block when safetyDecision is sendable", () => {
    const d = evaluateReviewEligibility(baseInput({
      safetyDecision: { sendable: true, reason: null },
    }));
    expect(d.eligible).toBe(true);
  });
});

// ── K: Both links exist → source prefers correct link ────────────────────────

describe("K — both links exist, source decides preferred link", () => {
  const links = { google: "https://g.page/x", ifood: "https://ifood.com/x" };

  it("iFood source prefers iFood", () => {
    expect(selectReviewLink(links, "import")?.platform).toBe("IFOOD");
    expect(selectReviewLink(links, "ifood")?.platform).toBe("IFOOD");
  });

  it("direct/whatsapp source prefers Google", () => {
    expect(selectReviewLink(links, "whatsapp")?.platform).toBe("GOOGLE");
    expect(selectReviewLink(links, "pedido")?.platform).toBe("GOOGLE");
    expect(selectReviewLink(links, "qr")?.platform).toBe("GOOGLE");
  });

  it("availableReviewLinks returns both", () => {
    expect(availableReviewLinks(links)).toHaveLength(2);
  });

  it("isIfoodSource recognizes ifood/import", () => {
    expect(isIfoodSource("ifood")).toBe(true);
    expect(isIfoodSource("import")).toBe(true);
    expect(isIfoodSource("whatsapp")).toBe(false);
  });

  it("end-to-end: iFood order with both links drafts iFood", () => {
    const d = evaluateReviewEligibility(baseInput({
      googleReviewUrl: links.google,
      ifoodReviewUrl: links.ifood,
      orderSource: "ifood",
    }));
    expect(d.preferredPlatform).toBe("IFOOD");
  });
});

// ── Extra: order too old / too recent ────────────────────────────────────────

describe("Extra — order age window", () => {
  it("blocks order older than max age", () => {
    const d = evaluateReviewEligibility(baseInput({ orderDate: daysAgo(MAX_ORDER_AGE_DAYS + 1) }));
    expect(d.blocks).toContain("ORDER_TOO_OLD");
  });

  it("blocks same-day order (too recent)", () => {
    const d = evaluateReviewEligibility(baseInput({ orderDate: NOW }));
    expect(d.blocks).toContain("ORDER_TOO_RECENT");
  });

  it("blocks when no order present", () => {
    const d = evaluateReviewEligibility(baseInput({ orderStatus: null, orderDate: null }));
    expect(d.blocks).toContain("NO_DELIVERED_ORDER");
  });
});

// ── Extra: message is non-spammy ─────────────────────────────────────────────

describe("Extra — review message safety", () => {
  it("contains greeting, thanks, real link, and no fake urgency", () => {
    const msg = buildReviewMessage({
      customerName: "Ana Paula",
      platform: "GOOGLE",
      url: "https://g.page/r/x",
      emojiUsage: "minimal",
    });
    expect(msg).toContain("Ana");
    expect(msg).toContain("https://g.page/r/x");
    expect(msg.toLowerCase()).not.toMatch(/última chance|urgente|agora ou nunca|imperd/);
  });

  it("omits emoji when emojiUsage=none", () => {
    const msg = buildReviewMessage({
      customerName: "Ana",
      platform: "GOOGLE",
      url: "https://x",
      emojiUsage: "none",
    });
    expect(msg).not.toMatch(/😊/);
  });
});

// ── L: Action Center review action uses eligible/blocked counts ───────────────

describe("L — Action Center REVIEW_REQUEST action", () => {
  function customer(over: Partial<CustomerComputeRow> = {}): CustomerComputeRow {
    return {
      id: "c1", name: "Cliente", phone: "5511999999999",
      hasOptedOut: false, crmContactable: true,
      totalSpend: 200, totalOrders: 4, lastOrderAt: daysAgo(2),
      importedOrderCount: null, importedTotalSpent: null, importedLastOrderAt: null,
      averageTicket: 50, tier: "PRATA", birthDate: null, ...over,
    };
  }

  function input(over: Partial<ComputeActionsInput> = {}): ComputeActionsInput {
    return {
      customers: [
        customer({ id: "a", lastOrderAt: daysAgo(2) }),
        customer({ id: "b", lastOrderAt: daysAgo(3), hasOptedOut: true }),
      ],
      now: NOW,
      hasEvolutionConfig: true,
      couponUserIds: new Set(),
      segmentConfig: DEFAULT_SEGMENT_CONFIG,
      recentCampaignStats: null,
      restaurantAvgTicket: 50,
      hasReviewLink: true,
      ...over,
    };
  }

  it("emits REVIEW_REQUEST with eligible + blocked counts", () => {
    const actions = computeActions(input());
    const review = actions.find((a) => a.type === "REVIEW_REQUEST");
    expect(review).toBeDefined();
    expect(review!.eligibleCount).toBe(1);   // a is contactable
    expect(review!.blockedCount).toBe(1);    // b opted out
  });

  it("when no review link, action warns to configure and drops campaign type", () => {
    const actions = computeActions(input({ hasReviewLink: false }));
    const review = actions.find((a) => a.type === "REVIEW_REQUEST");
    expect(review).toBeDefined();
    expect(review!.description).toMatch(/nenhum link|configurad/i);
    expect(review!.recommendedCampaignType).toBeNull();
    expect(review!.suggestedNextStep).toMatch(/Configurar link/i);
  });

  it("when review link present, suggests generating the request", () => {
    const actions = computeActions(input({ hasReviewLink: true }));
    const review = actions.find((a) => a.type === "REVIEW_REQUEST");
    expect(review!.recommendedCampaignType).toBe("solicitar-avaliacao");
  });
});

// ── M: No live WhatsApp send in service (source inspection) ───────────────────

describe("M — ReviewRequestService never sends live messages", () => {
  const src = readFileSync(
    resolve(__dirname, "../ReviewRequestService.ts"),
    "utf-8",
  );

  it("does not import EvolutionClient", () => {
    expect(src).not.toMatch(/EvolutionClient/);
  });

  it("does not call any send path", () => {
    expect(src).not.toMatch(/sendText|sendMessage|\.send\(/);
  });

  it("does not create campaigns or executions", () => {
    expect(src).not.toMatch(/campaign\.create|campaignExecution\.create/);
  });

  it("reads brand config + customer + order tenant-scoped (restaurantId)", () => {
    expect(src).toMatch(/restaurantId/);
    expect(src).toMatch(/restaurantBrandConfig\.findUnique/);
  });

  it("endpoint is draft-only with requiresApproval contract", () => {
    const ep = readFileSync(
      resolve(__dirname, "../../../app/api/crm/review-request/route.ts"),
      "utf-8",
    );
    expect(ep).toMatch(/getTenantContext/);
    expect(ep).toMatch(/ReviewRequestService/);
    expect(ep).not.toMatch(/EvolutionClient|sendText/);
  });
});
