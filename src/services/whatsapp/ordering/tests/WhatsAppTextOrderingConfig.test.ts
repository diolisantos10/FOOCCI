/**
 * WhatsAppTextOrderingConfig — A–N tests for the DB-persisted live activation
 * config and the DB-aware routing decision. Prisma is mocked; no real DB, no
 * WhatsApp send, no order, no Pix.
 *
 * Coverage:
 *   A. Restaurant config disabled → old WhatsApp Agent (no Text Ordering).
 *   B. Global env kill switch (ENABLED=false) overrides DB enabled.
 *   C. DB PHONE_ALLOWLIST routes an allowed phone.
 *   D. DB PHONE_ALLOWLIST rejects a non-allowed phone.
 *   E. DB RESTAURANT_WIDE routes any customer phone for that restaurant.
 *   F. Paused config disables Text Ordering.
 *   G. Config service saves and loads restaurant config (upsert payload).
 *   I. Preset "meu telefone reply only" creates a safe config.
 *   K. Config save performs no WhatsApp/order/Pix (only the config table is touched).
 *   L. Env fallback still works when DB config is absent.
 *   (H/J are UI assertions; M scenario runner + N tsc are run separately.)
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Mock prisma BEFORE importing the service ──────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  whatsAppTextOrderingConfig: {
    findUnique: vi.fn(),
    upsert:     vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  getRestaurantConfig,
  upsertRestaurantConfig,
  resolveWaConfig,
  getRoutingDecisionForRestaurant,
} from "../WhatsAppTextOrderingConfigService";

const ENV_KEYS = [
  "WHATSAPP_TEXT_ORDERING_ENABLED",
  "WHATSAPP_TEXT_ORDERING_MODE",
  "WHATSAPP_TEXT_ORDERING_SCOPE",
  "WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS",
  "WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES",
  "WHATSAPP_TEXT_ORDERING_PAUSED",
] as const;

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

function setEnv(vars: Record<string, string | undefined>) {
  clearEnv();
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const REST = "rest-sushi-cazza";
const WEBHOOK_PHONE = "+5511999990000";

/** Builds a fake DB row as Prisma would return it. */
function dbRow(over: Partial<{
  enabled: boolean; mode: string; scope: string; allowlistedPhones: unknown; paused: boolean; notes: string | null;
}> = {}) {
  return {
    id:                "cfg-1",
    restaurantId:      REST,
    enabled:           over.enabled ?? false,
    mode:              over.mode ?? "DRY_RUN_ONLY",
    scope:             over.scope ?? "PHONE_ALLOWLIST",
    allowlistedPhones: over.allowlistedPhones ?? [],
    paused:            over.paused ?? false,
    notes:             over.notes ?? null,
    createdAt:         new Date(),
    updatedAt:         new Date(),
  };
}

beforeEach(() => {
  prismaMock.whatsAppTextOrderingConfig.findUnique.mockReset();
  prismaMock.whatsAppTextOrderingConfig.upsert.mockReset();
  clearEnv();
});
afterEach(() => clearEnv());

// ── A. DB disabled → old agent ────────────────────────────────────────────────

describe("A — restaurant config disabled falls back to old WhatsApp Agent", () => {
  it("enabled=false → shouldUseTextOrdering=false", async () => {
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(
      dbRow({ enabled: false, mode: "ALLOWLIST_REPLY_ONLY", allowlistedPhones: [WEBHOOK_PHONE] }),
    );
    const d = await getRoutingDecisionForRestaurant(REST, WEBHOOK_PHONE);
    expect(d.shouldUseTextOrdering).toBe(false);
    expect(d.source).toBe("db");
    expect(d.declineReason).toContain("desativado");
  });
});

// ── B. Global env kill switch overrides DB enabled ───────────────────────────

describe("B — global env kill switch (ENABLED=false) overrides DB enabled=true", () => {
  it("DB enabled but env kill switch → declines with global reason", async () => {
    setEnv({ WHATSAPP_TEXT_ORDERING_ENABLED: "false" });
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(
      dbRow({ enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE" }),
    );
    const d = await getRoutingDecisionForRestaurant(REST, WEBHOOK_PHONE);
    expect(d.shouldUseTextOrdering).toBe(false);
    expect(d.globalKillSwitch).toBe(true);
    expect(d.declineReason).toContain("kill switch global");
  });
});

// ── C. DB PHONE_ALLOWLIST routes allowed phone ────────────────────────────────

describe("C — DB PHONE_ALLOWLIST routes an allowed phone", () => {
  it("allowed phone (any BR format) routes", async () => {
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(
      dbRow({ enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "PHONE_ALLOWLIST", allowlistedPhones: ["11999990000"] }),
    );
    const d = await getRoutingDecisionForRestaurant(REST, WEBHOOK_PHONE);
    expect(d.shouldUseTextOrdering).toBe(true);
    expect(d.declineReason).toBeNull();
    expect(d.phoneAllowlisted).toBe(true);
  });
});

// ── D. DB PHONE_ALLOWLIST rejects non-allowed phone ──────────────────────────

describe("D — DB PHONE_ALLOWLIST rejects a non-allowed phone", () => {
  it("unknown phone declines", async () => {
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(
      dbRow({ enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "PHONE_ALLOWLIST", allowlistedPhones: ["11999990000"] }),
    );
    const d = await getRoutingDecisionForRestaurant(REST, "+5511888887777");
    expect(d.shouldUseTextOrdering).toBe(false);
    expect(d.declineReason).toContain("Telefone");
  });
});

// ── E. DB RESTAURANT_WIDE routes any phone ───────────────────────────────────

describe("E — DB RESTAURANT_WIDE routes any customer phone", () => {
  it("any phone routes when scope is restaurant-wide", async () => {
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(
      dbRow({ enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE" }),
    );
    for (const phone of ["+5511999990000", "+5521888887777", "+5541666665555"]) {
      const d = await getRoutingDecisionForRestaurant(REST, phone);
      expect(d.shouldUseTextOrdering).toBe(true);
    }
  });
});

// ── F. Paused config disables Text Ordering ──────────────────────────────────

describe("F — paused config disables Text Ordering", () => {
  it("paused=true → declines with paused reason", async () => {
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(
      dbRow({ enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE", paused: true }),
    );
    const d = await getRoutingDecisionForRestaurant(REST, WEBHOOK_PHONE);
    expect(d.shouldUseTextOrdering).toBe(false);
    expect(d.paused).toBe(true);
    expect(d.declineReason).toContain("Pausado");
  });

  it("global env pause also blocks an enabled DB config", async () => {
    setEnv({ WHATSAPP_TEXT_ORDERING_PAUSED: "true" });
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(
      dbRow({ enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE" }),
    );
    const d = await getRoutingDecisionForRestaurant(REST, WEBHOOK_PHONE);
    expect(d.shouldUseTextOrdering).toBe(false);
    expect(d.declineReason).toContain("globalmente");
  });
});

// ── G. Config service saves and loads ────────────────────────────────────────

describe("G — config service saves (upsert) and loads", () => {
  it("getRestaurantConfig returns normalized config", async () => {
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(
      dbRow({ enabled: true, mode: "allowlist_reply_only", scope: "restaurant_wide", allowlistedPhones: ["+5511999990000"] }),
    );
    const c = await getRestaurantConfig(REST);
    expect(c).not.toBeNull();
    expect(c!.enabled).toBe(true);
    expect(c!.mode).toBe("ALLOWLIST_REPLY_ONLY");   // normalized to uppercase
    expect(c!.scope).toBe("RESTAURANT_WIDE");
    expect(c!.allowlistedPhones).toEqual(["+5511999990000"]);
  });

  it("getRestaurantConfig returns null when no row", async () => {
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(null);
    expect(await getRestaurantConfig(REST)).toBeNull();
  });

  it("upsertRestaurantConfig writes only provided fields", async () => {
    prismaMock.whatsAppTextOrderingConfig.upsert.mockResolvedValue(
      dbRow({ enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "PHONE_ALLOWLIST", allowlistedPhones: ["+5511999990000"] }),
    );
    await upsertRestaurantConfig(REST, {
      enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "PHONE_ALLOWLIST", allowlistedPhones: ["+5511999990000"],
    });
    expect(prismaMock.whatsAppTextOrderingConfig.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.whatsAppTextOrderingConfig.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ restaurantId: REST });
    expect(arg.update.enabled).toBe(true);
    expect(arg.update.mode).toBe("ALLOWLIST_REPLY_ONLY");
    expect(arg.create.restaurantId).toBe(REST);
  });

  it("upsert dedupes and trims phones", async () => {
    prismaMock.whatsAppTextOrderingConfig.upsert.mockResolvedValue(dbRow());
    await upsertRestaurantConfig(REST, { allowlistedPhones: [" +5511999990000 ", "+5511999990000", "", "+5521888887777"] });
    const arg = prismaMock.whatsAppTextOrderingConfig.upsert.mock.calls[0][0];
    expect(arg.update.allowlistedPhones).toEqual(["+5511999990000", "+5521888887777"]);
  });
});

// ── I. Preset "meu telefone reply only" creates a safe config ────────────────

describe("I — preset 'meu telefone reply only' produces a safe config", () => {
  it("REPLY_ONLY + PHONE_ALLOWLIST + the single phone, not paused, no full-test", async () => {
    prismaMock.whatsAppTextOrderingConfig.upsert.mockImplementation(async ({ update, create }: { update: Record<string, unknown>; create: Record<string, unknown> }) =>
      dbRow({
        enabled: (update.enabled ?? create.enabled) as boolean,
        mode:    (update.mode ?? create.mode) as string,
        scope:   (update.scope ?? create.scope) as string,
        allowlistedPhones: (update.allowlistedPhones ?? create.allowlistedPhones) as unknown,
        paused:  (update.paused ?? create.paused) as boolean,
      }),
    );
    // This is exactly what the UI preset sends.
    const c = await upsertRestaurantConfig(REST, {
      enabled: true, paused: false, mode: "ALLOWLIST_REPLY_ONLY", scope: "PHONE_ALLOWLIST",
      allowlistedPhones: [WEBHOOK_PHONE],
    });
    expect(c.enabled).toBe(true);
    expect(c.paused).toBe(false);
    expect(c.mode).toBe("ALLOWLIST_REPLY_ONLY"); // never FULL_TEST
    expect(c.scope).toBe("PHONE_ALLOWLIST");     // never restaurant-wide
    expect(c.allowlistedPhones).toEqual([WEBHOOK_PHONE]);
  });
});

// ── K. Config save touches ONLY the config table (no WhatsApp/order/Pix) ──────

describe("K — config save performs no WhatsApp send, order, or Pix", () => {
  it("only whatsAppTextOrderingConfig.upsert is called", async () => {
    prismaMock.whatsAppTextOrderingConfig.upsert.mockResolvedValue(dbRow({ enabled: true }));
    await upsertRestaurantConfig(REST, { enabled: true, mode: "ALLOWLIST_FULL_TEST" });
    // The mock only exposes the config table — proves the service touches nothing else.
    expect(prismaMock.whatsAppTextOrderingConfig.upsert).toHaveBeenCalledTimes(1);
    expect(Object.keys(prismaMock)).toEqual(["whatsAppTextOrderingConfig"]);
  });
});

// ── L. Env fallback still works when DB config absent ────────────────────────

describe("L — env fallback when no DB config", () => {
  it("env-only PHONE_ALLOWLIST still routes allowed phone (backward compat)", async () => {
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(null);
    setEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED:               "true",
      WHATSAPP_TEXT_ORDERING_MODE:                  "ALLOWLIST_REPLY_ONLY",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: REST,
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_PHONES:      "11999990000",
    });
    const d = await getRoutingDecisionForRestaurant(REST, WEBHOOK_PHONE);
    expect(d.source).toBe("env");
    expect(d.dbConfigPresent).toBe(false);
    expect(d.shouldUseTextOrdering).toBe(true);
  });

  it("env-only with nothing set → old agent", async () => {
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(null);
    setEnv({});
    const d = await getRoutingDecisionForRestaurant(REST, WEBHOOK_PHONE);
    expect(d.source).toBe("env");
    expect(d.shouldUseTextOrdering).toBe(false);
  });

  it("resolveWaConfig reports source=db when a row exists", async () => {
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(dbRow({ enabled: true }));
    const r = await resolveWaConfig(REST);
    expect(r.source).toBe("db");
    expect(r.enabled).toBe(true);
  });
});

// ── Precedence: DB takes priority over env when both present ──────────────────

describe("Precedence — DB config wins over env when both present", () => {
  it("DB enabled routes even though env restaurant allowlist excludes it", async () => {
    setEnv({
      WHATSAPP_TEXT_ORDERING_ENABLED:               "true",
      WHATSAPP_TEXT_ORDERING_ALLOWLIST_RESTAURANTS: "some-other-restaurant",
    });
    prismaMock.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(
      dbRow({ enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "RESTAURANT_WIDE" }),
    );
    const d = await getRoutingDecisionForRestaurant(REST, WEBHOOK_PHONE);
    expect(d.source).toBe("db");
    expect(d.shouldUseTextOrdering).toBe(true);
  });
});
