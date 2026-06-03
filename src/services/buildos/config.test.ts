/**
 * Priority 1.4.1 verification — phone normalization + variants + hard kill-switch.
 *
 * Pure-logic tests (no DB). The DB-first precedence in BuildOSConfigService is
 * exercised via integration/manual testing; here we lock down the deterministic,
 * security-relevant helpers: canonical normalization, Brazilian 9th-digit
 * variants, and the emergency hard-disable flag.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { normalizeSenderPhone, phoneVariants } from "./BuildCommandRouter";
import { isBuildOsHardDisabled } from "./BuildOSConfigService";

describe("normalizeSenderPhone — canonical E.164", () => {
  it("normalizes assorted inputs to +digits", () => {
    expect(normalizeSenderPhone("+5511999990000")).toBe("+5511999990000");
    expect(normalizeSenderPhone("5511999990000")).toBe("+5511999990000");
    expect(normalizeSenderPhone(" +55 (11) 99999-0000 ")).toBe("+5511999990000");
  });
  it("returns empty string for no digits", () => {
    expect(normalizeSenderPhone("abc")).toBe("");
    expect(normalizeSenderPhone("")).toBe("");
  });
});

describe("phoneVariants — Brazilian 9th-digit tolerance", () => {
  it("from the with-9 form, also yields the without-9 form", () => {
    const v = phoneVariants("+5511999990000");
    expect(v.has("+5511999990000")).toBe(true);
    expect(v.has("+551199990000")).toBe(true);
  });
  it("from the without-9 form, also yields the with-9 form", () => {
    const v = phoneVariants("+551199990000");
    expect(v.has("+551199990000")).toBe(true);
    expect(v.has("+5511999990000")).toBe(true);
  });
  it("leaves non-BR numbers untouched (single variant)", () => {
    const v = phoneVariants("+14155550123");
    expect(Array.from(v)).toEqual(["+14155550123"]);
  });
  it("returns empty set for empty input", () => {
    expect(phoneVariants("").size).toBe(0);
  });
});

describe("isBuildOsHardDisabled — emergency kill-switch", () => {
  beforeEach(() => delete process.env.BUILDOS_HARD_DISABLED);
  afterEach(() => delete process.env.BUILDOS_HARD_DISABLED);

  it("is false by default", () => {
    expect(isBuildOsHardDisabled()).toBe(false);
  });
  it("is true only for 'true'", () => {
    process.env.BUILDOS_HARD_DISABLED = "1";
    expect(isBuildOsHardDisabled()).toBe(false);
    process.env.BUILDOS_HARD_DISABLED = "true";
    expect(isBuildOsHardDisabled()).toBe(true);
  });
});
