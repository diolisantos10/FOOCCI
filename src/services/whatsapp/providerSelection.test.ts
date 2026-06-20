/**
 * Provider selection safety (PART 13 A/B/J/K) — pure, no DB.
 *
 *   A — default is EVOLUTION (existing restaurants keep sending via Evolution).
 *   B — selection routes to Evolution or Meta per restaurant + flag.
 *   J — exactly one provider per send (no double-send / no implicit fallback).
 *   K — Evolution is always the rollback target.
 */

import { describe, it, expect } from "vitest";
import { selectProvider } from "./WhatsAppMessagingService";

describe("selectProvider", () => {
  it("A — defaults to EVOLUTION when the flag is off (even if restaurant=META)", () => {
    expect(selectProvider(false, "META_CLOUD_API")).toBe("EVOLUTION");
    expect(selectProvider(false, "EVOLUTION")).toBe("EVOLUTION");
    expect(selectProvider(false, undefined)).toBe("EVOLUTION");
  });

  it("B — routes to META only when flag on AND restaurant explicitly selected it", () => {
    expect(selectProvider(true, "META_CLOUD_API")).toBe("META_CLOUD_API");
    expect(selectProvider(true, "EVOLUTION")).toBe("EVOLUTION");
    expect(selectProvider(true, null)).toBe("EVOLUTION");
    expect(selectProvider(true, "anything-else")).toBe("EVOLUTION");
  });

  it("J — returns exactly one provider (single send path, no double-send)", () => {
    const r = selectProvider(true, "META_CLOUD_API");
    expect(["EVOLUTION", "META_CLOUD_API"]).toContain(r);
    expect(typeof r).toBe("string");
  });

  it("K — EVOLUTION is the rollback default for any non-Meta selection", () => {
    expect(selectProvider(true, "")).toBe("EVOLUTION");
    expect(selectProvider(false, "META_CLOUD_API")).toBe("EVOLUTION");
  });
});
