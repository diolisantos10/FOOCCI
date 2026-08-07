/**
 * 07/08/2026 — o Garçom passa a dizer DE QUE está falando.
 *
 * O CEO nomeou o defeito duas vezes: *"o garçom é super repetitivo… ele só fala
 * 'é isso', 'está ótimo', 'ótima escolha'"*. Medido na loja de vitrine, em 40
 * perguntas: 34 respostas determinísticas, 15 frases distintas, a campeã 8× e
 * — o número que resume tudo — **0 de 34 citavam um produto ou categoria pelo
 * nome**. Quatro perguntas diferentes recebiam resposta idêntica byte a byte.
 *
 * Três frentes, todas cobertas aqui:
 *   (a) a abertura nomeia o assunto (item, ou categoria quando é uma só);
 *   (b) o seed passa a incluir a PERGUNTA, não só a lista de cards;
 *   (c) o `ACK_POOL` cresce, nomeia o item e perde o 🍱 de marmita japonesa.
 * Mais o que já estava cadastrado e nunca saía: `storytellingIA`/`perfilPaladar`
 * quando a resposta é de um item só.
 *
 * ── METADE E METADE ─────────────────────────────────────────────────────────
 * A metade que protege é a que impede a "humanização" de virar mentira: o agente
 * não pode nomear produto que não está mostrando (era o que a regra 4 do
 * validador já fazia, e ela continua valendo para tudo que não seja o carrinho
 * do próprio cliente), o molde nunca pode vazar cru, e a resposta continua com
 * teto de 2 linhas.
 */

import { describe, it, expect } from "vitest";
import { decide, type V2CatalogItem } from "../WaiterBrainV2";

function item(p: Partial<V2CatalogItem> & { id: string; name: string }): V2CatalogItem {
  return {
    categoryName: "Padaria", price: 10, description: null,
    alergenosDetalhados: "nenhum", salesCount: null, isBestSeller: null, ...p,
  } as V2CatalogItem;
}

const CAT: V2CatalogItem[] = [
  item({ id: "pao-frances", name: "Pão Francês", price: 1.4, sortOrder: 1, description: "Casca que estala." }),
  item({ id: "baguete", name: "Baguete Rústica", price: 14.9, sortOrder: 2, description: "Casca fina e crocante.",
         perfilPaladar: "tostado, crocante",
         storytellingIA: "O levain da casa tem nome e sete anos de idade: chama Aurora. É alimentado todo dia." }),
  item({ id: "coxinha", name: "Coxinha de Frango", categoryName: "Salgados", price: 10.9, sortOrder: 3,
         description: "Massa de batata." }),
  item({ id: "empada", name: "Empada de Palmito", categoryName: "Salgados", price: 10.5, sortOrder: 4,
         description: "Massa podre amanteigada." }),
  item({ id: "esfiha", name: "Esfiha Aberta", categoryName: "Salgados", price: 8.9, sortOrder: 5,
         description: "Carne moída na hora." }),
  item({ id: "quiche", name: "Quiche Lorraine", categoryName: "Salgados", price: 18.9, sortOrder: 6,
         description: "Bacon defumado.", perfilPaladar: "salgado, defumado, cremoso" }),
  item({ id: "cafe", name: "Café Coado da Casa", categoryName: "Café & Bebidas", price: 5.9, sortOrder: 7,
         description: "Coado no pano." }),
  item({ id: "suco", name: "Suco de Laranja", categoryName: "Café & Bebidas", price: 13.9, sortOrder: 8,
         description: "Espremido na hora." }),
];

const responder = (msg: string, cart: string[] = []) =>
  decide({ event: "ON_USER_MESSAGE", message: msg, cartItemIds: cart, cartValue: 0, catalog: CAT });

const adicionar = (id: string, cart: string[] = []) =>
  decide({ event: "ON_ITEM_ADDED", lastAddedId: id, cartItemIds: [...cart, id], cartValue: 1, catalog: CAT });

// ─────────────────────────────────────────────────────────────────────────────
// METADE 1 — a resposta passa a ter conteúdo
// ─────────────────────────────────────────────────────────────────────────────

describe("repertório — a abertura diz de que está falando", () => {
  it("categoria única → a abertura nomeia a categoria", () => {
    const out = responder("quais salgados vocês têm?");
    expect(out.cards.length).toBeGreaterThan(1);
    expect(out.message).toMatch(/Salgados/);
  });

  it("um item só → a abertura nomeia o item", () => {
    const out = responder("tem quiche lorraine?");
    expect(out.cards).toEqual(["quiche"]);
    expect(out.message).toMatch(/Quiche Lorraine/);
  });

  it("um item só COM storytelling cadastrado → a história sai", () => {
    const out = responder("tem baguete rústica?");
    expect(out.cards).toEqual(["baguete"]);
    expect(out.message).toMatch(/Aurora/);
  });

  it("sem storytelling, o perfil de paladar entra no lugar", () => {
    const out = responder("tem quiche lorraine?");
    expect(out.message).toMatch(/salgado|defumado|cremoso/i);
  });

  it("duas perguntas diferentes com os MESMOS cards não devolvem a mesma frase", () => {
    // Era o caso literal da bakery: "o que vocês têm?" e "qual você recomenda?"
    // saíam idênticas byte a byte porque o seed era só a lista de cards.
    const a = responder("quais salgados vocês têm?");
    const b = responder("me mostra os salgados");
    if (JSON.stringify(a.cards) === JSON.stringify(b.cards)) {
      expect(a.message).not.toBe(b.message);
    }
  });

  it("o item adicionado é chamado pelo nome", () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 300; i++) vistas.add(adicionar("pao-frances").message);
    expect([...vistas].some((m) => m.includes("Pão Francês"))).toBe(true);
  });

  it("o repertório de confirmação cresceu de 4 para ≥ 6 frases", () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 500; i++) vistas.add(adicionar("pao-frances").message);
    expect(vistas.size).toBeGreaterThanOrEqual(6);
  });

  it("o 🍱 (marmita japonesa) saiu da padaria", () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 500; i++) {
      vistas.add(adicionar("pao-frances").message);
      vistas.add(adicionar("coxinha", ["pao-frances", "cafe"]).message);
    }
    for (const m of vistas) expect(m).not.toContain("🍱");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 2 — humanizar não pode virar mentira nem vazamento
// ─────────────────────────────────────────────────────────────────────────────

describe("repertório — a metade que protege", () => {
  it("nunca nomeia produto que NÃO está entre os cards nem no carrinho", () => {
    for (const m of ["quais salgados vocês têm?", "tem café?", "me indica alguma coisa"]) {
      const out = responder(m);
      const mostrados = new Set(out.cards);
      for (const i of CAT) {
        if (mostrados.has(i.id)) continue;
        expect(out.message).not.toContain(i.name);
      }
    }
  });

  it("o molde nunca vaza cru para o cliente", () => {
    const msgs: string[] = [];
    for (const m of ["quais salgados vocês têm?", "tem quiche lorraine?", "tem café?", "me indica algo"]) {
      msgs.push(responder(m).message);
    }
    for (let i = 0; i < 200; i++) msgs.push(adicionar("pao-frances").message);
    for (const m of msgs) {
      expect(m).not.toContain("{x}");
      expect(m).not.toContain("{n}");
    }
  });

  it("a resposta continua com teto de 2 linhas", () => {
    for (const m of ["tem baguete rústica?", "quais salgados vocês têm?", "tem quiche lorraine?"]) {
      const linhas = responder(m).message.split("\n").filter((l) => l.trim());
      expect(linhas.length).toBeLessThanOrEqual(2);
    }
  });

  it("lista de categorias MISTURADAS não inventa um assunto", () => {
    // Sem categoria única e com mais de um item, a abertura volta a ser a
    // moldura genérica — inventar um assunto seria pior que não ter.
    const out = responder("me indica alguma coisa");
    const cats = new Set(out.cards.map((id) => CAT.find((i) => i.id === id)?.categoryName));
    if (cats.size > 1) {
      for (const i of CAT) expect(out.message).not.toContain(i.name);
    }
  });

  it("ON_ITEM_ADDED continua sem cards e sem botões (regra 7 do validador)", () => {
    const out = adicionar("pao-frances");
    expect(out.cards).toHaveLength(0);
    expect(out.options).toHaveLength(0);
  });

  it("o mesmo item não é confirmado duas vezes na mesma sessão", () => {
    const mem = decide({ event: "ON_ITEM_ADDED", lastAddedId: "pao-frances",
                         cartItemIds: ["pao-frances"], cartValue: 1, catalog: CAT }).memoryPatch;
    const dnv = decide({ event: "ON_ITEM_ADDED", lastAddedId: "pao-frances",
                         cartItemIds: ["pao-frances"], cartValue: 1, catalog: CAT,
                         memory: { ...({} as never), ...mem } as never });
    expect(dnv.message).toBe("");
  });

  it("nenhum card inventado por causa da abertura nomeada", () => {
    const ids = new Set(CAT.map((i) => i.id));
    for (const m of ["quais salgados vocês têm?", "tem quiche lorraine?", "tem baguete rústica?"]) {
      for (const c of responder(m).cards) expect(ids.has(c)).toBe(true);
    }
  });
});
