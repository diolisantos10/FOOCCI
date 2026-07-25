import { describe, it, expect } from "vitest";
import { isAiKeyConfigured, simulatorBlockReason } from "./AISimulatorPreflight";

describe("isAiKeyConfigured", () => {
  it("aceita uma chave real", () => {
    expect(isAiKeyConfigured("sk-abc123")).toBe(true);
  });
  it("rejeita ausente, vazia ou o placeholder 'not-configured'", () => {
    expect(isAiKeyConfigured(undefined)).toBe(false);
    expect(isAiKeyConfigured(null)).toBe(false);
    expect(isAiKeyConfigured("")).toBe(false);
    expect(isAiKeyConfigured("   ")).toBe(false);
    expect(isAiKeyConfigured("not-configured")).toBe(false);
    expect(isAiKeyConfigured("  not-configured  ")).toBe(false);
  });
});

describe("simulatorBlockReason", () => {
  it("libera quando há chave e cardápio", () => {
    expect(simulatorBlockReason({ menuCount: 5, aiKeyConfigured: true })).toBeNull();
  });

  it("bloqueia por chave ANTES do cardápio (não manda cadastrar cardápio se o problema é a chave)", () => {
    const reason = simulatorBlockReason({ menuCount: 0, aiKeyConfigured: false });
    expect(reason).toMatch(/chave|conectada/i);
    expect(reason).not.toMatch(/cardápio/i);
  });

  it("bloqueia por cardápio vazio quando a chave está ok", () => {
    const reason = simulatorBlockReason({ menuCount: 0, aiKeyConfigured: true });
    expect(reason).toMatch(/cardápio/i);
  });

  it("trata menu negativo como vazio (defensivo)", () => {
    expect(simulatorBlockReason({ menuCount: -1, aiKeyConfigured: true })).toMatch(/cardápio/i);
  });
});
