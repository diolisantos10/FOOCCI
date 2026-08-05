/**
 * Duas coisas moram neste arquivo, e elas são separadas de propósito:
 *
 *   • a MECÂNICA do ranking (`scoreChapters`) — pontua e ordena, sem cortar;
 *   • o PORTÃO de admissão (`rankChapters`) — quem pode virar verdade.
 *
 * Antes eram a mesma função, e por isso os testes de ordenação eram lidos como
 * prova de que o retrieval "funcionava". Não eram: nenhum deles perguntava o que
 * acontece quando NADA casa — e a resposta, em produção, era "volta o menos
 * ruim, rotulado como verdade".
 *
 * A prova do portão contra o corpus REAL está em manualRetrievalCorpus.test.ts.
 * Aqui os capítulos são de brinquedo e servem para testar mecanismo.
 */

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
  scoreChapters,
  buildManualContext,
  retrieveRelevantChapters,
  MIN_KEYWORD_SCORE,
  MIN_TERM_IDF_COVERAGE,
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

describe("scoreChapters — a mecânica (pontua e ordena, não corta)", () => {
  const chapters: ManualChapterInput[] = [
    chapter({
      slug: "cardapio",
      title: "Cardápio: como cadastrar produtos",
      content: "Passo a passo para adicionar itens ao cardápio. No cardápio, cada produto tem nome, preço e foto.",
    }),
    chapter({
      slug: "whatsapp",
      title: "Conectar o WhatsApp",
      content: "Como integrar o número do WhatsApp ao Foocci. O WhatsApp conecta por QR Code.",
    }),
    chapter({
      slug: "crm",
      title: "Promoções no CRM",
      content: "Como criar campanhas e promoções para clientes. A promoção pode ser por cupom.",
    }),
  ];

  it("ranks the chapter whose title matches first", () => {
    const out = scoreChapters("como cadastro um produto no cardápio", chapters);
    expect(out[0]!.slug).toBe("cardapio");
  });

  it("matches accent-insensitively (promocao → Promoções)", () => {
    const out = scoreChapters("quero criar uma promocao", chapters);
    expect(out[0]!.slug).toBe("crm");
  });

  it("returns [] when the question is only stopwords", () => {
    expect(scoreChapters("como que eu", chapters)).toEqual([]);
  });

  it("weights a title hit above a body-only hit", () => {
    const pair: ManualChapterInput[] = [
      chapter({ slug: "title-hit", title: "Pagamento Pix", content: "abc" }),
      chapter({ slug: "body-hit", title: "Outro assunto", content: "pix pix" }),
    ];
    const out = scoreChapters("pagamento", pair);
    expect(out[0]!.slug).toBe("title-hit");
  });

  it("termo banal (presente em todo capítulo) quase não conta na cobertura", () => {
    const corpus = [
      chapter({ slug: "a", title: "Pedidos", content: "pedido pedido pedido" }),
      chapter({ slug: "b", title: "Entrega", content: "pedido pedido pedido" }),
      chapter({ slug: "c", title: "Pagamento", content: "pedido pedido pedido" }),
    ];
    // "estorno" não existe em lugar nenhum; "pedido" existe em todos. Casar só
    // "pedido" cobre quase nada da informação da pergunta.
    const out = scoreChapters("estorno do pedido", corpus);
    expect(out[0]!.score).toBeGreaterThan(0);
    expect(out[0]!.coverage).toBeLessThan(MIN_TERM_IDF_COVERAGE);
  });
});

describe("rankChapters — o PORTÃO de admissão", () => {
  const chapters: ManualChapterInput[] = [
    chapter({
      slug: "cardapio",
      title: "Cardápio: como cadastrar produtos",
      description: "Criar categorias e adicionar produtos ao cardápio.",
      content: "Passo a passo para adicionar itens ao cardápio. No cardápio, cada produto tem nome, preço e foto. Produto novo entra pelo botão + Novo Produto.",
    }),
    chapter({
      slug: "whatsapp",
      title: "Conectar o WhatsApp",
      description: "Conectar o número do restaurante.",
      content: "Como integrar o número do WhatsApp ao Foocci. O WhatsApp conecta por QR Code.",
    }),
  ];

  it("BARRA: pergunta sem guia nenhum devolve VAZIO (o agente vai dizer que não sabe)", () => {
    expect(rankChapters("como emito nota fiscal do pedido", chapters)).toEqual([]);
    expect(rankChapters("cliente quer estorno do pix", chapters)).toEqual([]);
  });

  it("BARRA: menção de passagem não é relevância (score abaixo do piso)", () => {
    const corpus = [
      chapter({
        slug: "equipe",
        title: "Como adicionar membros da equipe",
        content: "A pessoa entra com o e-mail e a senha criados, no mesmo endereço do painel.",
      }),
    ];
    // "senha" e "painel" aparecem UMA vez cada, de passagem. O guia não ensina
    // a recuperar senha nenhuma — e era ele que respondia "esqueci a senha".
    const [top] = scoreChapters("esqueci a senha do painel", corpus);
    expect(top!.coverage).toBeGreaterThanOrEqual(MIN_TERM_IDF_COVERAGE); // cobertura ALTA
    expect(top!.score).toBeLessThan(MIN_KEYWORD_SCORE); // e mesmo assim barra
    expect(rankChapters("esqueci a senha do painel", corpus)).toEqual([]);
  });

  it("DEIXA PASSAR: a pergunta legítima continua trazendo o guia certo", () => {
    const out = rankChapters("como cadastro um produto no cardápio", chapters);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.slug).toBe("cardapio");
  });

  it("respects the limit", () => {
    const out = rankChapters("cardápio produtos whatsapp número", chapters, 1);
    expect(out.length).toBe(1);
  });

  it("truncates very long content with an ellipsis", () => {
    const big = chapter({ slug: "big", title: "Pedidos", content: "pedidos ".repeat(600) });
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
      { id: "1", slug: "s", title: "Cardápio", area: "GENERAL", content: "corpo", score: 5, coverage: 1 },
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
describe("retrieveRelevantChapters — embeddings reordenam o que o piso admitiu", () => {
  /** Embedding de brinquedo: eixo 0 = "impressora", eixo 1 = resto. */
  const toy = (t: string) => (/impress/i.test(t) ? [1, 0.1] : [0.1, 1]);

  const rows = [
    {
      id: "c1", slug: "guia-cardapio", title: "Cardápio e impressão", area: "UI_UX",
      description: "Cadastro de produtos.", content: "Como cadastrar produtos no cardápio. Cardápio, produto e categoria.",
      embedding: null, embeddingModel: null,
    },
    {
      id: "c2", slug: "guia-impressora", title: "Impressora: impressão de comanda", area: "UI_UX",
      description: "Impressora térmica.", content: "Impressora térmica e fila de impressão. A impressora da cozinha imprime a comanda. Impressora offline não imprime.",
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
    const out = await retrieveRelevantChapters("minha impressora não imprime a comanda", 2);

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
    await retrieveRelevantChapters("a impressora não imprime", 2);
    expect(db.operationalManualChapter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isPublished: true, agentVisibility: true } }),
    );
  });

  it("API de embedding fora do ar → cai no keyword, não fica mudo", async () => {
    embedApi.create.mockRejectedValue(new Error("429"));

    const out = await retrieveRelevantChapters("impressora não imprime a comanda", 2);

    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.slug).toBe("guia-impressora"); // keyword acertou o mesmo alvo
  });

  it("sem OPENAI_API_KEY nem tenta embedding — comportamento antigo intacto", async () => {
    delete process.env.OPENAI_API_KEY;

    const out = await retrieveRelevantChapters("impressora não imprime a comanda", 2);

    expect(embedApi.create).not.toHaveBeenCalled();
    expect(out[0]!.slug).toBe("guia-impressora");
  });

  it("o piso lexical roda ANTES do embedding: pergunta sem guia não chega a embedar", async () => {
    const out = await retrieveRelevantChapters("como emito nota fiscal do pedido", 4);

    expect(out).toEqual([]);
    // Nem a query foi embedada — não há o que reordenar quando ninguém entrou.
    expect(embedApi.create).not.toHaveBeenCalled();
  });

  it("o piso de cosseno corta o admitido semanticamente desconexo", async () => {
    // Query no eixo "impressora": o capítulo de cardápio fica em ~0,198, abaixo
    // de MIN_EMBEDDING_SIMILARITY (0,2) — passou no piso lexical e cai aqui.
    const out = await retrieveRelevantChapters("impressora não imprime a comanda no cardápio", 4);

    expect(out.map((c) => c.slug)).toEqual(["guia-impressora"]);
  });
});
