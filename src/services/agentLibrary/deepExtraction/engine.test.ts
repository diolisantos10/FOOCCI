import { describe, it, expect } from "vitest";
import { chunkText, isDeepCandidate, progressPercent, wasTruncated, CHUNK_CHARS, MAX_CHUNKS } from "./chunking";
import {
  dedupeCandidates,
  consolidateToTechniques,
  isGenericTechnique,
  normalizeTechniqueName,
  type CandidateLike,
} from "./consolidation";

// ── chunking ─────────────────────────────────────────────────────────────────

describe("chunking", () => {
  it("(2) splits large material into multiple chunks with correct index/charCount", () => {
    const para = "Parágrafo de venda consultiva. ".repeat(60); // ~1.8k chars
    const text = Array.from({ length: 20 }, () => para).join("\n\n"); // ~36k chars
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.charCount).toBe(c.text.length);
      expect(c.charCount).toBeLessThanOrEqual(CHUNK_CHARS + 1);
    });
  });

  it("keeps short text as a single chunk and empty text as none", () => {
    expect(chunkText("uma nota curta").length).toBe(1);
    expect(chunkText("   ").length).toBe(0);
  });

  it("hard-splits a single oversized paragraph", () => {
    const huge = "x".repeat(CHUNK_CHARS * 3 + 100);
    const chunks = chunkText(huge);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
  });

  it("caps chunks at MAX_CHUNKS and flags truncation", () => {
    const huge = "y".repeat(CHUNK_CHARS * (MAX_CHUNKS + 5));
    expect(chunkText(huge).length).toBe(MAX_CHUNKS);
    expect(wasTruncated(huge)).toBe(true);
  });

  it("isDeepCandidate distinguishes small vs large material", () => {
    expect(isDeepCandidate("curto")).toBe(false);
    expect(isDeepCandidate("z".repeat(20_000))).toBe(true);
  });

  it("(5) progressPercent computes 0–100 correctly", () => {
    expect(progressPercent({ totalChunks: 0, processedChunks: 0 })).toBe(0);
    expect(progressPercent({ totalChunks: 49, processedChunks: 23 })).toBe(47);
    expect(progressPercent({ totalChunks: 10, processedChunks: 10 })).toBe(100);
  });
});

// ── consolidation + dedupe ─────────────────────────────────────────────────────

function cand(over: Partial<CandidateLike> = {}): CandidateLike {
  return {
    techniqueName: "Pergunta de intenção de refeição",
    category: "Atendimento",
    application: "Quando o cliente pede ajuda genérica, identifique ocasião, fome e preferência antes de sugerir até 3 opções.",
    usageRule: "Máximo 1 pergunta antes de sugerir.",
    qualityTest: "Sugeriu ≤3 opções compatíveis?",
    confidence: 0.8,
    ...over,
  };
}

describe("consolidation", () => {
  it("normalizeTechniqueName strips case/accents/punctuation", () => {
    expect(normalizeTechniqueName("Redução de Fricção!")).toBe("reducao de friccao");
  });

  it("isGenericTechnique rejects vague/empty but keeps techniques with substance", () => {
    expect(isGenericTechnique(cand({ techniqueName: "Faça perguntas" }))).toBe(true);
    expect(isGenericTechnique(cand({ techniqueName: "Pergunte" }))).toBe(true);
    expect(isGenericTechnique(cand({ techniqueName: "X" }))).toBe(true); // too short
    // truly empty (no substantive field at all) → generic
    expect(isGenericTechnique(cand({ application: null, usageRule: null, qualityTest: null, principle: null }))).toBe(true);
    // keeps a technique that has only a strong principle/qualityTest (no application)
    expect(isGenericTechnique(cand({ application: null, usageRule: null, qualityTest: "Sugeriu ≤3 opções compatíveis?" }))).toBe(false);
    expect(isGenericTechnique(cand())).toBe(false); // a good, actionable one
  });

  it("(9) dedupes by normalized name + category, keeping the strongest", () => {
    const out = dedupeCandidates([
      cand({ confidence: 0.5, usageRule: null, qualityTest: null }),
      cand({ techniqueName: "pergunta de intenção de REFEIÇÃO", confidence: 0.9 }), // same after normalize
      cand({ techniqueName: "Redução de fricção", category: "Vendas" }),
    ]);
    expect(out.length).toBe(2); // the two "intenção" collapse into one
    const intent = out.find((t) => normalizeTechniqueName(t.techniqueName).includes("intencao"));
    expect(intent?.confidence).toBe(0.9); // strongest kept
  });

  it("(8) consolidateToTechniques drops generic, sorts by score, caps", () => {
    const many: CandidateLike[] = [
      cand({ techniqueName: "Faça perguntas" }), // generic → dropped
      cand({ techniqueName: "Técnica A", confidence: 0.6 }),
      cand({ techniqueName: "Técnica B", confidence: 0.95 }),
    ];
    const out = consolidateToTechniques(many, 5);
    expect(out.map((t) => t.techniqueName)).toEqual(["Técnica B", "Técnica A"]);
  });

  it("respects the cap", () => {
    const lots = Array.from({ length: 80 }, (_, i) => cand({ techniqueName: `Técnica ${i}` }));
    expect(consolidateToTechniques(lots, 40).length).toBe(40);
  });
});
