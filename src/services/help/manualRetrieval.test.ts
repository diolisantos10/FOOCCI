import { describe, it, expect, beforeEach, vi } from "vitest";

// Embeddings e banco mockados — nenhum teste bate na API real nem no Postgres.
const embedApi = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/openai", () => ({ openai: { embeddings: { create: embedApi.create } } }));

const db = vi.hoisted(() => ({
  operationalManualChapter: { findMany: vi.fn(), update: vi.fn() },
  restaurantKnowledgeItem: { update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  rankChapters,
  buildManualContext,
  retrieveRelevantChapters,
  type ManualChapterInput,
} from "./manualRetrieval";
import { KNOWLEDGE_EMBEDDING_MODEL } from "@/services/brain/knowledge/KnowledgeEmbeddingService";

function chapter(over: Partial<ManualChapterInput>): ManualChapterInput {
  return {
    id: "id",
    slug: "slug",
    title: "Título",
    area: "GENERAL",
    content: "conteúdo",
    ...over,
  };
}

describe("rankChapters — keyword ranking", () => {
  const chapters: ManualChapterInput[] = [
    chapter({
      slug: "cardapio",
      title: "Cardápio: como cadastrar produtos",
      content: "Passo a passo para adicionar itens ao cardápio.",
    }),
    chapter({
      slug: "whatsapp",
      title: "Conectar o WhatsApp",
      content: "Como integrar o número do WhatsApp ao Foocci.",
    }),
    chapter({
      slug: "crm",
      title: "Promoções no CRM",
      content: "Como criar campanhas e promoções para clientes.",
    }),
  ];

  it("ranks the chapter whose title matches first", () => {
    const out = rankChapters("como cadastro um produto no cardápio", chapters);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.slug).toBe("cardapio");
  });

  it("matches accent-insensitively (promocao → Promoções)", () => {
    const out = rankChapters("quero criar uma promocao", chapters);
    expect(out[0]!.slug).toBe("crm");
  });

  it("returns [] when the question is only stopwords", () => {
    expect(rankChapters("como que eu", chapters)).toEqual([]);
  });

  it("returns [] when nothing matches", () => {
    expect(rankChapters("xyzzy quux", chapters)).toEqual([]);
  });

  it("respects the limit", () => {
    const out = rankChapters("cardápio whatsapp promoções", chapters, 2);
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it("weights a title hit above a body-only hit", () => {
    const pair: ManualChapterInput[] = [
      chapter({ slug: "title-hit", title: "Pagamento Pix", content: "abc" }),
      chapter({ slug: "body-hit", title: "Outro assunto", content: "pix pix" }),
    ];
    const out = rankChapters("pagamento", pair);
    expect(out[0]!.slug).toBe("title-hit");
  });

  it("truncates very long content with an ellipsis", () => {
    const big = chapter({ slug: "big", title: "Pedidos", content: "pedido ".repeat(600) });
    const out = rankChapters("pedidos", [big]);
    expect(out[0]!.content.endsWith("…")).toBe(true);
    expect(out[0]!.content.length).toBe(1801);
  });
});

describe("buildManualContext", () => {
  it("returns an empty string for no chapters", () => {
    expect(buildManualContext([])).toBe("");
  });

  it("includes each chapter title and content", () => {
    const ctx = buildManualContext([
      { id: "1", slug: "s", title: "Cardápio", area: "GENERAL", content: "corpo", score: 5 },
    ]);
    expect(ctx).toContain("Cardápio");
    expect(ctx).toContain("corpo");
  });
});

/**
 * O comentário que dizia "There are no embeddings in the project" era FALSO e
 * segurou o manual em keyword puro. Estes testes são a trava do fato novo: o
 * manual usa os embeddings que já existiam — e cai no keyword quando não dá.
 */
describe("retrieveRelevantChapters — embeddings com piso keyword", () => {
  /** Embedding de brinquedo: eixo 0 = "impressora", eixo 1 = resto. */
  const toy = (t: string) => (/impress/i.test(t) ? [1, 0.1] : [0.1, 1]);

  const rows = [
    {
      id: "c1", slug: "guia-cardapio", title: "Cardápio", area: "UI_UX",
      description: "", content: "Como cadastrar produtos.",
      embedding: null, embeddingModel: null,
    },
    {
      id: "c2", slug: "guia-impressora", title: "Impressão de comanda", area: "UI_UX",
      description: "", content: "Impressora térmica e fila de impressão.",
      embedding: null, embeddingModel: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "sk-test";
    embedApi.create.mockImplementation(async ({ input }: { input: string }) => ({
      data: [{ embedding: toy(input) }],
    }));
    db.operationalManualChapter.findMany.mockResolvedValue(rows.map((r) => ({ ...r })));
    db.operationalManualChapter.update.mockResolvedValue({});
  });

  it("ordena por similaridade semântica e persiste o vetor calculado", async () => {
    const out = await retrieveRelevantChapters("minha impressora saiu errado", 2);

    expect(out[0]!.slug).toBe("guia-impressora");
    // Backfill lazy: gravou o vetor no capítulo, com o modelo declarado.
    expect(db.operationalManualChapter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c2" },
        data: expect.objectContaining({ embeddingModel: KNOWLEDGE_EMBEDDING_MODEL }),
      }),
    );
  });

  it("só expõe capítulo publicado E visível a agente (o manual interno segue interno)", async () => {
    await retrieveRelevantChapters("impressora", 2);
    expect(db.operationalManualChapter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPublished: true, agentVisibility: true } }),
    );
  });

  it("API de embedding fora do ar → cai no keyword, não fica mudo", async () => {
    embedApi.create.mockRejectedValue(new Error("429"));

    const out = await retrieveRelevantChapters("impressão de comanda", 2);

    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.slug).toBe("guia-impressora"); // keyword acertou o mesmo alvo
  });

  it("sem OPENAI_API_KEY nem tenta embedding — comportamento antigo intacto", async () => {
    delete process.env.OPENAI_API_KEY;

    const out = await retrieveRelevantChapters("impressão de comanda", 2);

    expect(embedApi.create).not.toHaveBeenCalled();
    expect(out[0]!.slug).toBe("guia-impressora");
  });
});
