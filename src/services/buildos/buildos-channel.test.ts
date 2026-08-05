/**
 * Build OS WhatsApp Master channel routing — pure decision logic.
 *
 * Garante que o número de um RESTAURANTE nunca age como canal de comando do Build
 * OS — salvo fallback legado explicitamente ligado — e que o canal Master
 * configurado é o único que roteia Build OS por padrão.
 *
 * A identidade do canal é o `phone_number_id` da Meta desde 04/08/2026 (antes era
 * o nome de uma instância Evolution). A decisão é a mesma; o que mudou é a chave.
 */

import { describe, it, expect } from "vitest";
import { decideBuildOsChannel, type BuildOsChannelConfig } from "./BuildOSConfigService";

/** phone_number_id do número Master (dedicado à equipe). */
const MASTER = "555000111222333";
/** phone_number_id de um restaurante. */
const RESTAURANT = "999888777666555";

function cfg(over: Partial<BuildOsChannelConfig> = {}): BuildOsChannelConfig {
  return {
    configured: true,
    channelId: MASTER,
    enabled: true,
    legacyFallbackEnabled: false,
    ...over,
  };
}

describe("decideBuildOsChannel", () => {
  it("routes Build OS for the configured Master channel", () => {
    const d = decideBuildOsChannel(cfg(), MASTER);
    expect(d.isBuildOsChannel).toBe(true);
    expect(d.viaLegacyFallback).toBe(false);
    expect(d.masterConfigured).toBe(true);
  });

  it("does NOT route Build OS for a restaurant number when a Master is configured", () => {
    const d = decideBuildOsChannel(cfg(), RESTAURANT);
    expect(d.isBuildOsChannel).toBe(false);
    expect(d.masterConfigured).toBe(true);
  });

  it("does NOT route Build OS for any number when no Master configured and no legacy fallback", () => {
    const d = decideBuildOsChannel(cfg({ configured: false, channelId: null, enabled: false }), RESTAURANT);
    expect(d.isBuildOsChannel).toBe(false);
    expect(d.masterConfigured).toBe(false);
  });

  it("routes via legacy fallback ONLY when no Master configured AND fallback explicitly on", () => {
    const d = decideBuildOsChannel(
      cfg({ configured: false, channelId: null, enabled: false, legacyFallbackEnabled: true }),
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

  it("does NOT route when the Master channel is configured but disabled", () => {
    const d = decideBuildOsChannel(cfg({ configured: false, enabled: false }), MASTER);
    expect(d.isBuildOsChannel).toBe(false);
  });

  it("ignores empty/unknown channel ids", () => {
    expect(decideBuildOsChannel(cfg(), null).isBuildOsChannel).toBe(false);
    expect(decideBuildOsChannel(cfg(), "").isBuildOsChannel).toBe(false);
    expect(decideBuildOsChannel(cfg(), "111222333444555").isBuildOsChannel).toBe(false);
  });

  // isAdminInstance drives the processor's "Build OS only, no restaurant flow" path.
  it("flags the Admin channel (system), NOT restaurant or legacy fallback", () => {
    // Canal Master do sistema → isAdminInstance true (roteia Build OS, sem restaurante)
    expect(decideBuildOsChannel(cfg(), MASTER).isAdminInstance).toBe(true);
    // Número de restaurante com Master configurado → nem admin, nem Build OS
    expect(decideBuildOsChannel(cfg(), RESTAURANT).isAdminInstance).toBe(false);
    expect(decideBuildOsChannel(cfg(), RESTAURANT).isBuildOsChannel).toBe(false);
    // Legacy fallback routes Build OS but is NOT the admin instance
    const legacy = decideBuildOsChannel(
      cfg({ configured: false, channelId: null, enabled: false, legacyFallbackEnabled: true }),
      RESTAURANT,
    );
    expect(legacy.isBuildOsChannel).toBe(true);
    expect(legacy.isAdminInstance).toBe(false);
  });
});

// A suíte `normalizeBaseUrl` que existia aqui testava a normalização da baseUrl
// do servidor Evolution (o erro clássico de colar a URL sem o protocolo). Saiu
// junto com o provisionamento de instância: a Meta não tem servidor próprio nem
// baseUrl para o lojista digitar.
