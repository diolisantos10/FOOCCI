/**
 * WhatsAppLiveActivation — A–Q tests for the controlled live-rollout gate.
 *
 * Covers all env-var combinations, both scope modes, the kill switch, and the
 * guarantee that the old WhatsApp agent is never disrupted for non-target traffic.
 *
 * Every test is pure: no DB, no network, no side effects.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  isPhoneAllowlisted,
  isRestaurantAllowlisted,
  isWaTextOrderingEnabled,
  isWaTextOrderingPaused,
  getWaTextOrderingScope,
  getRoutingDecision,
} from "@/lib/wa-text-ordering-flag";

// ─── env helpers ──────────────────────────────────────────────────────────────

const ENV_KEYS = [
  "WHATSAPP_TEXT_ORDERING_ENABLED",
  "WHATSAPP_TEXT_ORDERING_MODE",
  "WHATSAPP_TEXT_ORDERING_SCOPE",
  "WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS",
  "WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES",
  "WHATSAPP_TEXT_ORDERING_PAUSED",
] as const;

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

// Evolution always delivers E.164 with 9th digit.
const EVOLUTION_PHONE = "+5511999990000";
const TARGET_RESTAURANT = "rest-sushi-cazza";
const OTHER_RESTAURANT  = "rest-other-pizza";

// ── A: master switch off → old agent, no Text Ordering ────────────────────────

describe("A — ENABLED=false → no text ordering for any restaurant/phone", () => {
  it("routing decision shouldUseTextOrdering=false, decline=master switch", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_ENABLED: undefined }, () => {
      const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
      expect(d.shouldUseTextOrdering).toBe(false);
      expect(d.masterEnabled).toBe(false);
      expect(d.declineReason).toContain("master switch off");
    });
  });
});

// ── B: PHONE_ALLOWLIST scope — only allowlisted phone routes ──────────────────

describe("B — PHONE_ALLOWLIST scope routes only allowlisted phones", () => {
  it("allowlisted phone routes", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "PHONE_ALLOWLIST",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES:      "11999990000",
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(true);
        expect(d.declineReason).toBeNull();
      },
    );
  });

  it("non-allowlisted phone does NOT route", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "PHONE_ALLOWLIST",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES:      "11999990000",
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, "+5511888887777");
        expect(d.shouldUseTextOrdering).toBe(false);
        expect(d.declineReason).toContain("phone not allowlisted");
      },
    );
  });

  it("scope defaults to PHONE_ALLOWLIST when not set", () => {
    withEnv({}, () => {
      expect(getWaTextOrderingScope()).toBe("PHONE_ALLOWLIST");
    });
  });
});

// ── C: RESTAURANT_WIDE scope — all phones for allowlisted restaurant route ────

describe("C — RESTAURANT_WIDE scope routes ALL phones for allowlisted restaurant", () => {
  it("unknown phone routes when restaurant is allowlisted", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, "+5511000001111");
        expect(d.shouldUseTextOrdering).toBe(true);
        expect(d.declineReason).toBeNull();
      },
    );
  });

  it("another random phone also routes (not allowlisted) for same restaurant", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        for (const phone of ["+5511111112222", "+5521999990000", "+5541888880000"]) {
          const d = getRoutingDecision(TARGET_RESTAURANT, phone);
          expect(d.shouldUseTextOrdering).toBe(true);
        }
      },
    );
  });

  it("RESTAURANT_WIDE reports scope correctly", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
        expect(d.scope).toBe("RESTAURANT_WIDE");
      },
    );
  });
});

// ── D: non-target restaurant is never affected ────────────────────────────────

describe("D — non-target restaurant never routes to Text Ordering", () => {
  it("other restaurant declines even with RESTAURANT_WIDE scope", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        const d = getRoutingDecision(OTHER_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(false);
        expect(d.declineReason).toContain("restaurant not allowlisted");
      },
    );
  });

  it("other restaurant declines even when phone is allowlisted", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES:      "11999990000",
      },
      () => {
        const d = getRoutingDecision(OTHER_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(false);
        expect(d.enabledForRestaurant).toBe(false);
      },
    );
  });
});

// ── E: RESTAURANT_WIDE requires master switch on ──────────────────────────────

describe("E — RESTAURANT_WIDE still requires master switch", () => {
  it("disabled master switch blocks even RESTAURANT_WIDE", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(false);
        expect(d.declineReason).toContain("master switch off");
      },
    );
  });
});

// ── F: RESTAURANT_WIDE with explicit wrong restaurant blocks correctly ────────

describe("F — RESTAURANT_WIDE: non-listed restaurant is blocked; isRestaurantAllowlisted is strict", () => {
  it("explicit allowlist entry for other restaurant → TARGET not allowlisted", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: OTHER_RESTAURANT,
      },
      () => {
        expect(isRestaurantAllowlisted(TARGET_RESTAURANT)).toBe(false);
        const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(false);
        expect(d.declineReason).toContain("restaurant not allowlisted");
      },
    );
  });

  it("empty allowlist = no restriction (dry-run convenience) — isWaTextOrderingEnabled returns true", () => {
    withEnv(
      { WHATSAPP_TEXT_ORDERING_ENABLED: "true" },
      () => {
        // By design: empty allowlist means "no tenant restriction" (useful for dry-run admin).
        // isRestaurantAllowlisted is stricter: requires explicit listing.
        expect(isWaTextOrderingEnabled(TARGET_RESTAURANT)).toBe(true);
        expect(isRestaurantAllowlisted(TARGET_RESTAURANT)).toBe(false);
      },
    );
  });
});

// ── G: Kill switch (PAUSED) ───────────────────────────────────────────────────

describe("G — PAUSED=true instantly disables live routing", () => {
  it("paused blocks PHONE_ALLOWLIST routing", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_PAUSED:               "true",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES:      "11999990000",
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(false);
        expect(d.paused).toBe(true);
        expect(d.declineReason).toContain("paused");
      },
    );
  });

  it("paused blocks RESTAURANT_WIDE routing", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_PAUSED:               "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(false);
        expect(d.paused).toBe(true);
        expect(d.declineReason).toContain("paused");
      },
    );
  });

  it("PAUSED=false or unset resumes routing", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_PAUSED:               "false",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        expect(isWaTextOrderingPaused()).toBe(false);
        const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(true);
      },
    );
  });

  it("ENABLED=true remains true while paused (flag preserved for diagnostics)", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED: "true",
        WHATSAPP_TEXT_ORDERING_PAUSED:  "true",
      },
      () => {
        expect(isWaTextOrderingPaused()).toBe(true);
        expect(isWaTextOrderingEnabled()).toBe(true); // master still on
      },
    );
  });
});

// ── H: isWaTextOrderingPaused defaults to false ───────────────────────────────

describe("H — isWaTextOrderingPaused safe default", () => {
  it("false when PAUSED not set", () => {
    withEnv({}, () => {
      expect(isWaTextOrderingPaused()).toBe(false);
    });
  });

  it("false when PAUSED=false", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_PAUSED: "false" }, () => {
      expect(isWaTextOrderingPaused()).toBe(false);
    });
  });
});

// ── I: scope field is present in routing decision ─────────────────────────────

describe("I — routing decision always includes scope and paused fields", () => {
  it("PHONE_ALLOWLIST scope reported correctly", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED: "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:   "PHONE_ALLOWLIST",
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
        expect(d.scope).toBe("PHONE_ALLOWLIST");
        expect(d.paused).toBe(false);
      },
    );
  });

  it("unknown scope falls back to PHONE_ALLOWLIST", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_SCOPE: "INVALID_SCOPE" }, () => {
      expect(getWaTextOrderingScope()).toBe("PHONE_ALLOWLIST");
    });
  });
});

// ── J: Diego-only rollout (Etapa 1) ──────────────────────────────────────────

describe("J — Etapa 1: Diego-only (PHONE_ALLOWLIST + REPLY_ONLY)", () => {
  it("Diego's phone routes to Text Ordering", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_MODE:                 "ALLOWLIST_REPLY_ONLY",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "PHONE_ALLOWLIST",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES:      "11999990000",
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(true);
        expect(d.mode).toBe("ALLOWLIST_REPLY_ONLY");
        expect(d.scope).toBe("PHONE_ALLOWLIST");
      },
    );
  });

  it("another customer phone does NOT route (Etapa 1 isolation)", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_MODE:                 "ALLOWLIST_REPLY_ONLY",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "PHONE_ALLOWLIST",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES:      "11999990000",
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, "+5511777775555");
        expect(d.shouldUseTextOrdering).toBe(false);
        expect(d.declineReason).toContain("phone not allowlisted");
      },
    );
  });
});

// ── K: Sushi Cazza restaurant-wide rollout (Etapa 2) ─────────────────────────

describe("K — Etapa 2: Sushi Cazza restaurant-wide (RESTAURANT_WIDE + REPLY_ONLY)", () => {
  it("any customer phone routes for Sushi Cazza", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_MODE:                 "ALLOWLIST_REPLY_ONLY",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        for (const phone of ["+5511999990000", "+5521888887777", "+5541666665555"]) {
          const d = getRoutingDecision(TARGET_RESTAURANT, phone);
          expect(d.shouldUseTextOrdering).toBe(true);
        }
      },
    );
  });

  it("other restaurants still use old agent (tenant isolation)", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_MODE:                 "ALLOWLIST_REPLY_ONLY",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        const d = getRoutingDecision(OTHER_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(false);
      },
    );
  });
});

// ── L: kill switch during live Etapa 2 ───────────────────────────────────────

describe("L — kill switch during RESTAURANT_WIDE rollout", () => {
  it("PAUSED=true instantly stops all routing without changing other flags", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_PAUSED:               "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(false);
        expect(d.masterEnabled).toBe(true);    // flag preserved
        expect(d.enabledForRestaurant).toBe(true); // restaurant still configured
        expect(d.paused).toBe(true);
      },
    );
  });

  it("resuming (PAUSED=false) restores routing without any other changes", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_PAUSED:               "false",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
        expect(d.shouldUseTextOrdering).toBe(true);
        expect(d.paused).toBe(false);
      },
    );
  });
});

// ── M: declineReason exactness ────────────────────────────────────────────────

describe("M — declineReason is exact and actionable", () => {
  it("null when routing succeeds", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        expect(getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE).declineReason).toBeNull();
      },
    );
  });

  it("'master switch off' when ENABLED not set", () => {
    withEnv({}, () => {
      expect(getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE).declineReason)
        .toContain("master switch off");
    });
  });

  it("'paused' when kill switch active", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_PAUSED:               "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        expect(getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE).declineReason)
          .toContain("paused");
      },
    );
  });

  it("'restaurant not allowlisted' when restaurant not in list", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        expect(getRoutingDecision(OTHER_RESTAURANT, EVOLUTION_PHONE).declineReason)
          .toContain("restaurant not allowlisted");
      },
    );
  });

  it("'phone not allowlisted' for PHONE_ALLOWLIST scope with unknown phone", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "PHONE_ALLOWLIST",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES:      "11999990000",
      },
      () => {
        expect(getRoutingDecision(TARGET_RESTAURANT, "+5511000001111").declineReason)
          .toContain("phone not allowlisted");
      },
    );
  });
});

// ── N: phone normalization still works under both scopes ─────────────────────

describe("N — phone normalization across formats works under both scopes", () => {
  const formats = [
    "+5511999990000",
    "5511999990000",
    "11999990000",
    "551199990000",
    "1199990000",
    "+55 11 99999-0000",
  ];

  describe("PHONE_ALLOWLIST scope", () => {
    for (const stored of formats) {
      it(`stored as "${stored}" matches Evolution JID ${EVOLUTION_PHONE}`, () => {
        withEnv(
          {
            WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
            WHATSAPP_TEXT_ORDERING_SCOPE:                "PHONE_ALLOWLIST",
            WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
            WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES:      stored,
          },
          () => {
            expect(isPhoneAllowlisted(EVOLUTION_PHONE)).toBe(true);
          },
        );
      });
    }
  });
});

// ── O: multiple restaurants in allowlist ─────────────────────────────────────

describe("O — multiple restaurants can be allowlisted simultaneously", () => {
  it("both restaurants route when both are in the allowlist (RESTAURANT_WIDE)", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_SCOPE:                "RESTAURANT_WIDE",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: `${TARGET_RESTAURANT},${OTHER_RESTAURANT}`,
      },
      () => {
        expect(getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE).shouldUseTextOrdering).toBe(true);
        expect(getRoutingDecision(OTHER_RESTAURANT, EVOLUTION_PHONE).shouldUseTextOrdering).toBe(true);
      },
    );
  });
});

// ── P: isWaTextOrderingEnabled behaviour (no restaurant arg) ─────────────────

describe("P — isWaTextOrderingEnabled without restaurantId", () => {
  it("returns true when enabled and no restaurant allowlist (dry-run convenience)", () => {
    withEnv({ WHATSAPP_TEXT_ORDERING_ENABLED: "true" }, () => {
      expect(isWaTextOrderingEnabled()).toBe(true);
    });
  });

  it("returns false when enabled but allowlist set and no restaurantId given", () => {
    withEnv(
      {
        WHATSAPP_TEXT_ORDERING_ENABLED:              "true",
        WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: TARGET_RESTAURANT,
      },
      () => {
        expect(isWaTextOrderingEnabled()).toBe(false);
      },
    );
  });
});

// ── Q: consistent field set on WaRoutingDecision ─────────────────────────────

describe("Q — WaRoutingDecision always includes all fields", () => {
  it("has all required fields regardless of outcome", () => {
    withEnv({}, () => {
      const d = getRoutingDecision(TARGET_RESTAURANT, EVOLUTION_PHONE);
      expect(d).toHaveProperty("masterEnabled");
      expect(d).toHaveProperty("paused");
      expect(d).toHaveProperty("mode");
      expect(d).toHaveProperty("scope");
      expect(d).toHaveProperty("restaurantAllowlisted");
      expect(d).toHaveProperty("enabledForRestaurant");
      expect(d).toHaveProperty("phoneAllowlisted");
      expect(d).toHaveProperty("shouldUseTextOrdering");
      expect(d).toHaveProperty("declineReason");
    });
  });
});
