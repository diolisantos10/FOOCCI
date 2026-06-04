/**
 * Build OS WhatsApp Master channel routing — pure decision logic.
 *
 * Guarantees a restaurant Evolution instance never acts as the Build OS command
 * channel unless an explicit legacy fallback is enabled, and that the configured
 * Master instance is the only one that routes Build OS by default.
 */

import { describe, it, expect } from "vitest";
import { decideBuildOsChannel, type BuildOsChannelConfig } from "./BuildOSConfigService";

const MASTER = "futi-admin";
const RESTAURANT = "sushicazza";

function cfg(over: Partial<BuildOsChannelConfig> = {}): BuildOsChannelConfig {
  return {
    configured: true,
    instanceName: MASTER,
    enabled: true,
    legacyFallbackEnabled: false,
    ...over,
  };
}

describe("decideBuildOsChannel", () => {
  it("routes Build OS for the configured Master instance", () => {
    const d = decideBuildOsChannel(cfg(), MASTER);
    expect(d.isBuildOsChannel).toBe(true);
    expect(d.viaLegacyFallback).toBe(false);
    expect(d.masterConfigured).toBe(true);
  });

  it("does NOT route Build OS for a restaurant instance when a Master is configured", () => {
    const d = decideBuildOsChannel(cfg(), RESTAURANT);
    expect(d.isBuildOsChannel).toBe(false);
    expect(d.masterConfigured).toBe(true);
  });

  it("does NOT route Build OS for any instance when no Master configured and no legacy fallback", () => {
    const d = decideBuildOsChannel(cfg({ configured: false, instanceName: null, enabled: false }), RESTAURANT);
    expect(d.isBuildOsChannel).toBe(false);
    expect(d.masterConfigured).toBe(false);
  });

  it("routes via legacy fallback ONLY when no Master configured AND fallback explicitly on", () => {
    const d = decideBuildOsChannel(
      cfg({ configured: false, instanceName: null, enabled: false, legacyFallbackEnabled: true }),
      RESTAURANT,
    );
    expect(d.isBuildOsChannel).toBe(true);
    expect(d.viaLegacyFallback).toBe(true);
  });

  it("does NOT use legacy fallback when a Master IS configured (fallback ignored)", () => {
    const d = decideBuildOsChannel(cfg({ legacyFallbackEnabled: true }), RESTAURANT);
    expect(d.isBuildOsChannel).toBe(false);
    expect(d.viaLegacyFallback).toBe(false);
  });

  it("does NOT route when the Master instance is configured but disabled", () => {
    const d = decideBuildOsChannel(cfg({ configured: false, enabled: false }), MASTER);
    expect(d.isBuildOsChannel).toBe(false);
  });

  it("ignores empty/unknown instance names", () => {
    expect(decideBuildOsChannel(cfg(), null).isBuildOsChannel).toBe(false);
    expect(decideBuildOsChannel(cfg(), "").isBuildOsChannel).toBe(false);
    expect(decideBuildOsChannel(cfg(), "some-other").isBuildOsChannel).toBe(false);
  });

  // isAdminInstance drives the processor's "Build OS only, no restaurant flow" path.
  it("flags the Admin instance (system channel), NOT restaurant or legacy fallback", () => {
    // Admin/system instance → isAdminInstance true (routes Build OS, no restaurant)
    expect(decideBuildOsChannel(cfg(), MASTER).isAdminInstance).toBe(true);
    // Restaurant instance with Master configured → not admin, not Build OS
    expect(decideBuildOsChannel(cfg(), RESTAURANT).isAdminInstance).toBe(false);
    expect(decideBuildOsChannel(cfg(), RESTAURANT).isBuildOsChannel).toBe(false);
    // Legacy fallback routes Build OS but is NOT the admin instance
    const legacy = decideBuildOsChannel(
      cfg({ configured: false, instanceName: null, enabled: false, legacyFallbackEnabled: true }),
      RESTAURANT,
    );
    expect(legacy.isBuildOsChannel).toBe(true);
    expect(legacy.isAdminInstance).toBe(false);
  });
});

import { normalizeBaseUrl } from "./AdminWhatsAppConfigService";

describe("normalizeBaseUrl", () => {
  it("prefixes https:// when the protocol is missing (the paste error)", () => {
    expect(normalizeBaseUrl("evolution-api-production-636c.up.railway.app"))
      .toBe("https://evolution-api-production-636c.up.railway.app");
  });
  it("keeps an existing http/https protocol", () => {
    expect(normalizeBaseUrl("http://evo.example.com")).toBe("http://evo.example.com");
    expect(normalizeBaseUrl("https://evo.example.com")).toBe("https://evo.example.com");
  });
  it("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://evo.example.com/")).toBe("https://evo.example.com");
  });
  it("returns null for empty/invalid", () => {
    expect(normalizeBaseUrl("")).toBeNull();
    expect(normalizeBaseUrl("   ")).toBeNull();
    expect(normalizeBaseUrl("not a url")).toBeNull();
  });
});
