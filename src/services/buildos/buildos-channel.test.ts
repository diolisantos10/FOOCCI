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
});
