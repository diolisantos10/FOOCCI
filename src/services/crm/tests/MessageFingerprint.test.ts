import { describe, it, expect } from "vitest";
import { generateMessageFingerprint, suggestCampaignFamilyKey, normalizeMessageText } from "../messageFingerprint";

describe("generateMessageFingerprint", () => {
  it("(1) is stable for the same template under a new campaignId (accents, case, spacing, var syntax)", () => {
    // The fingerprint is computed on the campaign TEMPLATE — so the same message
    // recreated as a new campaign collapses to the same fingerprint.
    const a = generateMessageFingerprint("Olá {nome}, hoje temos promoção de almoço!");
    const b = generateMessageFingerprint("olá {{nome}}, hoje  temos promocao de almoco");
    expect(a).toBe(b);
    expect(a).toMatch(/^mf_/);
  });

  it("differs for clearly different messages", () => {
    expect(generateMessageFingerprint("Promoção de almoço hoje"))
      .not.toBe(generateMessageFingerprint("Sua sobremesa preferida com 20% off"));
  });

  it("empty/whitespace → empty fingerprint", () => {
    expect(generateMessageFingerprint("   ")).toBe("");
    expect(generateMessageFingerprint("")).toBe("");
  });

  it("ignores urls (which vary per restaurant)", () => {
    const a = generateMessageFingerprint("Peça já: https://foocci.com/r/abc");
    const b = generateMessageFingerprint("Peça já: https://foocci.com/r/xyz");
    expect(a).toBe(b);
  });

  it("normalizeMessageText strips accents/case/punctuation/vars", () => {
    expect(normalizeMessageText("Olá, {nome}!")).toBe("ola");
  });
});

describe("suggestCampaignFamilyKey", () => {
  it("slugifies the name into a stable concept key", () => {
    expect(suggestCampaignFamilyKey({ name: "Páscoa 2026" })).toBe("pascoa-2026");
    expect(suggestCampaignFamilyKey({ name: "Reativação Frios — Junho" })).toBe("reativacao-frios-junho");
  });
  it("appends a period when provided", () => {
    expect(suggestCampaignFamilyKey({ name: "Almoço", period: "Junho 2026" })).toBe("almoco-junho-2026");
  });
});
