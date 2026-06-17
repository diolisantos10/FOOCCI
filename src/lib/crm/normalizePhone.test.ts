import { describe, it, expect } from "vitest";
import { normalizePhoneForEvolution, isValidEvolutionPhone } from "./normalizePhone";

describe("normalizePhoneForEvolution", () => {
  it("strips formatting and prepends DDI 55 for an 11-digit mobile", () => {
    expect(normalizePhoneForEvolution("11999990000")).toBe("5511999990000");
  });

  it("handles +55 prefix with spaces and parentheses", () => {
    expect(normalizePhoneForEvolution("+55 (11) 99999-0000")).toBe("5511999990000");
  });

  it("handles (DDD) 9 NNNN-NNNN format (11 digits without country code)", () => {
    expect(normalizePhoneForEvolution("(11) 9 9999-0000")).toBe("5511999990000");
  });

  it("passes through an already-normalized 13-digit number", () => {
    expect(normalizePhoneForEvolution("5511999990000")).toBe("5511999990000");
  });

  it("passes through an already-normalized 12-digit number", () => {
    expect(normalizePhoneForEvolution("551199990000")).toBe("551199990000");
  });

  it("prepends 55 for a 10-digit local number (old mobile format)", () => {
    expect(normalizePhoneForEvolution("1199990000")).toBe("551199990000");
  });

  it("returns null for null input", () => {
    expect(normalizePhoneForEvolution(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizePhoneForEvolution(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizePhoneForEvolution("")).toBeNull();
  });

  it("returns null for a number that is too short (< 10 digits)", () => {
    expect(normalizePhoneForEvolution("12345")).toBeNull();
  });

  it("returns null for a number that is too long (> 13 digits)", () => {
    // 14 raw digits that don't match any known Brazilian format
    expect(normalizePhoneForEvolution("99999999999999")).toBeNull();
  });

  it("returns null for a non-numeric string with no digits", () => {
    expect(normalizePhoneForEvolution("abc xyz")).toBeNull();
  });
});

describe("isValidEvolutionPhone", () => {
  it("accepts a 13-digit number starting with 55", () => {
    expect(isValidEvolutionPhone("5511999990000")).toBe(true);
  });

  it("accepts a 12-digit number starting with 55", () => {
    expect(isValidEvolutionPhone("551199990000")).toBe(true);
  });

  it("accepts a number with a + prefix (strips non-digits before validating)", () => {
    // The function checks digit content; a + sign is stripped out.
    // In practice callers always pass output from normalizePhoneForEvolution (no + prefix).
    expect(isValidEvolutionPhone("+5511999990000")).toBe(true);
  });

  it("rejects an 11-digit national number (missing DDI)", () => {
    expect(isValidEvolutionPhone("11999990000")).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidEvolutionPhone(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidEvolutionPhone(undefined)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidEvolutionPhone("")).toBe(false);
  });

  it("rejects a 13-digit number not starting with 55", () => {
    expect(isValidEvolutionPhone("1111999990000")).toBe(false);
  });
});
