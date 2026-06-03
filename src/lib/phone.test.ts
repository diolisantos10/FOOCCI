/**
 * phoneCandidates / toE164 — Brazilian phone normalization.
 *
 * The critical invariant for the WhatsApp → /pedido identity chain: a customer
 * saved WITH the mobile 9th digit (e.g. +5511999990000, from manual identify)
 * and the same person's WhatsApp JID WITHOUT the 9 (e.g. +551199990000) must
 * resolve to a shared candidate so the lookup matches one existing record and
 * does NOT create a duplicate. These tests are pure — no DB, no LLM.
 */

import { describe, it, expect } from "vitest";
import { phoneCandidates, toE164 } from "@/lib/phone";

/** Two raw phones refer to the same person if their candidate sets intersect. */
function sameNumber(a: string, b: string): boolean {
  const setA = new Set(phoneCandidates(a));
  return phoneCandidates(b).some((c) => setA.has(c));
}

describe("phoneCandidates — basic shape", () => {
  it("returns [] for inputs that are too short", () => {
    expect(phoneCandidates("123")).toEqual([]);
    expect(phoneCandidates("")).toEqual([]);
  });

  it("strips formatting before generating candidates", () => {
    const a = phoneCandidates("+55 (11) 99999-0000");
    const b = phoneCandidates("5511999990000");
    expect(new Set(a)).toEqual(new Set(b));
  });

  it("always includes the +55 national E.164 form for a BR mobile", () => {
    expect(phoneCandidates("11999990000")).toContain("+5511999990000");
    expect(phoneCandidates("+5511999990000")).toContain("+5511999990000");
  });
});

describe("phoneCandidates — 9th-digit symmetry (the identity-chain fix)", () => {
  it("matches a with-9 record against a without-9 WhatsApp phone (13 vs 12 digits)", () => {
    // DB record stored from manual identify (with the 9):
    const stored = "+5511999990000";
    // waToken phone from a WhatsApp JID that dropped the 9:
    const waPhone = "+551199990000";
    expect(sameNumber(stored, waPhone)).toBe(true);
  });

  it("matches a without-9 record against a with-9 phone (12 vs 13 digits)", () => {
    expect(sameNumber("+551199990000", "+5511999990000")).toBe(true);
  });

  it("matches across 11-digit (with 9) and 10-digit (without 9) national forms", () => {
    expect(sameNumber("11999990000", "1199990000")).toBe(true);
  });

  it("emits both 9th-digit national forms for a with-9 input", () => {
    const set = new Set(phoneCandidates("+5511999990000"));
    expect(set.has("+5511999990000")).toBe(true); // with 9
    expect(set.has("+551199990000")).toBe(true);  // without 9
  });

  it("emits both 9th-digit national forms for a without-9 input", () => {
    const set = new Set(phoneCandidates("+551199990000"));
    expect(set.has("+551199990000")).toBe(true);  // without 9
    expect(set.has("+5511999990000")).toBe(true); // with 9
  });
});

describe("phoneCandidates — does not over-match different numbers", () => {
  it("two genuinely different mobiles do not share candidates", () => {
    expect(sameNumber("+5511999990000", "+5511888880000")).toBe(false);
  });

  it("different DDDs are not treated as the same number", () => {
    expect(sameNumber("+5511999990000", "+5521999990000")).toBe(false);
  });
});

describe("toE164", () => {
  it("normalizes an 11-digit national mobile to +55 E.164", () => {
    expect(toE164("11999990000")).toBe("+5511999990000");
  });

  it("expands a 10-digit number with the 9th digit", () => {
    expect(toE164("1199990000")).toBe("+5511999990000");
  });

  it("preserves an already-prefixed 55 number", () => {
    expect(toE164("5511999990000")).toBe("+5511999990000");
  });
});
