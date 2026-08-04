/**
 * WhatsAppLiveRouting — proves the controlled live-routing gate behaves correctly
 * and, critically, that phone allowlist matching is tolerant of every common
 * Brazilian phone format. A real allowlisted test message must route into Text
 * Ordering regardless of whether the allowlist entry was typed as +5511…, 5511…,
 * or 11…, and regardless of the mobile 9th digit.
 *
 * Root cause this guards against: o webhook entrega o telefone como JID E.164
 * ("+5511999990000"); if the allowlist was typed in a different format the naive
 * digit-strip comparison silently failed and the message fell back to the old
 * WhatsApp Agent.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  isPhoneAllowlisted,
  isRestaurantAllowlisted,
  isWaTextOrderingEnabled,
  getRoutingDecision,
  maskPhone,
} from "@/lib/wa-text-ordering-flag";

const ENV_KEYS = [
  "WHATSAPP_TEXT_ORDERING_ENABLED",
  "WHATSAPP_TEXT_ORDERING_MODE",
  "WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS",
  "WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES",
] as const;

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { fn(); } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

// A forma exata que o webhook entrega (jidToPhone → "+5511999990000").
const WEBHOOK_PHONE = "+5511999990000";

// ── D. Phone normalization across all formats ──────────────────────────────────

describe("LiveRouting D — phone normalization is format-tolerant", () => {
  const formats = [
    "+5511999990000", // E.164 (o que o webhook entrega)
    "5511999990000",  // country code, no plus
    "11999990000",    // national with 9th digit
    "551199990000",   // country code, no 9th digit
    "1199990000",     // national, no 9th digit
    "+55 11 99999-0000", // pretty-printed
  ];

  for (const stored of formats) {
    it(`allowlist entry "${stored}" matches the webhook JID ${WEBHOOK_PHONE}`, () => {
      withEnv(
        {
          WHATSAPP_TEXT_ORDERING_ENABLED: "true",
          WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: stored,
        },
        () => {
          expect(isPhoneAllowlisted(WEBHOOK_PHONE)).toBe(true);
        },
      );
    });
  }

  it("a genuinely different number does NOT match", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED: "true",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "+5511999990000",
      },
      () => {
        expect(isPhoneAllowlisted("+5511888887777")).toBe(false);
      },
    );
  });

  it("a different DDD does NOT collide", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED: "true",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "11999990000",
      },
      () => {
        expect(isPhoneAllowlisted("+5521999990000")).toBe(false);
      },
    );
  });
});

// ── A. Fully allowlisted routes to Text Ordering ───────────────────────────────

describe("LiveRouting A — enabled + restaurant + phone allowlisted routes live", () => {
  it("shouldUseTextOrdering=true when all guards pass", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED: "true",
        WHATSAPP_TEXT_ORDERING_MODE: "ALLOWLIST_REPLY_ONLY",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "rest-cazza",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "11999990000",
      },
      () => {
        const d = getRoutingDecision("rest-cazza", WEBHOOK_PHONE);
        expect(d.shouldUseTextOrdering).toBe(true);
        expect(d.declineReason).toBeNull();
        expect(isWaTextOrderingEnabled("rest-cazza")).toBe(true);
        expect(isRestaurantAllowlisted("rest-cazza")).toBe(true);
      },
    );
  });
});

// ── B. Non-allowlisted phone falls back ────────────────────────────────────────

describe("LiveRouting B — non-allowlisted phone falls back to old agent", () => {
  it("shouldUseTextOrdering=false with phone decline reason", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED: "true",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "rest-cazza",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "11999990000",
      },
      () => {
        const d = getRoutingDecision("rest-cazza", "+5511888887777");
        expect(d.shouldUseTextOrdering).toBe(false);
        expect(d.declineReason).toContain("phone not allowlisted");
      },
    );
  });
});

// ── C. Disabled flag falls back ────────────────────────────────────────────────

describe("LiveRouting C — disabled flag falls back to old agent", () => {
  it("shouldUseTextOrdering=false with master-switch decline reason", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_ENABLED: undefined }, () => {
      const d = getRoutingDecision("rest-cazza", WEBHOOK_PHONE);
      expect(d.shouldUseTextOrdering).toBe(false);
      expect(d.declineReason).toContain("master switch off");
    });
  });
});

// ── F. Restaurant decline reason is exact ──────────────────────────────────────

describe("LiveRouting F — restaurant not allowlisted decline reason", () => {
  it("names the restaurant allowlist env var", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED: "true",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "rest-other",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES: "11999990000",
      },
      () => {
        const d = getRoutingDecision("rest-cazza", WEBHOOK_PHONE);
        expect(d.shouldUseTextOrdering).toBe(false);
        expect(d.declineReason).toContain("restaurant not allowlisted");
        expect(d.enabledForRestaurant).toBe(false);
      },
    );
  });
});

// ── maskPhone safety ───────────────────────────────────────────────────────────

describe("LiveRouting — maskPhone never leaks the full number", () => {
  it("masks the middle digits", () => {
    const masked = maskPhone(WEBHOOK_PHONE);
    expect(masked).not.toContain("99999");
    expect(masked).toMatch(/\*\*\*/);
    expect(masked.endsWith("00")).toBe(true);
  });
});
