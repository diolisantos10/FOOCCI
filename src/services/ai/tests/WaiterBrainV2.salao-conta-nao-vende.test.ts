/**
 * O irmão do caso da Júlia: agora a informação EXISTE.
 *
 * `WaiterBrainV2.negacao-de-oferta.test.ts` trava o piso — quando ninguém sabe,
 * o Garçom diz "preciso confirmar" e escala. Este arquivo trava o teto, decidido
 * pelo CEO em 05/08/2026 depois de ler aquele conserto:
 *
 *   "O rodízio não deve aparecer no cardápio delivery, mas tem que ter a mesma
 *    informação que o agente de WhatsApp tem. Então: existe o rodízio, e passar
 *    o preço, como funciona e tudo mais — mas é só pessoalmente."
 *
 * Mandar o cliente falar com um humano uma pergunta que o sistema responde é
 * atendimento pior, não melhor. O `RODIZIO PRESENCIAL` do Sushi Cazza está no
 * cadastro, ativo, a R$ 99,00, com `showInDineIn=true` e `showInDelivery=false`.
 *
 * A REGRA GERAL, que não fala de rodízio nenhum:
 *   **item que o restaurante vende só no salão existe para ser CONTADO, nunca
 *   para ser VENDIDO no delivery.** Vale para couvert, buffet, self-service,
 *   chopp na torneira. O critério é o cadastro, nunca o nome do prato.
 *
 * O risco NOVO que esta mudança cria é o carrinho: o Garçom passou a falar de um
 * produto que ele não pode vender neste canal. As três travas, em camadas:
 *   1. item de salão nunca entra no `catalog` → nunca vira card;
 *   2. `validateWaiterResponse` derruba qualquer id fora do catálogo;
 *   3. `/finalize` e `AITools.add_item` exigem `showInDelivery: true`
 *      (provado em `src/app/api/pedido/[slug]/finalize/route.test.ts`).
 */

import { describe, it, expect } from "vitest";

import { decide, validateWaiterResponse, type V2CatalogItem, type WaiterKnowledgeItem } from "../WaiterBrainV2";
import { sanitizeUnprovenDenial, type DineInOnlyItem } from "../waiter/offeringClaims";

/** O cardápio de ENTREGA do Sushi Cazza — sem o rodízio, como em produção. */
const CAZZA_DELIVERY: V2CatalogItem[] = [
  { id: "fest", name: "FESTIVAL CAZZA (DELIVERY)", categoryName: "FESTIVAL CAZZA (DELIVERY)", price: 199, sortOrder: 1 },
  { id: "c40",  name: "Combinado 40 peças",        categoryName: "COMBOS",         price: 129, sortOrder: 2 },
  { id: "yak",  name: "Yakisoba de Frango",        categoryName: "PRATOS QUENTES", price: 45,  sortOrder: 3 },
  { id: "tk1",  name: "Temaki Salmão",             categoryName: "TEMAKIS",        price: 32,  sortOrder: 4 },
  { id: "ban",  name: "Banana Empanada",           categoryName: "SOBREMESAS",     price: 18,  sortOrder: 5 },
];

/** O item real do cadastro: showInDineIn=true, showInDelivery=false. */
const RODIZIO: DineInOnlyItem = {
  id:           "rodizio-presencial",
  name:         "RODIZIO PRESENCIAL",
  categoryName: "RODIZIO PRESENCIAL",
  price:        99,
  description:  "RODIZIO : 99,00 POR PESSOA CRIANÇAS: ATÉ 5 ANOS NÃO PAGAM 6 Á 10 ANOS 49,90",
};

/** O Q&A que o lojista escreveu — a única fonte legítima de "como funciona". */
const QA_RODIZIO: WaiterKnowledgeItem = {
  title:            "Tem rodízio?",
  category:         "RODIZIO_INFO",
  questionPatterns: ["rodizio", "rodízio", "vocês tem rodízio"],
  answer:           "O rodízio é todos os dias das 18h às 23h, no salão, com mais de 40 itens.",
};

const responder = (
  mensagem: string,
  extra: {
    salao?:      readonly DineInOnlyItem[];
    conhecimento?: readonly WaiterKnowledgeItem[];
    whatsapp?:   string;
  } = {},
) =>
  decide({
    event:       "ON_USER_MESSAGE",
    cartItemIds: [],
    cartValue:   0,
    catalog:     CAZZA_DELIVERY,
    message:     mensagem,
    dineInOnlyItems: extra.salao        ?? [RODIZIO],
    knowledgeItems:  extra.conhecimento ?? [],
    ...(extra.whatsapp ? { storeChannels: { whatsapp: extra.whatsapp } } : {}),
  });

const NEGACAO = /n[ãa]o\s+(temos|tem|encontrei|achei|h[áa]|fazemos|oferecemos|trabalhamos|servimos)/i;

// ─────────────────────────────────────────────────────────────────────────────
// 1. As três coisas obrigatórias da resposta
// ─────────────────────────────────────────────────────────────────────────────

describe("a pergunta da Júlia, com o cadastro na mão", () => {
  for (const mensagem of ["Vocês tem rodízios", "Vcs tem rodízio"] as const) {
    it(`"${mensagem}" → confirma que existe, diz o preço, diz que é presencial`, () => {
      const out = responder(mensagem);
      expect(out.message).toMatch(/temos sim/i);          // 1. existe
      expect(out.message).toContain("R$ 99,00");           // 2. preço
      expect(out.message).toMatch(/s[óo] no sal[ãa]o/i);   // 3. presencial
      expect(out.message).toMatch(/n[ãa]o vai para entrega/i);
      expect(out.message).not.toMatch(NEGACAO);
      expect(out.message.toLowerCase()).not.toContain("preciso confirmar");
    });
  }

  it("nunca oferece adicionar ao carrinho — nem card, nem promessa", () => {
    const out = responder("Vcs tem rodízio");
    expect(out.cards).toEqual([]);
    expect(out.message.toLowerCase()).not.toMatch(/adicion|carrinho|quer que eu (coloque|ponha)/);
    expect(out.options.some((o) => o.value.startsWith("add_"))).toBe(false);
  });

  it("o preço sai do CADASTRO — muda no painel, muda a fala", () => {
    const out = responder("tem rodizio?", { salao: [{ ...RODIZIO, price: 129.9 }] });
    expect(out.message).toContain("R$ 129,90");
    expect(out.message).not.toContain("R$ 99,00");
  });

  it("'como funciona' é do lojista, nunca nosso: sai do Q&A cadastrado", () => {
    const out = responder("Vcs tem rodízio", { conhecimento: [QA_RODIZIO] });
    expect(out.message).toContain("R$ 99,00");
    expect(out.message).toContain("mais de 40 itens");
  });

  it("sem Q&A cadastrado, não inventa o 'como funciona' — oferece a equipe", () => {
    const out = responder("Vcs tem rodízio", { whatsapp: "(11) 99999-8888" });
    expect(out.message).toMatch(/equipe/i);
    // Nada de horário, regra de criança ou lista de itens que ninguém cadastrou.
    expect(out.message).not.toMatch(/\d{1,2}h|crian[çc]a|à vontade/i);
    expect(out.options.map((o) => o.value)).toContain("open_whatsapp:11999998888");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. O risco novo: o cliente tentando PEDIR o que é só do salão
// ─────────────────────────────────────────────────────────────────────────────

describe("o cliente insiste em pedir — e o agente não cria pedido nenhum", () => {
  for (const mensagem of ["quero 2 rodízios", "quero um rodízio pra entrega", "manda 1 rodizio"] as const) {
    it(`"${mensagem}" → repete que é presencial, sem card e sem carrinho`, () => {
      const out = responder(mensagem);
      expect(out.cards).toEqual([]);
      expect(out.message).toMatch(/s[óo] no sal[ãa]o/i);
      expect(out.message.toLowerCase()).not.toMatch(/adicionei|adicionado|coloquei|no seu pedido/);
    });
  }

  it("'adiciona aí' logo depois não inventa item nenhum", () => {
    const out = responder("adiciona aí");
    expect(out.cards).toEqual([]);
    expect(out.message.toLowerCase()).not.toContain("rodizio");
    expect(out.message.toLowerCase()).not.toContain("rodízio");
  });

  it("o id do item de salão nunca sobrevive como card, venha de onde vier", () => {
    // Última linha de defesa: mesmo que um handler futuro tente devolver o id,
    // o validador o derruba porque ele não está no catálogo deste canal.
    const out = validateWaiterResponse(
      { message: "Olha só 👇", cards: ["rodizio-presencial", "tk1"], mode: "SUGGESTION", options: [], requiresAI: false, aiDirective: "" },
      CAZZA_DELIVERY,
      "ON_USER_MESSAGE",
      [RODIZIO],
    );
    expect(out.cards).toEqual(["tk1"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. A trava de saída ficou mais esperta, não mais barulhenta
// ─────────────────────────────────────────────────────────────────────────────

describe("a trava de saída troca a negação pela VERDADE quando ela existe", () => {
  it("'não temos rodízio' vira a resposta certa, não um 'preciso confirmar'", () => {
    const r = sanitizeUnprovenDenial({
      reply:      "Não temos rodízio no nosso cardápio.",
      catalog:    CAZZA_DELIVERY,
      dineInOnly: [RODIZIO],
    });
    expect(r.blocked).toBe(true);
    expect(r.reply).toMatch(/temos sim/i);
    expect(r.reply).toContain("R$ 99,00");
    expect(r.reply).toMatch(/s[óo] no sal[ãa]o/i);
    expect(r.evidence).toBe("Não temos rodízio no nosso cardápio.");
  });

  it("sem item de salão, o piso continua sendo 'preciso confirmar'", () => {
    const r = sanitizeUnprovenDenial({
      reply:      "Não temos rodízio no nosso cardápio.",
      catalog:    CAZZA_DELIVERY,
      dineInOnly: [],
    });
    expect(r.blocked).toBe(true);
    expect(r.reply).toMatch(/preciso confirmar/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. A METADE QUE PROVA QUE NADA MAIS MUDOU
// ─────────────────────────────────────────────────────────────────────────────

describe("o legítimo continua passando", () => {
  it("prato de entrega continua virando card", () => {
    for (const [msg, id] of [["tem temaki?", "tk1"], ["tem yakisoba?", "yak"], ["tem combinado?", "c40"]] as const) {
      const out = responder(msg);
      expect(out.cards, msg).toContain(id);
      expect(out.message.toLowerCase(), msg).not.toMatch(/s[óo] no sal[ãa]o/);
    }
  });

  it("restaurante SEM item de salão se comporta exatamente como antes", () => {
    const out = responder("Vcs tem rodízio", { salao: [] });
    expect(out.message).toMatch(/preciso confirmar/i);
  });

  it("pergunta de oferta que o salão não cobre continua no piso", () => {
    const out = responder("tem estacionamento?");
    expect(out.message).toMatch(/preciso confirmar/i);
    expect(out.message).not.toMatch(/R\$/);
  });

  it("a regra é do CADASTRO, não do nome 'rodízio': vale para couvert", () => {
    const couvert: DineInOnlyItem = {
      id: "couvert-1", name: "Couvert artístico", categoryName: "SALÃO", price: 15,
    };
    const out = responder("vocês cobram couvert?", { salao: [couvert] });
    expect(out.message).toMatch(/temos sim/i);
    expect(out.message).toContain("R$ 15,00");
    expect(out.message).toMatch(/s[óo] no sal[ãa]o/i);
  });

  it("item de salão que ninguém perguntou não aparece sozinho na conversa", () => {
    const out = responder("me indica algo bom");
    expect(out.message.toLowerCase()).not.toContain("salão");
    expect(out.cards.length).toBeGreaterThan(0);
  });
});
