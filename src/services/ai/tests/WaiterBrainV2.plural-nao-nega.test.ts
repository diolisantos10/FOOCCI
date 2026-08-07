/**
 * P0 de 07/08/2026 — o plural deixa de negar o que a loja vende.
 *
 * Medido na loja de vitrine `foocci-bakery`, em 11 pares singular/plural:
 * **7 viravam negação**.
 *
 *   "tem bolo?"  → 3 cards  |  "tem bolos?"  → "Não encontrei bolos no cardápio"
 *   "tem torta?" → 1 card   |  "tem tortas?" → idem
 *   "quais sobremesas vocês têm?" → negação, com 7 cadastradas em Confeitaria
 *
 * Duas causas, na mesma doença:
 *  1. a busca casa por SUBSTRING — "bolo" cabe em "Bolo de Fubá", "bolos" não;
 *  2. os grupos de sinônimo e o mapa de proximidade casam por PALAVRA INTEIRA
 *     (`\bsobremesa\b`), e o "s" quebra a fronteira.
 *
 * É o mesmo defeito que derrubou o rodízio do Sushi Cazza, corrigido no Q&A em
 * `knowledgeMatch.foldPlural` — a MESMA função foi importada aqui, não recriada.
 *
 * ── METADE E METADE ─────────────────────────────────────────────────────────
 * A segunda metade é a que importa mais: dobra de plural frouxa faz o agente
 * achar qualquer coisa em tudo, que é o defeito oposto e pior — ele volta a
 * "encontrar" o que a casa não tem. Por isso metade destes testes prova que a
 * negação legítima continua acontecendo, e que a busca não virou peneira.
 */

import { describe, it, expect } from "vitest";
import { decide, searchMenuByQuery, type V2CatalogItem } from "../WaiterBrainV2";
import { BAKERY_MENU } from "@/services/demo/foocci-bakery.data";

/** O cardápio real da loja de vitrine — o caso que motivou esta correção. */
const BAKERY: V2CatalogItem[] = (() => {
  const out: V2CatalogItem[] = [];
  let n = 0;
  const slug = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  for (const c of BAKERY_MENU) {
    for (const i of c.items) {
      out.push({
        id: slug(i.name), name: i.name, categoryName: c.name, price: i.price,
        sortOrder: n++, description: i.description ?? null,
        alergenosDetalhados: i.alergenosDetalhados ?? null,
        salesCount: null, isBestSeller: null,
      } as V2CatalogItem);
    }
  }
  return out;
})();

function item(p: Partial<V2CatalogItem> & { id: string; name: string }): V2CatalogItem {
  return {
    categoryName: "Padaria", price: 10, description: null,
    alergenosDetalhados: "nenhum", salesCount: null, isBestSeller: null, ...p,
  } as V2CatalogItem;
}

const PADARIA: V2CatalogItem[] = [
  item({ id: "pao-frances", name: "Pão Francês", price: 1.4, sortOrder: 1,
         description: "Casca que estala." }),
  item({ id: "bolo-fuba", name: "Bolo de Fubá", categoryName: "Confeitaria", price: 10.9, sortOrder: 2,
         description: "Fubá de moinho de pedra." }),
  item({ id: "bolo-cenoura", name: "Bolo de Cenoura", categoryName: "Confeitaria", price: 12.9, sortOrder: 3,
         description: "Massa úmida de cenoura." }),
  item({ id: "torta", name: "Torta Holandesa", categoryName: "Confeitaria", price: 18.9, sortOrder: 4,
         description: "Base de biscoito amanteigado." }),
  item({ id: "brownie", name: "Brownie de Chocolate 70%", categoryName: "Confeitaria", price: 13.9, sortOrder: 5,
         description: "Denso, casquinha craquelada." }),
  item({ id: "sanduiche", name: "Sanduíche de Parma", categoryName: "Lanches", price: 44.9, sortOrder: 6,
         description: "Na baguete rústica." }),
  item({ id: "suco", name: "Suco de Laranja Natural", categoryName: "Café & Bebidas", price: 13.9, sortOrder: 7,
         description: "Espremido na hora." }),
  item({ id: "geleia", name: "Geleia Artesanal 240g", categoryName: "Da Nossa Despensa", price: 32.9, sortOrder: 8,
         description: "Cozida na panela." }),
  item({ id: "cafe", name: "Café Coado da Casa", categoryName: "Café & Bebidas", price: 5.9, sortOrder: 9,
         description: "Coado no pano." }),
  item({ id: "chapa", name: "Misto Quente na Chapa", categoryName: "Lanches", price: 17.9, sortOrder: 10,
         description: "Presunto e mussarela." }),
];

const responder = (msg: string) =>
  decide({ event: "ON_USER_MESSAGE", message: msg, cartItemIds: [], cartValue: 0, catalog: PADARIA });

const nega = (msg: string) => /não encontrei/i.test(responder(msg).message);

// ─────────────────────────────────────────────────────────────────────────────
// METADE 1 — o plural encontra o que existe
// ─────────────────────────────────────────────────────────────────────────────

describe("P0 plural — o que a loja vende para de ser negado", () => {
  const pares: Array<[string, string, string]> = [
    ["tem bolo?",       "tem bolos?",       "bolo-fuba"],
    ["tem torta?",      "tem tortas?",      "torta"],
    ["tem suco?",       "tem sucos?",       "suco"],
    ["tem sanduíche?",  "tem sanduíches?",  "sanduiche"],
    ["tem geleia?",     "tem geleias?",     "geleia"],
    ["tem brownie?",    "tem brownies?",    "brownie"],
  ];

  for (const [sing, plur, esperado] of pares) {
    it(`"${plur}" acha o mesmo que "${sing}"`, () => {
      expect(nega(sing)).toBe(false);
      expect(nega(plur)).toBe(false);
      expect(responder(plur).cards).toContain(esperado);
    });
  }

  it("'quais sobremesas vocês têm?' não nega — o caso literal da foocci-bakery", () => {
    // Este roda contra o cardápio REAL da loja de vitrine, porque foi ele que
    // produziu o defeito: a categoria chama "Confeitaria", nenhum item tem a
    // palavra "sobremesa", e a resposta era
    // "Não encontrei sobremesas no nosso cardápio" com 7 delas cadastradas.
    const out = decide({
      event: "ON_USER_MESSAGE", message: "quais sobremesas vocês têm?",
      cartItemIds: [], cartValue: 0, catalog: BAKERY,
    });
    expect(out.message).not.toMatch(/não encontrei/i);
    const nomes = out.cards.map((id) => BAKERY.find((i) => i.id === id)?.name ?? "");
    expect(nomes.some((n) => /bolo|torta|brownie|cheesecake|sonho|pastel/i.test(n))).toBe(true);
  });

  it("o plural na categoria (palavra inteira) também casa", () => {
    // "sobremesas" precisa passar por \bsobremesa\b nos grupos de sinônimo.
    const r = searchMenuByQuery("tem sobremesas?", PADARIA, [], []);
    expect(r.ids.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 2 — a peneira não virou funil (o defeito oposto, que é pior)
// ─────────────────────────────────────────────────────────────────────────────

describe("P0 plural — a negação legítima continua acontecendo", () => {
  it("'vocês têm pizza?' continua dizendo que não encontrou", () => {
    expect(nega("vocês têm pizza?")).toBe(true);
  });

  it("'tem pizzas?' (plural do que NÃO existe) também nega", () => {
    expect(nega("tem pizzas?")).toBe(true);
  });

  it("o plural não faz um termo curto casar dentro de outra palavra", () => {
    // "chás" → "chas" → dobra crua daria "cha", que cabe dentro de "Chapa".
    // O freio de tamanho existe justamente para isto.
    const r = searchMenuByQuery("tem chás?", PADARIA, [], []);
    expect(r.ids).not.toContain("chapa");
  });

  it("termo inexistente não passa a achar o cardápio inteiro", () => {
    const r = searchMenuByQuery("tem feijoadas?", PADARIA, [], []);
    expect(r.ids).toHaveLength(0);
  });

  it("a dobra nunca REMOVE um casamento que já funcionava", () => {
    // Toda busca no singular que achava algo continua achando o mesmo.
    for (const [sing] of [["tem bolo?"], ["tem torta?"], ["tem suco?"], ["tem café?"], ["quero um pão francês"]]) {
      const r = searchMenuByQuery(sing!, PADARIA, [], []);
      expect(r.ids.length).toBeGreaterThan(0);
    }
  });

  it("busca por item específico segue devolvendo o item, não a loja toda", () => {
    const r = searchMenuByQuery("tem brownies?", PADARIA, [], []);
    expect(r.ids[0]).toBe("brownie");
    expect(r.ids.length).toBeLessThan(PADARIA.length);
  });

  it("nenhum card inventado entra por causa da dobra", () => {
    const ids = new Set(PADARIA.map((i) => i.id));
    for (const m of ["tem bolos?", "tem tortas?", "tem sobremesas?", "tem pizzas?"]) {
      for (const c of responder(m).cards) expect(ids.has(c)).toBe(true);
    }
  });
});
