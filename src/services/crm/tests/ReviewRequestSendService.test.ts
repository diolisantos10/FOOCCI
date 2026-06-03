/**
 * ReviewRequestSendService — human-confirmed send-path tests (A–L).
 *
 * Pure: no DB, no Evolution, no LLM. Exercises the decision layer
 * (resolveReviewSendPlan) and the audit-log builder (buildReviewActionLog),
 * which together gate every real send. No real WhatsApp message is ever sent.
 *
 *   A — eligible + Google link → send allowed (GOOGLE)
 *   B — eligible + iFood link → send allowed (IFOOD)
 *   C — no review link → blocked
 *   D — opted-out customer → blocked
 *   E — no phone → blocked
 *   F — unsafe ContactSafetyService decision → blocked
 *   G — duplicate same order → blocked
 *   H — successful send builds a dedup-counted CRMActionLog (status sent)
 *   I — failed send builds a non-dedup CRMActionLog (status failed)
 *   J — confirm:false → blocked (endpoint requires confirm=true)
 *   K — tenant isolation: the log row always carries the caller's restaurantId
 *   L — no autonomous sends: source has no timer/cron wiring; confirm is required
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveReviewSendPlan,
  buildReviewActionLog,
  REVIEW_ACTION_TYPE_SENT,
  REVIEW_ACTION_TYPE_FAILED,
  REVIEW_ACTION_TYPE_SKIPPED,
} from "../ReviewRequestSendService";
import {
  evaluateReviewEligibility,
  type ReviewEligibilityInput,
} from "../ReviewRequestService";

const NOW = new Date("2026-06-03T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function baseElig(overrides: Partial<ReviewEligibilityInput> = {}): ReviewEligibilityInput {
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
    safetyDecision: { sendable: true, reason: null },
    tone: "friendly",
    emojiUsage: "minimal",
    now: NOW,
    ...overrides,
  };
}

// ── A ────────────────────────────────────────────────────────────────────────
describe("A — eligible + Google link → send allowed", () => {
  it("plan is ready with platform GOOGLE and a message containing the link", () => {
    const elig = evaluateReviewEligibility(baseElig());
    const plan = resolveReviewSendPlan({ eligibility: elig, confirm: true });
    expect(plan.status).toBe("ready");
    expect(plan.platform).toBe("GOOGLE");
    expect(plan.link).toBe("https://g.page/r/restaurante");
    expect(plan.message).toContain("https://g.page/r/restaurante");
    expect(plan.blockReasons).toHaveLength(0);
  });
});

// ── B ────────────────────────────────────────────────────────────────────────
describe("B — eligible + iFood link → send allowed", () => {
  it("plan is ready with platform IFOOD for an iFood-sourced order", () => {
    const elig = evaluateReviewEligibility(baseElig({
      googleReviewUrl: null,
      ifoodReviewUrl: "https://ifood.com.br/r/abc",
      orderSource: "ifood",
    }));
    const plan = resolveReviewSendPlan({ eligibility: elig, confirm: true });
    expect(plan.status).toBe("ready");
    expect(plan.platform).toBe("IFOOD");
    expect(plan.link).toBe("https://ifood.com.br/r/abc");
  });

  it("operator can force IFOOD when both links exist", () => {
    const elig = evaluateReviewEligibility(baseElig({
      ifoodReviewUrl: "https://ifood.com.br/r/abc",
    }));
    const plan = resolveReviewSendPlan({ eligibility: elig, requestedPlatform: "IFOOD", confirm: true });
    expect(plan.status).toBe("ready");
    expect(plan.platform).toBe("IFOOD");
  });
});

// ── C ────────────────────────────────────────────────────────────────────────
describe("C — no review link → blocked", () => {
  it("blocks with NO_REVIEW_LINKS and never produces a message", () => {
    const elig = evaluateReviewEligibility(baseElig({ googleReviewUrl: null, ifoodReviewUrl: null }));
    const plan = resolveReviewSendPlan({ eligibility: elig, confirm: true });
    expect(plan.status).toBe("blocked");
    expect(plan.blockReasons).toContain("NO_REVIEW_LINKS");
    expect(plan.message).toBeNull();
  });

  it("requesting an unconfigured platform is blocked", () => {
    const elig = evaluateReviewEligibility(baseElig()); // Google only
    const plan = resolveReviewSendPlan({ eligibility: elig, requestedPlatform: "IFOOD", confirm: true });
    expect(plan.status).toBe("blocked");
    expect(plan.blockReasons).toContain("PLATFORM_NOT_AVAILABLE");
  });
});

// ── D ────────────────────────────────────────────────────────────────────────
describe("D — opted-out customer → blocked", () => {
  it("blocks with CUSTOMER_OPTED_OUT", () => {
    const elig = evaluateReviewEligibility(baseElig({ hasOptedOut: true }));
    const plan = resolveReviewSendPlan({ eligibility: elig, confirm: true });
    expect(plan.status).toBe("blocked");
    expect(plan.blockReasons).toContain("CUSTOMER_OPTED_OUT");
  });
});

// ── E ────────────────────────────────────────────────────────────────────────
describe("E — no phone → blocked", () => {
  it("blocks with MISSING_PHONE", () => {
    const elig = evaluateReviewEligibility(baseElig({ phone: null }));
    const plan = resolveReviewSendPlan({ eligibility: elig, confirm: true });
    expect(plan.status).toBe("blocked");
    expect(plan.blockReasons).toContain("MISSING_PHONE");
  });
});

// ── F ────────────────────────────────────────────────────────────────────────
describe("F — unsafe ContactSafetyService decision → blocked", () => {
  it("blocks with SAFETY_BLOCKED when safety says not sendable", () => {
    const elig = evaluateReviewEligibility(baseElig({
      safetyDecision: { sendable: false, reason: "CUSTOMER_COOLDOWN_ACTIVE", detail: "cooldown" },
    }));
    const plan = resolveReviewSendPlan({ eligibility: elig, confirm: true });
    expect(plan.status).toBe("blocked");
    expect(plan.blockReasons).toContain("SAFETY_BLOCKED");
  });
});

// ── G ────────────────────────────────────────────────────────────────────────
describe("G — duplicate same order → blocked", () => {
  it("blocks with REVIEW_ALREADY_REQUESTED_FOR_ORDER", () => {
    const elig = evaluateReviewEligibility(baseElig({ alreadyRequestedForOrder: true }));
    const plan = resolveReviewSendPlan({ eligibility: elig, confirm: true });
    expect(plan.status).toBe("blocked");
    expect(plan.blockReasons).toContain("REVIEW_ALREADY_REQUESTED_FOR_ORDER");
  });

  it("blocks with CUSTOMER_ASKED_REVIEW_RECENTLY within cooldown", () => {
    const elig = evaluateReviewEligibility(baseElig({ customerLastReviewRequestAt: daysAgo(10) }));
    const plan = resolveReviewSendPlan({ eligibility: elig, confirm: true });
    expect(plan.status).toBe("blocked");
    expect(plan.blockReasons).toContain("CUSTOMER_ASKED_REVIEW_RECENTLY");
  });
});

// ── H ────────────────────────────────────────────────────────────────────────
describe("H — successful send logs a dedup-counted CRMActionLog", () => {
  it("status sent → actionType REVIEW_REQUEST + metadata", () => {
    const row = buildReviewActionLog({
      status: "sent",
      restaurantId: "r1",
      customerId: "c1",
      orderId: "o1",
      platform: "GOOGLE",
      reviewLink: "https://g.page/r/x",
      messageText: "Oi! Avalie aqui: https://g.page/r/x",
    });
    expect(row.actionType).toBe(REVIEW_ACTION_TYPE_SENT);
    expect(row.actionType).toBe("REVIEW_REQUEST"); // counted by REVIEW_ACTION_TYPES dedup
    expect(row.metadata.status).toBe("sent");
    expect(row.metadata.platform).toBe("GOOGLE");
    expect(row.metadata.reviewLink).toBe("https://g.page/r/x");
    expect(row.orderId).toBe("o1");
    expect(row.metadata.error).toBeUndefined();
  });
});

// ── I ────────────────────────────────────────────────────────────────────────
describe("I — failed send logs a non-dedup CRMActionLog with failed status", () => {
  it("status failed → distinct actionType (does NOT block retries) + error", () => {
    const row = buildReviewActionLog({
      status: "failed",
      restaurantId: "r1",
      customerId: "c1",
      orderId: "o1",
      platform: "GOOGLE",
      reviewLink: "https://g.page/r/x",
      messageText: "Oi! Avalie aqui: https://g.page/r/x",
      error: "Evolution 500",
    });
    expect(row.actionType).toBe(REVIEW_ACTION_TYPE_FAILED);
    expect(row.actionType).not.toBe("REVIEW_REQUEST"); // excluded from dedup
    expect(row.metadata.status).toBe("failed");
    expect(row.metadata.error).toBe("Evolution 500");
  });

  it("skipped uses its own actionType too", () => {
    const row = buildReviewActionLog({
      status: "skipped",
      restaurantId: "r1",
      customerId: "c1",
      orderId: null,
      platform: null,
      reviewLink: null,
      messageText: "",
      error: "NO_REVIEW_LINKS",
    });
    expect(row.actionType).toBe(REVIEW_ACTION_TYPE_SKIPPED);
    expect(row.actionType).not.toBe("REVIEW_REQUEST");
  });
});

// ── J ────────────────────────────────────────────────────────────────────────
describe("J — endpoint requires confirm=true", () => {
  it("confirm:false → blocked CONFIRM_REQUIRED before any other check", () => {
    const elig = evaluateReviewEligibility(baseElig());
    const plan = resolveReviewSendPlan({ eligibility: elig, confirm: false });
    expect(plan.status).toBe("blocked");
    expect(plan.blockReasons).toEqual(["CONFIRM_REQUIRED"]);
    expect(plan.message).toBeNull();
  });
});

// ── K ────────────────────────────────────────────────────────────────────────
describe("K — tenant isolation", () => {
  it("the log row always carries the caller-supplied restaurantId verbatim", () => {
    const a = buildReviewActionLog({
      status: "sent", restaurantId: "tenant-A", customerId: "c1", orderId: null,
      platform: "GOOGLE", reviewLink: "https://g.page/r/x", messageText: "hi https://g.page/r/x",
    });
    const b = buildReviewActionLog({
      status: "sent", restaurantId: "tenant-B", customerId: "c1", orderId: null,
      platform: "GOOGLE", reviewLink: "https://g.page/r/x", messageText: "hi https://g.page/r/x",
    });
    expect(a.restaurantId).toBe("tenant-A");
    expect(b.restaurantId).toBe("tenant-B");
    expect(a.restaurantId).not.toBe(b.restaurantId);
  });
});

// ── L ────────────────────────────────────────────────────────────────────────
describe("L — no autonomous sends", () => {
  const src = readFileSync(
    join(process.cwd(), "src/services/crm/ReviewRequestSendService.ts"),
    "utf8",
  );

  it("the send service has no timer / cron / scheduler wiring", () => {
    expect(src).not.toMatch(/setInterval|setTimeout\s*\(|cron|node-cron|scheduler|\.schedule\(/i);
  });

  it("the send path is gated on explicit confirmation (no default-true)", () => {
    // confirm is required; the planner blocks immediately when confirm is false.
    const elig = evaluateReviewEligibility(baseElig());
    for (const confirm of [false]) {
      const plan = resolveReviewSendPlan({ eligibility: elig, confirm });
      expect(plan.status).toBe("blocked");
    }
  });

  it("a custom message stripped of the link is blocked (cannot send a linkless review)", () => {
    const elig = evaluateReviewEligibility(baseElig());
    const plan = resolveReviewSendPlan({
      eligibility: elig,
      customMessage: "Oi, avalia a gente por favor",
      confirm: true,
    });
    expect(plan.status).toBe("blocked");
    expect(plan.blockReasons).toContain("MESSAGE_MISSING_LINK");
  });
});
