import { describe, it, expect } from "vitest";
import { normalizePhoneBR, isValidPhoneBR } from "./normalizePhone";

describe("normalizePhoneBR", () => {
  it("strips formatting and prepends DDI 55 for an 11-digit mobile", () => {
    expect(normalizePhoneBR("11999990000")).toBe("5511999990000");
  });

  it("handles +55 prefix with spaces and parentheses", () => {
    expect(normalizePhoneBR("+55 (11) 99999-0000")).toBe("5511999990000");
  });

  it("handles (DDD) 9 NNNN-NNNN format (11 digits without country code)", () => {
    expect(normalizePhoneBR("(11) 9 9999-0000")).toBe("5511999990000");
  });

  it("passes through an already-normalized 13-digit number", () => {
    expect(normalizePhoneBR("5511999990000")).toBe("5511999990000");
  });

  it("passes through an already-normalized 12-digit number", () => {
    expect(normalizePhoneBR("551199990000")).toBe("551199990000");
  });

  it("prepends 55 for a 10-digit local number (old mobile format)", () => {
    expect(normalizePhoneBR("1199990000")).toBe("551199990000");
  });

  it("returns null for null input", () => {
    expect(normalizePhoneBR(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizePhoneBR(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizePhoneBR("")).toBeNull();
  });

  it("returns null for a number that is too short (< 10 digits)", () => {
    expect(normalizePhoneBR("12345")).toBeNull();
  });

  it("returns null for a number that is too long (> 13 digits)", () => {
    // 14 raw digits that don't match any known Brazilian format
    expect(normalizePhoneBR("99999999999999")).toBeNull();
  });

  it("returns null for a non-numeric string with no digits", () => {
    expect(normalizePhoneBR("abc xyz")).toBeNull();
  });
});

describe("isValidPhoneBR", () => {
  it("accepts a 13-digit number starting with 55", () => {
    expect(isValidPhoneBR("5511999990000")).toBe(true);
  });

  it("accepts a 12-digit number starting with 55", () => {
    expect(isValidPhoneBR("551199990000")).toBe(true);
  });

  it("accepts a number with a + prefix (strips non-digits before validating)", () => {
    // The function checks digit content; a + sign is stripped out.
    // In practice callers always pass output from normalizePhoneBR (no + prefix).
    expect(isValidPhoneBR("+5511999990000")).toBe(true);
  });

  it("rejects an 11-digit national number (missing DDI)", () => {
    expect(isValidPhoneBR("11999990000")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidPhoneBR(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidPhoneBR(undefined)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidPhoneBR("")).toBe(false);
  });

  it("rejects a 13-digit number not starting with 55", () => {
    expect(isValidPhoneBR("1111999990000")).toBe(false);
  });
});
