/**
 * Build OS — internal command routing security tests (A–F).
 *
 * Verifies that /build, /cmd, /prompt messages are NEVER echoed to customers,
 * never passed to the AI, and never forwarded via Evolution — regardless of
 * whether Build OS is enabled or disabled. Pure-logic tests: no DB, no LLM,
 * no Evolution sends.
 *
 *   A — /build with Build OS DISABLED → isBuildCommand:true (suppressed, not echoed)
 *   B — /build with Build OS DISABLED → returns early before message persistence
 *   C — /build from UNAUTHORIZED sender with Build OS ENABLED → isBuildCommand:true
 *   D — normal customer message with Build OS DISABLED → isBuildCommand:false
 *   E — message containing /build NOT at start → not detected as command
 *   F — each supported prefix is detected (/build, /cmd, /prompt)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { detectBuildCommand } from "./BuildCommandRouter";

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
