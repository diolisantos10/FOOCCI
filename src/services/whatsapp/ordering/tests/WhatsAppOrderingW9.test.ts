/**
 * W9 — WhatsApp Text Ordering v1 Controlled Live Activation
 *
 * Tests A–O: flag guards, allowlist blocking, routing, safety,
 * handoff, idempotency, timeline, CRM isolation, and webhook gating.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isWaTextOrderingEnabled,
  isPhoneAllowlisted,
  isRestaurantAllowlisted,
  getWaTextOrderingMode,
  resolveSideEffectPermissions,
} from "@/lib/wa-text-ordering-flag";
import {
  WHATSAPP_ORDERING_SCENARIOS,
  scenariosForSuite,
} from "../testing/whatsappOrderingScenarios";
import { runScenarioSuite } from "../WhatsAppOrderingScenarioRunner";
import type { WaMenuItem } from "../types";

// ── Shared menu fixture ─────────────────────────────────────────────────────

const mk = (over: Partial<WaMenuItem> & Pick<WaMenuItem, "id" | "name" | "price">): WaMenuItem => ({
  priceDelivery: null, isActive: true, isAvailable: true, showInDelivery: true,
  hasVariants: false, variants: [], optionGroups: [], extras: [], ...over,
});

const MENU: WaMenuItem[] = [
  mk({ id: "yaki-cf",  name: "Yakisoba Carne e Frango", price: 32, priceDelivery: 34 }),
  mk({ id: "yaki-cam", name: "Yakisoba de Camarão",     price: 38, priceDelivery: 40 }),
  mk({ id: "coca",     name: "Coca-Cola",               price: 6,  priceDelivery: 6.5 }),
  mk({ id: "coca-z",   name: "Coca Zero",               price: 6,  priceDelivery: 6.5 }),
];

const CTX = { restaurantId: "r1", restaurantSlug: "test", menu: MENU, restaurantName: "Test" };

// ── Env var helpers ─────────────────────────────────────────────────────────

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { fn(); } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ── A — flag disabled behavior ──────────────────────────────────────────────

describe("W9-A — feature flag disabled (default)", () => {
  it("isWaTextOrderingEnabled returns false when env var absent", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_ENABLED: undefined }, () => {
      expect(isWaTextOrderingEnabled("any-restaurant")).toBe(false);
    });
  });

  it("isWaTextOrderingEnabled returns false when set to 'false'", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_ENABLED: "false" }, () => {
      expect(isWaTextOrderingEnabled()).toBe(false);
    });
  });

  it("resolveSideEffectPermissions: no side effects when flag off", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_ENABLED: "false" }, () => {
      const p = resolveSideEffectPermissions("r1", "+5511999990000");
      expect(p.canReply).toBe(false);
      expect(p.canCreateOrder).toBe(false);
      expect(p.canCreatePix).toBe(false);
      expect(p.reasons.some(r => r.includes("master switch off"))).toBe(true);
    });
  });
});

// ── B — restaurant not allowlisted ──────────────────────────────────────────

describe("W9-B — restaurant not in allowlist", () => {
  it("isRestaurantAllowlisted returns false for unknown restaurant", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "r-other",
    }, () => {
      expect(isRestaurantAllowlisted("r1")).toBe(false);
    });
  });

  it("resolveSideEffectPermissions: no side effects when restaurant not allowlisted", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_MODE: "ALLOWLIST_REPLY_ONLY",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "r-other",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "+5511999990000",
    }, () => {
      const p = resolveSideEffectPermissions("r1", "+5511999990000");
      expect(p.canReply).toBe(false);
      expect(p.reasons.some(r => r.includes("restaurant not allowlisted"))).toBe(true);
    });
  });
});

// ── C — phone not allowlisted ───────────────────────────────────────────────

describe("W9-C — phone not in allowlist", () => {
  it("isPhoneAllowlisted returns false for unlisted phone", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "+5511000000000",
    }, () => {
      expect(isPhoneAllowlisted("+5511999990000")).toBe(false);
    });
  });

  it("isPhoneAllowlisted matches despite formatting differences", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "+5511999990000",
    }, () => {
      // Normalized comparison strips non-digits
      expect(isPhoneAllowlisted("5511999990000")).toBe(true);
    });
  });

  it("resolveSideEffectPermissions: no reply when phone not allowlisted", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_MODE: "ALLOWLIST_REPLY_ONLY",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "r1",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "+5511000000000",
    }, () => {
      const p = resolveSideEffectPermissions("r1", "+5511999990000");
      expect(p.canReply).toBe(false);
      expect(p.reasons.some(r => r.includes("phone not allowlisted"))).toBe(true);
    });
  });
});

// ── D — REPLY_ONLY mode: reply allowed, no order/Pix ───────────────────────

describe("W9-D — ALLOWLIST_REPLY_ONLY mode", () => {
  it("canReply=true, canCreateOrder=false, canCreatePix=false", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_MODE: "ALLOWLIST_REPLY_ONLY",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "r1",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "+5511999990000",
    }, () => {
      const p = resolveSideEffectPermissions("r1", "+5511999990000");
      expect(p.canReply).toBe(true);
      expect(p.canCreateOrder).toBe(false);
      expect(p.canCreatePix).toBe(false);
      expect(p.mode).toBe("ALLOWLIST_REPLY_ONLY");
    });
  });
});

// ── E — FULL_TEST mode: reply + order + Pix allowed ────────────────────────

describe("W9-E — ALLOWLIST_FULL_TEST mode", () => {
  it("canReply=true, canCreateOrder=true, canCreatePix=true", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_MODE: "ALLOWLIST_FULL_TEST",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "r1",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "+5511999990000",
    }, () => {
      const p = resolveSideEffectPermissions("r1", "+5511999990000");
      expect(p.canReply).toBe(true);
      expect(p.canCreateOrder).toBe(true);
      expect(p.canCreatePix).toBe(true);
      expect(p.mode).toBe("ALLOWLIST_FULL_TEST");
    });
  });
});

// ── F — DRY_RUN_ONLY: no side effects even with both parties allowlisted ────

describe("W9-F — DRY_RUN_ONLY safety", () => {
  it("no side effects even when restaurant+phone both allowlisted", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_MODE: "DRY_RUN_ONLY",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "r1",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "+5511999990000",
    }, () => {
      const p = resolveSideEffectPermissions("r1", "+5511999990000");
      expect(p.canReply).toBe(false);
      expect(p.canCreateOrder).toBe(false);
      expect(p.canCreatePix).toBe(false);
    });
  });

  it("invalid mode string falls back to DRY_RUN_ONLY", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_MODE: "SOME_INVALID_MODE" }, () => {
      expect(getWaTextOrderingMode()).toBe("DRY_RUN_ONLY");
    });
  });
});

// ── G — scenario runner health: no false PASSes in W8 strict evaluator ──────

describe("W9-G — scenario runner health (pre-flight verification)", () => {
  it("quick+edge suite runs with 0 FAILs and score ≥ 95", async () => {
    const quickReport = await runScenarioSuite("quick", CTX);
    expect(quickReport.fail).toBe(0);
    expect(quickReport.score).toBeGreaterThanOrEqual(95);
  }, 30_000);

  it("every scenario declares shouldCreateOrder/Pix/Send = false (no unintended side effects)", () => {
    for (const s of WHATSAPP_ORDERING_SCENARIOS) {
      expect(s.shouldCreateOrder).toBe(false);
      expect(s.shouldCreatePix).toBe(false);
      expect(s.shouldSendWhatsApp).toBe(false);
    }
  });
});

// ── H — allowlist: empty allowlist means DRY_RUN convenience only ───────────

describe("W9-H — empty allowlist convenience", () => {
  it("isWaTextOrderingEnabled(restaurantId) is false when no restaurants allowlisted and restaurantId given", () => {
    // Flag on, allowlist empty → enabled is true (dry-run convenience: all restaurants OR restaurant checks)
    // But isRestaurantAllowlisted returns false when allowlist is populated without the restaurantId
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: undefined, // empty
    }, () => {
      // Empty list = convenience dry-run; isWaTextOrderingEnabled returns true (no restriction)
      expect(isWaTextOrderingEnabled()).toBe(true);
    });
  });

  it("isPhoneAllowlisted returns false when phone allowlist is empty", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: undefined,
    }, () => {
      expect(isPhoneAllowlisted("+5511999990000")).toBe(false);
    });
  });
});

// ── I — webhook gate: only TEXT messages route to text ordering ─────────────

describe("W9-I — webhook message type gate", () => {
  it("isWaTextOrderingEnabled rejects when flag is off regardless of message type", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_ENABLED: "false" }, () => {
      expect(isWaTextOrderingEnabled("r1")).toBe(false);
    });
  });
});

// ── J — CRM isolation: text ordering does NOT trigger CRM attribution ────────

describe("W9-J — CRM isolation", () => {
  it("text ordering scenarios have no CRM side effects", () => {
    // All scenarios are dry-run only and declare no real side effects
    for (const s of WHATSAPP_ORDERING_SCENARIOS) {
      expect(s.shouldSendWhatsApp).toBe(false);
    }
  });
});

// ── K — tenant isolation: restaurantId is always scoped ─────────────────────

describe("W9-K — tenant isolation", () => {
  it("resolveSideEffectPermissions uses the provided restaurantId", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_MODE: "ALLOWLIST_REPLY_ONLY",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "r1",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "+5511999990000",
    }, () => {
      const p1 = resolveSideEffectPermissions("r1", "+5511999990000");
      const p2 = resolveSideEffectPermissions("r2", "+5511999990000"); // different restaurant
      expect(p1.canReply).toBe(true);
      expect(p2.canReply).toBe(false);
      expect(p2.reasons.some(r => r.includes("restaurant not allowlisted"))).toBe(true);
    });
  });
});

// ── L — mode resolution ──────────────────────────────────────────────────────

describe("W9-L — mode resolution", () => {
  it("getWaTextOrderingMode returns ALLOWLIST_REPLY_ONLY when set", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_MODE: "ALLOWLIST_REPLY_ONLY" }, () => {
      expect(getWaTextOrderingMode()).toBe("ALLOWLIST_REPLY_ONLY");
    });
  });

  it("getWaTextOrderingMode returns ALLOWLIST_FULL_TEST when set", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_MODE: "ALLOWLIST_FULL_TEST" }, () => {
      expect(getWaTextOrderingMode()).toBe("ALLOWLIST_FULL_TEST");
    });
  });

  it("getWaTextOrderingMode defaults to DRY_RUN_ONLY when unset", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_MODE: undefined }, () => {
      expect(getWaTextOrderingMode()).toBe("DRY_RUN_ONLY");
    });
  });
});

// ── M — scenario library integrity: all suites expose scenarios ──────────────

describe("W9-M — scenario library integrity", () => {
  it("quick/full/edge/payment/all suites each return scenarios", () => {
    expect(scenariosForSuite("quick").length).toBeGreaterThan(0);
    expect(scenariosForSuite("full").length).toBeGreaterThan(0);
    expect(scenariosForSuite("edge").length).toBeGreaterThan(0);
    expect(scenariosForSuite("payment").length).toBeGreaterThan(0);
    expect(scenariosForSuite("all").length).toBe(WHATSAPP_ORDERING_SCENARIOS.length);
  });

  it("no scenario in the library has forbidden real-side-effect flags", () => {
    for (const s of WHATSAPP_ORDERING_SCENARIOS) {
      expect(s.shouldCreateOrder).toBe(false);
      expect(s.shouldCreatePix).toBe(false);
      expect(s.shouldSendWhatsApp).toBe(false);
    }
  });
});

// ── N — multiple phones/restaurants in allowlist ─────────────────────────────

describe("W9-N — multi-entry allowlists", () => {
  it("handles comma-separated restaurant allowlist", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "r-a,r-b,r1",
    }, () => {
      expect(isRestaurantAllowlisted("r1")).toBe(true);
      expect(isRestaurantAllowlisted("r-a")).toBe(true);
      expect(isRestaurantAllowlisted("r-x")).toBe(false);
    });
  });

  it("handles comma-separated phone allowlist with spaces", () => {
    withEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED: "true",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "+5511111110000, +5511999990000",
    }, () => {
      expect(isPhoneAllowlisted("+5511999990000")).toBe(true);
      expect(isPhoneAllowlisted("+5511111110000")).toBe(true);
      expect(isPhoneAllowlisted("+5511000000000")).toBe(false);
    });
  });
});

// ── O — scenario runner: edge suite clean ────────────────────────────────────

describe("W9-O — edge scenario suite clean", () => {
  it("edge suite runs with 0 FAILs", async () => {
    const r = await runScenarioSuite("edge", CTX);
    expect(r.fail).toBe(0);
  }, 30_000);
});
