import { describe, it, expect } from "vitest";
import {
  rankChapters,
  buildManualContext,
  type ManualChapterInput,
} from "./manualRetrieval";

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
