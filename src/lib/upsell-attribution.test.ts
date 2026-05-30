import { describe, it, expect } from "vitest";
import { resolveItemUpsell } from "./upsell-attribution";

describe("resolveItemUpsell — conservative upsell attribution", () => {
  it("true only when explicitly flagged true (Foocci suggestion add)", () => {
    expect(resolveItemUpsell({ isUpsell: true })).toBe(true);
  });

  it("false when flagged false (normal menu browse add)", () => {
    expect(resolveItemUpsell({ isUpsell: false })).toBe(false);
  });

  it("false when omitted (legacy / non-suggestion add)", () => {
    expect(resolveItemUpsell({})).toBe(false);
  });

  it("false for null/undefined — never invent attribution", () => {
    expect(resolveItemUpsell({ isUpsell: undefined })).toBe(false);
    expect(resolveItemUpsell({ isUpsell: null })).toBe(false);
  });

  it("does not coerce truthy non-true values", () => {
    // Guards against accidental attribution from malformed payloads.
    expect(resolveItemUpsell({ isUpsell: 1 as unknown as boolean })).toBe(false);
    expect(resolveItemUpsell({ isUpsell: "true" as unknown as boolean })).toBe(false);
  });
});
