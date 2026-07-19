import { describe, it, expect } from "vitest";
import {
  parseMessagePool,
  listPoolCandidates,
  resolveActivePhrases,
  pickPhrase,
  phraseKey,
  readPhraseMetaTemplates,
  MAX_CUSTOM_PHRASES,
} from "../crmMessagePool";
import { getReadyMadeMessageVariants } from "../readyMadeCampaigns";

const CATALOG_ID = "recuperar-frios";
const variants = getReadyMadeMessageVariants(CATALOG_ID);

describe("crmMessagePool — parse", () => {
  it("returns null for configs without a pool", () => {
    expect(parseMessagePool(null)).toBeNull();
    expect(parseMessagePool({})).toBeNull();
    expect(parseMessagePool({ mode: "RECURRING" })).toBeNull();
    expect(parseMessagePool({ messagePool: { selected: [], custom: [] } })).toBeNull();
  });

  it("keeps at most MAX_CUSTOM_PHRASES custom phrases and drops malformed rows", () => {
    const custom = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, text: `Frase ${i}` }));
    const pool = parseMessagePool({ messagePool: { custom: [...custom, { text: "sem id" }, null] } });
    expect(pool?.custom).toHaveLength(MAX_CUSTOM_PHRASES);
    expect(pool?.custom?.every((c) => c.id && c.text)).toBe(true);
  });
});

describe("crmMessagePool — candidates & active resolution", () => {
  it("lists catalog variants keyed by fingerprint", () => {
    const cands = listPoolCandidates(CATALOG_ID, null);
    expect(cands.length).toBe(variants.length);
    expect(cands[0].key).toBe(phraseKey(variants[0]));
    expect(cands.every((c) => c.source === "catalog")).toBe(true);
  });

  it("activates only the selected catalog variants plus ON custom phrases", () => {
    const selectedKey = phraseKey(variants[1]);
    const pool = parseMessagePool({ messagePool: {
      selected: [selectedKey],
      custom:   [
        { id: "c1", text: "Oi {nome}, volta pra gente! Peça em {link_cardapio} hoje." },
        { id: "c2", text: "Outra frase minha desligada", on: false },
      ],
    } });
    const active = resolveActivePhrases({ templateId: CATALOG_ID, message: variants[0] }, pool);
    expect(active.map((p) => p.source).sort()).toEqual(["catalog", "custom"]);
    expect(active.find((p) => p.source === "catalog")?.text).toBe(variants[1]);
  });

  it("falls back to campaign.message when nothing is selected (never goes silent)", () => {
    const active = resolveActivePhrases({ templateId: CATALOG_ID, message: "Mensagem base da campanha" }, null);
    expect(active).toHaveLength(1);
    expect(active[0].source).toBe("fallback");
    expect(active[0].key).toBe(phraseKey("Mensagem base da campanha"));
  });

  it("falls back when selections reference phrases no longer in the catalog", () => {
    const pool = parseMessagePool({ messagePool: { selected: ["mf_9_zzzzzz"] } });
    const active = resolveActivePhrases({ templateId: CATALOG_ID, message: "Base" }, pool);
    expect(active).toHaveLength(1);
    expect(active[0].source).toBe("fallback");
  });
});

describe("crmMessagePool — pick & meta templates", () => {
  it("draws deterministically with an injected RNG", () => {
    const phrases = resolveActivePhrases({ templateId: CATALOG_ID, message: variants[0] }, parseMessagePool({
      messagePool: { selected: [phraseKey(variants[0]), phraseKey(variants[1]), phraseKey(variants[2])] },
    }));
    expect(phrases).toHaveLength(3);
    expect(pickPhrase(phrases, () => 0)?.text).toBe(variants[0]);
    expect(pickPhrase(phrases, () => 0.99)?.text).toBe(variants[2]);
    expect(pickPhrase([], () => 0)).toBeNull();
  });

  it("reads per-phrase meta templates defensively", () => {
    const key = phraseKey(variants[0]);
    const map = readPhraseMetaTemplates({
      metaTemplates: {
        [key]:  { name: "foocci_frios_v1", language: "pt_BR", params: ["{nome}"] },
        badRow: { language: "pt_BR" }, // no name → dropped
      },
    });
    expect(map[key]?.name).toBe("foocci_frios_v1");
    expect(map.badRow).toBeUndefined();
    expect(readPhraseMetaTemplates(null)).toEqual({});
  });
});
