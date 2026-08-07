/**
 * P0 de 07/08/2026 — o filtro dietético passa a ler o que o restaurante DECLAROU.
 *
 * O caso real, na loja de vitrine `foocci-bakery`: *"tem alguma coisa sem
 * glúten?"* numa PADARIA devolvia 12 cards, **10 deles de trigo** — Coxinha,
 * Empada, Esfiha, Quiche, Croque-Monsieur e o **Pão Francês** — com a frase
 * *"separei opções que parecem mais simples, mas confira os ingredientes antes de
 * adicionar"*, que devolve a conferência para quem tem a alergia.
 *
 * O dado existia: `alergenosDetalhados` estava preenchido em 40/40 itens e chega
 * ao Garçom pela rota. `selectRestrictionCandidates` lia só nome + descrição +
 * categoria, e para alergia a lista de exclusão era vazia.
 *
 * ── METADE E METADE ──────────────────────────────────────────────────────────
 * Metade destes testes existe para provar que o LEGÍTIMO passa: cliente sem
 * restrição continua vendo o cardápio inteiro, restaurante que não preenche
 * alérgeno não fica com o cardápio apagado nas restrições de preferência, e o
 * item comprovadamente limpo continua sendo oferecido. Detector sem essa metade
 * vira carimbo — foi exatamente o que aconteceu com o `re-02` do golden set, que
 * estava VERDE no momento em que o celíaco recebia pão de trigo.
 */

import { describe, it, expect } from "vitest";
import { decide, type V2CatalogItem } from "../WaiterBrainV2";

// ─── catálogo de padaria, com a declaração do lojista ────────────────────────

function item(p: Partial<V2CatalogItem> & { id: string; name: string }): V2CatalogItem {
  return {
    categoryName: "Padaria",
    price: 10,
    description: null,
    alergenosDetalhados: null,
    salesCount: null,
    isBestSeller: null,
    ...p,
  } as V2CatalogItem;
}

const PADARIA: V2CatalogItem[] = [
  item({ id: "pao-frances", name: "Pão Francês", price: 1.4, sortOrder: 1,
         description: "Casca que estala e miolo leve.", alergenosDetalhados: "glúten" }),
  item({ id: "coxinha", name: "Coxinha de Frango", categoryName: "Salgados", price: 10.9, sortOrder: 2,
         description: "Massa de batata cozida na hora.", alergenosDetalhados: "glúten, lactose" }),
  item({ id: "quiche", name: "Quiche Lorraine", categoryName: "Salgados", price: 18.9, sortOrder: 3,
         description: "Bacon defumado e creme de ovos.", alergenosDetalhados: "glúten, lactose, ovo" }),
  item({ id: "bolo-fuba", name: "Bolo de Fubá", categoryName: "Confeitaria", price: 10.9, sortOrder: 4,
         description: "Fubá de moinho de pedra e erva-doce.", alergenosDetalhados: "lactose, ovo" }),
  item({ id: "cafe", name: "Café Coado da Casa", categoryName: "Café & Bebidas", price: 5.9, sortOrder: 5,
         description: "Coado no pano.", alergenosDetalhados: "nenhum" }),
  item({ id: "suco", name: "Suco de Laranja Natural", categoryName: "Café & Bebidas", price: 13.9, sortOrder: 6,
         description: "Espremido na hora.", alergenosDetalhados: "nenhum" }),
  item({ id: "granola", name: "Granola Artesanal", categoryName: "Da Nossa Despensa", price: 42.9, sortOrder: 7,
         description: "Aveia em flocos e castanhas.", alergenosDetalhados: "castanhas, aveia (pode conter glúten)" }),
  // O item que o lojista NÃO declarou. Não dá para provar que conflita — e não
  // dá para provar que está limpo.
  item({ id: "misterio", name: "Torta do Chef", categoryName: "Confeitaria", price: 30, sortOrder: 8,
         description: "A criação da semana.", alergenosDetalhados: null }),
];

function responder(msg: string, catalog = PADARIA) {
  return decide({
    event: "ON_USER_MESSAGE", message: msg,
    cartItemIds: [], cartValue: 0, catalog,
  });
}

const nomes = (ids: string[], catalog = PADARIA) =>
  ids.map((id) => catalog.find((i) => i.id === id)?.name ?? id);

// ─────────────────────────────────────────────────────────────────────────────
// METADE 1 — o que NÃO pode mais acontecer
// ─────────────────────────────────────────────────────────────────────────────

describe("P0 dietético — o que o cadastro declara com o alérgeno nunca sai", () => {
  it("o caso da bakery: 'sem glúten' numa padaria não devolve pão de trigo", () => {
    const out = responder("tem alguma coisa sem glúten?");
    expect(out.cards).not.toContain("pao-frances");
    expect(out.cards).not.toContain("coxinha");
    expect(out.cards).not.toContain("quiche");
  });

  it("'pode conter glúten' também barra — dúvida declarada é dúvida", () => {
    const out = responder("tem alguma coisa sem glúten?");
    expect(out.cards).not.toContain("granola");
  });

  it("item SEM declaração de alérgeno não é oferecido a quem declarou alergia", () => {
    const out = responder("tem alguma coisa sem glúten?");
    expect(out.cards).not.toContain("misterio");
  });

  it("'sem lactose' barra o que declara lactose, e só isso", () => {
    const out = responder("tem algo sem lactose?");
    expect(out.cards).not.toContain("coxinha");
    expect(out.cards).not.toContain("quiche");
    expect(out.cards).not.toContain("bolo-fuba");
    // Pão francês tem glúten e NÃO tem lactose: continua na lista.
    expect(out.cards).toContain("pao-frances");
  });

  it("'sou celíaco' entra pelo caminho determinístico seguro, não pela IA", () => {
    const out = responder("sou celíaco, o que posso comer?");
    expect(out.requiresAI).toBe(false);
    expect(out.cards).not.toContain("pao-frances");
    expect(out.cards.length).toBeGreaterThan(0);
  });

  it("'alérgico a castanha' barra a granola e mantém o resto", () => {
    const out = responder("sou alérgico a castanha");
    expect(out.cards).not.toContain("granola");
    expect(out.cards).toContain("pao-frances");
  });

  it("alergia sem dizer a quê: nada de lista filtrada de mentira — escala", () => {
    const out = responder("sou alérgico");
    expect(out.cards).toHaveLength(0);
    expect(out.message).toMatch(/prefiro não arriscar|equipe/i);
    expect(out.options.length).toBeGreaterThan(0);
  });

  it("a frase não devolve a conferência para o alérgico como se fosse a resposta", () => {
    const out = responder("tem alguma coisa sem glúten?");
    expect(out.message).not.toMatch(/parecem mais simples/i);
    expect(out.message).toMatch(/glúten/i);
  });

  it("a frase NUNCA afirma que o item é seguro", () => {
    const out = responder("tem alguma coisa sem glúten?");
    expect(out.message).not.toMatch(/\b(garantid|pode comer|é seguro|sem risco)\b/i);
    expect(out.message).toMatch(/confirme com a equipe/i);
  });

  it("catálogo inteiro sem declaração + alergia → escala, não devolve tudo", () => {
    const semDados = PADARIA.map((i) => ({ ...i, alergenosDetalhados: null }));
    const out = responder("tem alguma coisa sem glúten?", semDados);
    expect(out.cards).toHaveLength(0);
    expect(out.message).toMatch(/não me dá como confirmar|prefiro não arriscar/i);
  });

  it("a escalada aponta para o WhatsApp da loja quando ele existe", () => {
    const semDados = PADARIA.map((i) => ({ ...i, alergenosDetalhados: null }));
    const out = decide({
      event: "ON_USER_MESSAGE", message: "tem alguma coisa sem glúten?",
      cartItemIds: [], cartValue: 0, catalog: semDados,
      storeChannels: { whatsapp: "11999998888" },
    });
    expect(out.options.some((o) => o.value.startsWith("open_whatsapp:"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 2 — o legítimo continua passando
// ─────────────────────────────────────────────────────────────────────────────

describe("P0 dietético — a metade que prova que o legítimo passa", () => {
  it("cliente SEM restrição continua vendo o cardápio, inclusive o que tem glúten", () => {
    const out = responder("o que vocês têm de bom?");
    expect(out.cards.length).toBeGreaterThanOrEqual(4);
    const comGluten = out.cards.filter((id) => ["pao-frances", "coxinha", "quiche"].includes(id));
    expect(comGluten.length).toBeGreaterThan(0);
  });

  it("item comprovadamente limpo CONTINUA sendo oferecido — o filtro não apaga tudo", () => {
    const out = responder("tem alguma coisa sem glúten?");
    expect(out.cards).toContain("cafe");
    expect(out.cards).toContain("suco");
    // Bolo de fubá é de milho: declara lactose e ovo, não glúten.
    expect(out.cards).toContain("bolo-fuba");
    expect(nomes(out.cards).length).toBeGreaterThan(0);
  });

  it("restrição de PREFERÊNCIA não exige declaração de alérgeno (guardrail 5)", () => {
    // Restaurante que não preencheu alérgeno nenhum: vegano/vegetariano não pode
    // devolver cardápio vazio, senão a proteção é mais destrutiva que o problema.
    const semDados = PADARIA.map((i) => ({ ...i, alergenosDetalhados: null }));
    const vegano = responder("sou vegano, o que posso comer?", semDados);
    expect(vegano.cards.length).toBeGreaterThan(0);
    const semPeixe = responder("sem peixe por favor", semDados);
    expect(semPeixe.cards.length).toBeGreaterThan(0);
  });

  it("vegano segue sem cravar que o item É vegano", () => {
    const out = responder("sou vegano, o que posso comer?");
    expect(out.message).toMatch(/prefiro não cravar/i);
  });

  it("pergunta comum de cardápio não é confundida com restrição", () => {
    for (const m of ["tem café?", "quero um pão francês", "qual você recomenda?"]) {
      const out = responder(m);
      expect(out.message).not.toMatch(/deixei de fora|prefiro não arriscar/i);
    }
  });

  it("'sem glúten' não vira negação de que a casa oferece algo", () => {
    const out = responder("tem alguma coisa sem glúten?");
    expect(out.message).not.toMatch(/não temos|não oferecemos/i);
  });

  it("todo card devolvido existe no catálogo — nada inventado", () => {
    const ids = new Set(PADARIA.map((i) => i.id));
    for (const m of ["tem alguma coisa sem glúten?", "tem algo sem lactose?", "sou vegano"]) {
      for (const c of responder(m).cards) expect(ids.has(c)).toBe(true);
    }
  });
});
