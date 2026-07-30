/**
 * "Não temos VOCES no cardápio."
 *
 * Foi essa frase, saída do Garçom de verdade, que originou este arquivo. O
 * cliente perguntava "vocês têm pizza?" e a resposta trocava o produto pelo
 * pronome. A causa era pequena e a consequência não: o rótulo da negação era
 * `queryTerms[0]`, e "voces" não estava na lista de palavras sem significado de
 * cardápio — então o pronome no plural virava o termo de busca e, pior, o termo
 * exibido. O mesmo acontecia com "vende açaí?" ("Não encontrei VENDE") e com
 * "vocês servem almoço?" ("Não encontrei VOCES"), que é pergunta corriqueira.
 *
 * O que estes testes travam:
 *   1. o produto perguntado é o que aparece na frase — não o pronome, não o verbo;
 *   2. o acento do cliente volta para ele ("hambúrguer", não "hamburguer");
 *   3. as palavras de pergunta pararam de contar como termo de busca, que era
 *      a raiz do problema e vale para toda a busca de cardápio, não só o rótulo.
 */

import { describe, it, expect } from "vitest";

import { decide, resolveMenuIntent, termoPerguntado, type V2CatalogItem } from "../WaiterBrainV2";

/** Catálogo japonês: nada de pizza, hambúrguer ou açaí. */
const CATALOGO: V2CatalogItem[] = [
  { id: "t1", name: "Temaki Salmão",      categoryName: "Temakis",        price: 22, sortOrder: 1 },
  { id: "y1", name: "Yakisoba de Frango", categoryName: "Pratos Quentes", price: 35, sortOrder: 2 },
  { id: "c1", name: "Combinado 40 peças", categoryName: "Combinados",     price: 89, sortOrder: 3 },
];

const responder = (mensagem: string) =>
  decide({ event: "ON_USER_MESSAGE", cartItemIds: [], cartValue: 0, catalog: CATALOGO, message: mensagem });

describe("o termo que o cliente perguntou", () => {
  it("REGRESSÃO: 'vocês têm pizza?' fala de pizza, não de 'voces'", () => {
    expect(termoPerguntado("vocês têm pizza?")).toBe("pizza");
    expect(responder("vocês têm pizza?").message).toContain("pizza");
    expect(responder("vocês têm pizza?").message.toLowerCase()).not.toContain("voces");
  });

  it("REGRESSÃO: 'vende açaí?' fala de açaí, não de 'vende'", () => {
    expect(termoPerguntado("vende açaí?")).toBe("açaí");
  });

  it("REGRESSÃO: 'vocês servem almoço?' não devolve o pronome", () => {
    expect(termoPerguntado("vocês servem almoço?")).toBe("almoço");
  });

  it("devolve o acento que o cliente escreveu", () => {
    expect(termoPerguntado("tem hambúrguer?")).toBe("hambúrguer");
    expect(responder("tem hambúrguer?").message).toContain("hambúrguer");
  });

  it("nome de duas palavras sai inteiro — antes saía só a primeira", () => {
    expect(termoPerguntado("quero pizza calabresa")).toBe("pizza calabresa");
  });

  it("corta em duas palavras: rótulo é nome de prato, não a frase toda", () => {
    expect(termoPerguntado("queria muito uma pizza calabresa bem grande hoje")).toBe("pizza calabresa");
  });

  it("pergunta sem produto nenhum não inventa termo", () => {
    expect(termoPerguntado("vocês vendem?")).toBe("esse item");
    expect(termoPerguntado("tem?")).toBe("esse item");
    expect(termoPerguntado("   ")).toBe("esse item");
  });

  it("o cliente grita e a resposta continua em caixa baixa", () => {
    expect(termoPerguntado("TEM PIZZA?")).toBe("pizza");
  });
});

describe("palavra de pergunta parou de valer como termo de busca", () => {
  it("o pronome no plural sai dos termos — era daqui que vinha o defeito", () => {
    expect(resolveMenuIntent("vocês têm pizza?", CATALOGO).queryTerms).toEqual(["pizza"]);
  });

  it("verbo de venda também sai", () => {
    expect(resolveMenuIntent("vende açaí?", CATALOGO).queryTerms).toEqual(["acai"]);
  });

  it("saudação não é produto", () => {
    expect(resolveMenuIntent("boa noite, tem temaki?", CATALOGO).queryTerms).toEqual(["temaki"]);
  });

  it("pergunta só com palavra de pergunta deixa de virar negação falsa", () => {
    // Antes: termos ["voces","vendem"] → nenhum casava → noMatch=true → o motor
    // negava um item que o cliente nem chegou a nomear.
    const r = resolveMenuIntent("vocês vendem?", CATALOGO);
    expect(r.queryTerms).toEqual([]);
    expect(r.noMatch).toBe(false);
  });
});

describe("o que a limpeza NÃO podia quebrar", () => {
  it("produto que existe continua sendo encontrado", () => {
    for (const [msg, id] of [
      ["vocês têm temaki?",        "t1"],
      ["vende yakisoba?",          "y1"],
      ["boa noite, tem combinado?", "c1"],
    ] as const) {
      const r = resolveMenuIntent(msg, CATALOGO);
      expect(r.noMatch, msg).toBe(false);
      const achados = [...r.exactMatches, ...r.categoryMatches].map((i) => i.id);
      expect(achados, msg).toContain(id);
    }
  });

  it("item ausente continua sendo negado — a negação não foi afrouxada", () => {
    const r = resolveMenuIntent("vocês têm pizza?", CATALOGO);
    expect(r.noMatch).toBe(true);
    expect(responder("vocês têm pizza?").message).toMatch(/[Nn][ãa]o (temos|encontrei)/);
  });
});
