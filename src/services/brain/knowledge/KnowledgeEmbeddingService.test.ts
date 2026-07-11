import { describe, it, expect, beforeEach, vi } from "vitest";

// OpenAI embeddings mockado (nunca bate na API real em teste)
const embedApi = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/openai", () => ({ openai: { embeddings: { create: embedApi.create } } }));

// Prisma mockado — só o update usado pela persistência best-effort
const db = vi.hoisted(() => ({ restaurantKnowledgeItem: { update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  KNOWLEDGE_EMBEDDING_MODEL,
  MAX_EMBEDDING_BACKFILLS_PER_CALL,
  cosineSimilarity,
  embeddingTextOf,
  ensureItemEmbedding,
  rankByEmbedding,
} from "./KnowledgeEmbeddingService";

/** Embedding determinístico de brinquedo: eixo 0 = "rodizio", eixo 1 = resto. */
function toyVector(text: string): number[] {
  return /rodizio|rod[íi]zio/i.test(text) ? [1, 0.1] : [0.1, 1];
}

beforeEach(() => {
  vi.clearAllMocks();
  embedApi.create.mockImplementation(async ({ input }: { input: string }) => ({
    data: [{ embedding: toyVector(input) }],
  }));
  db.restaurantKnowledgeItem.update.mockResolvedValue({});
});

describe("cosineSimilarity", () => {
  it("vetores idênticos → 1; ortogonais → 0", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("degenerados não explodem: tamanhos diferentes / vetor nulo → 0", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("embeddingTextOf", () => {
  it("junta título + questionPatterns (ignorando lixo não-string)", () => {
    expect(embeddingTextOf({ title: "Tem rodízio?", questionPatterns: ["rodizio", 42, "rodízio hoje"] }))
      .toBe("Tem rodízio? rodizio rodízio hoje");
    expect(embeddingTextOf({ title: "Só título", questionPatterns: null })).toBe("Só título");
  });
});

describe("ensureItemEmbedding", () => {
  it("usa o embedding persistido quando o modelo bate — zero chamadas de API", async () => {
    const vec = await ensureItemEmbedding({
      id: "k1", title: "Tem rodízio?", questionPatterns: [],
      embedding: [1, 0], embeddingModel: KNOWLEDGE_EMBEDDING_MODEL,
    });
    expect(vec).toEqual([1, 0]);
    expect(embedApi.create).not.toHaveBeenCalled();
    expect(db.restaurantKnowledgeItem.update).not.toHaveBeenCalled();
  });

  it("calcula e persiste quando ausente ou de modelo antigo", async () => {
    const vec = await ensureItemEmbedding({
      id: "k1", title: "Tem rodízio?", questionPatterns: ["rodizio"],
      embedding: [9, 9], embeddingModel: "modelo-antigo",
    });
    expect(vec).toEqual(toyVector("rodizio"));
    expect(db.restaurantKnowledgeItem.update).toHaveBeenCalledWith({
      where: { id: "k1" },
      data: { embedding: toyVector("rodizio"), embeddingModel: KNOWLEDGE_EMBEDDING_MODEL },
    });
  });

  it("falha de persistência é best-effort — o vetor calculado ainda volta", async () => {
    db.restaurantKnowledgeItem.update.mockRejectedValue(new Error("db offline"));
    const vec = await ensureItemEmbedding({ id: "k1", title: "Tem rodízio?", questionPatterns: [] });
    expect(vec).toEqual(toyVector("rodízio"));
  });

  it("erro de API → null (nunca lança)", async () => {
    embedApi.create.mockRejectedValue(new Error("401"));
    await expect(ensureItemEmbedding({ id: "k1", title: "x", questionPatterns: [] })).resolves.toBeNull();
  });
});

describe("rankByEmbedding", () => {
  const rodizio = {
    id: "k-rodizio", title: "Tem rodízio?", questionPatterns: ["rodizio"],
    embedding: toyVector("rodizio"), embeddingModel: KNOWLEDGE_EMBEDDING_MODEL,
  };
  const popular = (i: number) => ({
    id: `k-${i}`, title: `Pergunta popular ${i}`, questionPatterns: [`assunto${i}`],
    embedding: toyVector("outro assunto"), embeddingModel: KNOWLEDGE_EMBEDDING_MODEL,
  });

  it("o item semanticamente próximo da query sobe para o topo (1 call para a query)", async () => {
    const items = [popular(0), popular(1), rodizio, popular(2)];
    const ranked = await rankByEmbedding("vocês têm rodízio hoje?", items);
    expect(ranked?.[0].id).toBe("k-rodizio");
    // embeddings persistidos → só a query foi embedada
    expect(embedApi.create).toHaveBeenCalledTimes(1);
    expect(db.restaurantKnowledgeItem.update).not.toHaveBeenCalled();
  });

  it("empate/irrelevantes preservam a ordem original (que é a de uso)", async () => {
    const ranked = await rankByEmbedding("vocês têm rodízio?", [popular(0), popular(1), rodizio]);
    expect(ranked?.map((r) => r.id)).toEqual(["k-rodizio", "k-0", "k-1"]);
  });

  it("backfill lazy: itens sem embedding são embedados e persistidos, com cap por chamada", async () => {
    const bare = Array.from({ length: MAX_EMBEDDING_BACKFILLS_PER_CALL + 5 }, (_, i) => ({
      id: `bare-${i}`, title: `Pergunta ${i}`, questionPatterns: [] as unknown,
    }));
    const ranked = await rankByEmbedding("qualquer pergunta", bare);
    expect(ranked).toHaveLength(bare.length);
    // 1 (query) + no máx 20 (backfills) — os 5 excedentes ficam para a próxima chamada
    expect(embedApi.create).toHaveBeenCalledTimes(1 + MAX_EMBEDDING_BACKFILLS_PER_CALL);
    expect(db.restaurantKnowledgeItem.update).toHaveBeenCalledTimes(MAX_EMBEDDING_BACKFILLS_PER_CALL);
    // itens sem vetor (além do cap) vão para o fim, na ordem original
    expect(ranked?.slice(-5).map((r) => r.id)).toEqual(["bare-20", "bare-21", "bare-22", "bare-23", "bare-24"]);
  });

  it("erro ao embedar a query → null (sinal de fallback keyword)", async () => {
    embedApi.create.mockRejectedValue(new Error("timeout"));
    await expect(rankByEmbedding("rodízio?", [rodizio])).resolves.toBeNull();
  });

  it("mock/cliente sem embeddings (como nos testes do Brain) → null, nunca lança", async () => {
    embedApi.create.mockImplementation(() => {
      throw new TypeError("openai.embeddings is undefined");
    });
    await expect(rankByEmbedding("rodízio?", [rodizio])).resolves.toBeNull();
  });

  it("lista vazia ou nenhum item com vetor → null", async () => {
    await expect(rankByEmbedding("rodízio?", [])).resolves.toBeNull();
    // query embeda, mas todos os itens falham no backfill
    embedApi.create
      .mockResolvedValueOnce({ data: [{ embedding: [1, 0] }] })
      .mockRejectedValue(new Error("429"));
    await expect(
      rankByEmbedding("rodízio?", [{ id: "k1", title: "x", questionPatterns: [] }]),
    ).resolves.toBeNull();
  });
});
