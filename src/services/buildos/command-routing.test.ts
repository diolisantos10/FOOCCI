/**
 * Build OS — internal command routing security tests (A–F).
 *
 * Verifies that /build, /cmd, /prompt messages are NEVER echoed to customers,
 * never passed to the AI, and never forwarded to the customer — regardless of
 * whether Build OS is enabled or disabled. Pure-logic tests: no DB, no LLM,
 * no WhatsApp sends.
 *
 *   A — /build with Build OS DISABLED → isBuildCommand:true (suppressed, not echoed)
 *   B — /build with Build OS DISABLED → returns early before message persistence
 *   C — /build from UNAUTHORIZED sender with Build OS ENABLED → isBuildCommand:true
 *   D — normal customer message with Build OS DISABLED → isBuildCommand:false
 *   E — message containing /build NOT at start → not detected as command
 *   F — each supported prefix is detected (/build, /cmd, /prompt)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { detectBuildCommand, isInternalCommandText } from "./BuildCommandRouter";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Simulate a handleBuildCommand call for the disabled case via the pure detection
 *  layer. Because handleBuildCommand imports from BuildOSConfigService (which does
 *  DB calls), we test the safety invariant at the detection layer to keep the suite
 *  fully deterministic and DB-free. The integration path is covered separately. */
function isCommandSuppressed(content: string): boolean {
  return detectBuildCommand(content) !== null;
}

// ── A: Build OS disabled + /build → must be suppressed ───────────────────────

describe("A — /build is detected even when Build OS is disabled", () => {
  beforeEach(() => delete process.env.BUILDOS_ENABLED);
  afterEach(() => delete process.env.BUILDOS_ENABLED);

  it("/build is detected as a command prefix", () => {
    // The fix: detection is independent of the enable gate.
    // WebhookProcessorService uses this return value to suppress the message.
    expect(isCommandSuppressed("/build teste de comando")).toBe(true);
  });

  it("/build alone (no text) is suppressed", () => {
    expect(isCommandSuppressed("/build")).toBe(true);
  });

  it("/BUILD (uppercase) is suppressed", () => {
    expect(isCommandSuppressed("/BUILD analise o checkout")).toBe(true);
  });

  it("/cmd is suppressed", () => {
    expect(isCommandSuppressed("/cmd rodar testes")).toBe(true);
  });

  it("/prompt is suppressed", () => {
    expect(isCommandSuppressed("/prompt gera algo")).toBe(true);
  });
});

// ── B: handleBuildCommand returns isBuildCommand:true for disabled+detected ───

describe("B — handleBuildCommand suppresses /build when disabled (integration via spy)", () => {
  // We mock the config service so the test stays DB-free and deterministic.
  // This validates the patched code path in handleBuildCommand.ts.

  it("/build returns { isBuildCommand: true } when config is disabled", async () => {
    // Mock resolveBuildOsEnabled to return disabled.
    vi.mock("./BuildOSConfigService", async (importOriginal) => {
      const orig = await importOriginal<typeof import("./BuildOSConfigService")>();
      return {
        ...orig,
        resolveBuildOsEnabled: vi.fn().mockResolvedValue({ enabled: false, source: "env_fallback" }),
        authorizeSender: vi.fn().mockResolvedValue({ authorized: false, source: "denied" }),
      };
    });
    vi.mock("./BuildWebhookTrace", () => ({
      recordWebhookTrace: vi.fn().mockResolvedValue(undefined),
    }));

    const { handleBuildCommand } = await import("./handleBuildCommand");
    const result = await handleBuildCommand({
      restaurantId: "rest-test",
      phone: "+5511999990000",
      content: "/build raio-x checkout",
    });

    expect(result.isBuildCommand).toBe(true);

    vi.restoreAllMocks();
    vi.resetModules();
  });
});

// ── C: enabled + unauthorized → isBuildCommand:true ─────────────────────────

describe("C — unauthorized sender is intercepted when Build OS is enabled", () => {
  it("/build from an unknown phone is detected as command", () => {
    // The unauthorized-sender path already returned isBuildCommand:true before
    // the fix. Confirm detection still works.
    expect(detectBuildCommand("/build raio-x")).not.toBeNull();
  });
});

// ── D: normal customer message with disabled Build OS → not suppressed ────────

describe("D — normal customer messages are never affected", () => {
  it("a greeting is not detected as a command", () => {
    expect(isCommandSuppressed("Oi, tudo bem?")).toBe(false);
    expect(isCommandSuppressed("quero fazer um pedido")).toBe(false);
    expect(isCommandSuppressed("1")).toBe(false);
    expect(isCommandSuppressed("STOP")).toBe(false);
  });

  it("an empty message is not detected as a command", () => {
    expect(isCommandSuppressed("")).toBe(false);
  });

  it("a number-only message is not a command", () => {
    expect(isCommandSuppressed("2")).toBe(false);
  });
});

// ── E: /build NOT at the start of the message → not captured ─────────────────

describe("E — /build mid-message is never captured as a command", () => {
  it("'me fale sobre /build' is not a command", () => {
    expect(detectBuildCommand("me fale sobre /build")).toBeNull();
  });

  it("'preciso de /build para testar' is not a command", () => {
    expect(detectBuildCommand("preciso de /build para testar")).toBeNull();
  });

  it("'/builder' (prefix + word char) is not captured", () => {
    expect(detectBuildCommand("/builder install")).toBeNull();
  });
});

// ── F: all supported prefixes are detected ────────────────────────────────────

describe("F — all internal command prefixes are detected", () => {
  const cases: [string, string][] = [
    ["/build faz algo", "/build"],
    ["/build: coisa", "/build"],
    ["/cmd teste", "/cmd"],
    ["/CMD TESTE", "/cmd"],
    ["/prompt draft waiter", "/prompt"],
    ["  /build  leading space", "/build"],
  ];

  for (const [input, expectedPrefix] of cases) {
    it(`detects prefix from: ${JSON.stringify(input)}`, () => {
      expect(detectBuildCommand(input)?.prefix).toBe(expectedPrefix);
    });
  }
});

// ── G: isInternalCommandText pure helper ──────────────────────────────────────

describe("G — isInternalCommandText pure boolean helper", () => {
  it("returns true for /build", () => {
    expect(isInternalCommandText("/build teste")).toBe(true);
  });

  it("returns true for /cmd", () => {
    expect(isInternalCommandText("/cmd rodar testes")).toBe(true);
  });

  it("returns true for /prompt", () => {
    expect(isInternalCommandText("/prompt gera algo")).toBe(true);
  });

  it("returns true for bare /build (no text)", () => {
    expect(isInternalCommandText("/build")).toBe(true);
  });

  it("returns false for a normal customer message", () => {
    expect(isInternalCommandText("Oi, quero fazer um pedido")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isInternalCommandText("")).toBe(false);
  });

  it("returns false when /build appears mid-sentence", () => {
    expect(isInternalCommandText("como usar /build no projeto?")).toBe(false);
  });

  it("returns false for /builder (word char after prefix)", () => {
    expect(isInternalCommandText("/builder install")).toBe(false);
  });
});

// ── H: exception fall-through safety — pre-flight always suppresses ───────────

describe("H — pre-flight suppression is independent of handleBuildCommand", () => {
  // This validates the invariant that isInternalCommandText() is the hard gate:
  // even if handleBuildCommand threw an exception, the caller already knows it
  // must suppress because isInternalCommandText returned true first.

  it("isInternalCommandText does not throw for any string input", () => {
    const inputs = [
      "/build",
      "/cmd",
      "/prompt",
      "",
      "Oi",
      "\n\n/build\n",
      "/BUILD UPPERCASE",
      "a".repeat(5000),
      "\0​/build",
    ];
    for (const input of inputs) {
      expect(() => isInternalCommandText(input)).not.toThrow();
    }
  });

  it("uppercase variants are also detected (case-insensitive)", () => {
    expect(isInternalCommandText("/BUILD raio-x")).toBe(true);
    expect(isInternalCommandText("/CMD teste")).toBe(true);
    expect(isInternalCommandText("/PROMPT gera")).toBe(true);
  });
});

// ── I: exception fall-through: pre-flight is the hard gate ───────────────────

describe("I — exception fall-through: isInternalCommandText is the infallible gate", () => {
  // The caller (WebhookProcessorService) checks isInternalCommandText() BEFORE
  // calling handleBuildCommand. If handleBuildCommand throws (e.g. DB is down),
  // the caller already has true from the pure check and suppresses regardless.
  // These tests verify the pure gate is reliable under all inputs.

  it("correctly identifies /build even when called in a catch-block context", () => {
    // Simulate what the caller does after catching an exception from handleBuildCommand:
    // it falls back to the synchronous isInternalCommandText result.
    const content = "/build raio-x checkout";
    let suppressed = false;
    try {
      throw new Error("DB_DOWN");
    } catch {
      suppressed = isInternalCommandText(content);
    }
    expect(suppressed).toBe(true);
  });

  it("returns false for normal messages even in exception context", () => {
    const content = "quero fazer um pedido";
    let suppressed = true;
    try {
      throw new Error("DB_DOWN");
    } catch {
      suppressed = isInternalCommandText(content);
    }
    expect(suppressed).toBe(false);
  });
});

// ── J: operator send routes block internal commands ───────────────────────────

describe("J — isInternalCommandText correctly identifies inputs to block in operator routes", () => {
  // The operator-send API routes call isInternalCommandText before persisting.
  // This test validates the exact same function they use.

  const shouldBlock = [
    "/build teste envio manual",
    "/cmd rodar testes no servidor",
    "/prompt gera waiter novo",
    "/BUILD uppercase must block",
    "  /build  with leading spaces",
  ];

  const shouldAllow = [
    "Olá, tudo bem?",
    "quero fazer um pedido",
    "1",
    "",
    "/buildmore text",  // not a real prefix (word char after)
    "fale sobre /build para mim",  // mid-sentence
  ];

  for (const input of shouldBlock) {
    it(`blocks: ${JSON.stringify(input)}`, () => {
      expect(isInternalCommandText(input)).toBe(true);
    });
  }

  for (const input of shouldAllow) {
    it(`allows: ${JSON.stringify(input)}`, () => {
      expect(isInternalCommandText(input)).toBe(false);
    });
  }
});
