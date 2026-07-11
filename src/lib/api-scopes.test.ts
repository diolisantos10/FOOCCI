/**
 * api-scopes — parse (stored → validated list), serialize (input → canonical
 * stored string, safe defaults), and hasScope.
 */

import { describe, it, expect } from "vitest";
import { parseScopes, serializeScopes, hasScope, API_SCOPES } from "@/lib/api-scopes";

describe("parseScopes", () => {
  it("keeps only valid scopes, de-duped", () => {
    expect(parseScopes("sales:read, customers:read , sales:read")).toEqual(["sales:read", "customers:read"]);
  });
  it("drops unknown entries", () => {
    expect(parseScopes("sales:read,admin:everything")).toEqual(["sales:read"]);
  });
  it("returns [] for empty/null", () => {
    expect(parseScopes(null)).toEqual([]);
    expect(parseScopes("")).toEqual([]);
  });
});

describe("serializeScopes", () => {
  it("normalizes to canonical order and joins with commas", () => {
    expect(serializeScopes(["customers:read", "sales:read"])).toBe("sales:read,customers:read");
  });
  it("drops junk and de-dupes", () => {
    expect(serializeScopes(["sales:read", "sales:read", "nope", 42])).toBe("sales:read");
  });
  it("falls back to sales:read for empty or fully-invalid input (never zero, never everything)", () => {
    expect(serializeScopes([])).toBe("sales:read");
    expect(serializeScopes(["bogus"])).toBe("sales:read");
    expect(serializeScopes("not-an-array")).toBe("sales:read");
  });
  it("round-trips through parseScopes", () => {
    const stored = serializeScopes([...API_SCOPES]);
    expect(parseScopes(stored)).toEqual([...API_SCOPES]);
  });
});

describe("hasScope", () => {
  it("is true only when granted", () => {
    expect(hasScope(["sales:read", "products:read"], "products:read")).toBe(true);
    expect(hasScope(["sales:read"], "customers:read")).toBe(false);
    expect(hasScope([], "sales:read")).toBe(false);
  });
});
