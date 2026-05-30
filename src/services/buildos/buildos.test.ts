/**
 * Priority 1.1 verification — Build OS command detection + authorization.
 *
 * Pure-logic tests (no DB): proves the security-critical guarantees —
 *   • the feature is OFF by default,
 *   • only messages that START with a known prefix are detected,
 *   • normal customer text is never captured,
 *   • only allow-listed phones are authorized.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  detectBuildCommand,
  normalizeBuildCommandText,
  normalizeSenderPhone,
  isAuthorizedBuildSender,
  isBuildOsEnabled,
} from "./BuildCommandRouter";

describe("isBuildOsEnabled — default OFF", () => {
  beforeEach(() => delete process.env.BUILDOS_ENABLED);
  afterEach(() => delete process.env.BUILDOS_ENABLED);

  it("is OFF when unset", () => {
    expect(isBuildOsEnabled()).toBe(false);
  });
  it("only 'true' enables it", () => {
    process.env.BUILDOS_ENABLED = "1";
    expect(isBuildOsEnabled()).toBe(false);
    process.env.BUILDOS_ENABLED = "true";
    expect(isBuildOsEnabled()).toBe(true);
  });
});

describe("detectBuildCommand", () => {
  it("detects each prefix at the start of the message", () => {
    expect(detectBuildCommand("/build melhorar copy")?.prefix).toBe("/build");
    expect(detectBuildCommand("/cmd rodar testes")?.prefix).toBe("/cmd");
    expect(detectBuildCommand("/prompt gerar algo")?.prefix).toBe("/prompt");
  });

  it("strips the prefix and normalizes the command text", () => {
    expect(detectBuildCommand("/build: foocci waiter")?.commandText).toBe("foocci waiter");
    expect(detectBuildCommand("/build   olá mundo")?.commandText).toBe("olá mundo");
  });

  it("is case-insensitive on the prefix", () => {
    expect(detectBuildCommand("/BUILD x")?.prefix).toBe("/build");
  });

  it("tolerates leading whitespace", () => {
    expect(detectBuildCommand("  /cmd algo")?.prefix).toBe("/cmd");
  });

  it("accepts a bare prefix with no text", () => {
    const r = detectBuildCommand("/build");
    expect(r?.prefix).toBe("/build");
    expect(r?.commandText).toBe("");
  });

  // ── The critical safety cases: normal customer text must NOT be captured ──
  it("does NOT capture normal customer messages", () => {
    expect(detectBuildCommand("Quero fazer um pedido")).toBeNull();
    expect(detectBuildCommand("qual o cardápio?")).toBeNull();
    expect(detectBuildCommand("")).toBeNull();
  });

  it("does NOT capture when the prefix is mid-message", () => {
    expect(detectBuildCommand("me ajuda com /build por favor")).toBeNull();
    expect(detectBuildCommand("texto /cmd no meio")).toBeNull();
  });

  it("does NOT capture a prefix that is only part of a word", () => {
    expect(detectBuildCommand("/builder algo")).toBeNull();
    expect(detectBuildCommand("/cmder")).toBeNull();
  });
});

describe("normalizeBuildCommandText", () => {
  it("strips leading separators and trims", () => {
    expect(normalizeBuildCommandText(":  hello ")).toBe("hello");
    expect(normalizeBuildCommandText(" - do thing")).toBe("do thing");
    expect(normalizeBuildCommandText(">> go")).toBe("go");
  });
});

describe("normalizeSenderPhone", () => {
  it("produces +E.164 from various inputs", () => {
    expect(normalizeSenderPhone("+5511999990000")).toBe("+5511999990000");
    expect(normalizeSenderPhone("5511999990000")).toBe("+5511999990000");
    expect(normalizeSenderPhone(" +55 (11) 99999-0000 ")).toBe("+5511999990000");
  });
  it("returns empty string when there are no digits", () => {
    expect(normalizeSenderPhone("abc")).toBe("");
    expect(normalizeSenderPhone("")).toBe("");
  });
});

describe("isAuthorizedBuildSender — allow-list", () => {
  beforeEach(() => {
    process.env.BUILD_OS_AUTHORIZED_PHONES = "+5511999990000, 5511888880000";
  });
  afterEach(() => delete process.env.BUILD_OS_AUTHORIZED_PHONES);

  it("authorizes listed numbers (normalization-tolerant)", () => {
    expect(isAuthorizedBuildSender("+5511999990000")).toBe(true);
    expect(isAuthorizedBuildSender("5511999990000")).toBe(true);
    expect(isAuthorizedBuildSender("+5511888880000")).toBe(true); // listed without "+"
  });

  it("rejects unlisted numbers", () => {
    expect(isAuthorizedBuildSender("+5511000000000")).toBe(false);
    expect(isAuthorizedBuildSender("")).toBe(false);
  });

  it("rejects everyone when the allow-list is empty", () => {
    delete process.env.BUILD_OS_AUTHORIZED_PHONES;
    expect(isAuthorizedBuildSender("+5511999990000")).toBe(false);
  });
});
