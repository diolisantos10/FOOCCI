/**
 * "Não encontrei rodízios no nosso cardápio. Posso ajudar com outra coisa? 😊"
 *
 * Foi essa frase, saída do Garçom de verdade, que originou este arquivo.
 * 05/08/2026, 14:57 e 14:58, cardápio do Sushi Cazza. A cliente Júlia perguntou
 * duas vezes — "Vocês tem rodízios" e, um minuto depois, "Vcs tem rodízio" —
 * recebeu a mesma negação as duas vezes e foi embora.
 *
 * O Sushi Cazza TEM rodízio: `RODIZIO PRESENCIAL`, R$ 99/pessoa, item ativo e
 * disponível no cadastro, com `showInDelivery = false`. O catálogo que chega ao
 * Garçom é filtrado por `showInDelivery: true`
 * (`src/app/api/pedido/[slug]/route.ts`), então o item nunca entrou na busca —
 * e "não achei no meu recorte" saiu como "não temos" na cara da cliente.
 *
 * ─── POR QUE O CASO RODÍZIO QUE JÁ EXISTIA NÃO PEGOU ISTO ────────────────────
 * Existia caso de rodízio no repositório desde a Fase 0 do Brain, e ele estava
 * verde enquanto a produção errava. Dois pontos cegos, os dois valem para
 * qualquer teste que nascer daqui pra frente:
 *
 *   1. **Era outro agente.** `src/services/brain/Brain.test.ts` e
 *      `BrainReasoner.test.ts` cobrem o caminho do WhatsApp/Brain, que lê o Q&A
 *      curado (`RestaurantKnowledgeItem`, categoria `RODIZIO_INFO`). O Garçom do
 *      cardápio é `WaiterBrainV2` + `AIOrderService`, e ele **não lê
 *      RestaurantKnowledgeItem em lugar nenhum**. Mesmo nome de assunto, código
 *      diferente, nenhuma cobertura cruzada.
 *
 *   2. **Testava a verdade PRESENTE, não a verdade AUSENTE.** O caso antigo
 *      afirma que, quando o Q&A do rodízio existe, ele chega ao snapshot. O que
 *      mata o cliente é o contrário: quando não há fato nenhum, o agente não
 *      pode inventar a negação. Teste de "achou → responde certo" nunca cobre
 *      "não achou → cala a boca".
 *
 * Por isso este arquivo mora ao lado do Garçom do cardápio, usa as DUAS formas
 * exatas que a Júlia digitou, e metade dele existe para provar que o legítimo
 * continua passando — detector sem essa metade vira carimbo.
 */

import { describe, it, expect } from "vitest";

import { decide, type V2CatalogItem } from "../WaiterBrainV2";
import { sanitizeUnprovenDenial } from "../waiter/offeringClaims";

/**
 * O cardápio do Sushi Cazza como o Garçom o enxerga: itens reais do canal de
 * delivery. O `RODIZIO PRESENCIAL` NÃO está aqui — é exatamente esse o ponto.
 */
const CAZZA_DELIVERY: V2CatalogItem[] = [
  { id: "fest", name: "FESTIVAL CAZZA (DELIVERY)", categoryName: "FESTIVAL CAZZA (DELIVERY)", price: 199, sortOrder: 1 },
  { id: "sun",  name: "Sunomono",                  categoryName: "ENTRADAS",       price: 24,  sortOrder: 2 },
  { id: "gui",  name: "Guioza",                    categoryName: "ENTRADAS",       price: 28,  sortOrder: 3 },
  { id: "c40",  name: "Combinado 40 peças",        categoryName: "COMBOS",         price: 129, sortOrder: 4 },
  { id: "yak",  name: "Yakisoba de Frango",        categoryName: "PRATOS QUENTES", price: 45,  sortOrder: 5 },
  { id: "tk1",  name: "Temaki Salmão",             categoryName: "TEMAKIS",        price: 32,  sortOrder: 6 },
  { id: "tk2",  name: "Temaki Skin",               categoryName: "TEMAKIS",        price: 30,  sortOrder: 7 },
  { id: "hot",  name: "Hot Roll Salmão",           categoryName: "HOT ROLL",       price: 34,  sortOrder: 8 },
  { id: "ban",  name: "Banana Empanada",           categoryName: "SOBREMESAS",     price: 18,  sortOrder: 9 },
  { id: "cc",   name: "Coca-Cola 350ml",           categoryName: "BEBIDAS",        price: 7,   sortOrder: 10 },
];

/** O mesmo restaurante, num mundo em que o rodízio É vendido pelo delivery. */
const COM_RODIZIO: V2CatalogItem[] = [
  ...CAZZA_DELIVERY,
  { id: "rod", name: "Rodízio Cazza", categoryName: "RODÍZIO", price: 99, sortOrder: 0,
    description: "Rodízio completo, à vontade, por pessoa." },
];

const responder = (mensagem: string, catalogo = CAZZA_DELIVERY, whatsapp?: string) =>
  decide({
    event:       "ON_USER_MESSAGE",
    cartItemIds: [],
    cartValue:   0,
    catalog:     catalogo,
    message:     mensagem,
    ...(whatsapp ? { storeChannels: { whatsapp } } : {}),
  });

/** Qualquer forma de negar. É o que a cliente leu como "não temos". */
const NEGACAO = /n[ãa]o\s+(temos|tem|encontrei|achei|h[áa]|fazemos|oferecemos|trabalhamos|servimos|entregamos|aceitamos)/i;

// ─────────────────────────────────────────────────────────────────────────────
// 1. O caso da Júlia — as duas mensagens, com o texto exato que ela digitou
// ─────────────────────────────────────────────────────────────────────────────

describe("P0 Sushi Cazza 05/08 — a pergunta da Júlia sobre rodízio", () => {
  for (const mensagem of ["Vocês tem rodízios", "Vcs tem rodízio"] as const) {
    it(`REGRESSÃO: "${mensagem}" não vira negação`, () => {
      const out = responder(mensagem);
      expect(out.message, `negou de novo: "${out.message}"`).not.toMatch(NEGACAO);
      expect(out.message.toLowerCase()).toContain("rodízio");
      expect(out.message.toLowerCase()).toMatch(/confirmar/);
    });
  }

  it("REGRESSÃO: a insistência da cliente não muda a resposta para uma negação", () => {
    // Ela perguntou de novo um minuto depois. Nas duas vezes a resposta tem que
    // ser honesta — nunca "já respondi que não temos".
    for (const m of ["Vocês tem rodízios", "Vcs tem rodízio", "tem rodizio?", "vocês fazem rodízio?"]) {
      expect(responder(m).message, m).not.toMatch(NEGACAO);
    }
  });

  it("escala: com WhatsApp da loja, oferece falar com a equipe", () => {
    const out = responder("Vcs tem rodízio", CAZZA_DELIVERY, "(11) 99999-8888");
    expect(out.options.map((o) => o.value)).toContain("open_whatsapp:11999998888");
  });

  it("sem WhatsApp cadastrado, ainda assim não nega — só não promete o canal que não existe", () => {
    const out = responder("Vcs tem rodízio");
    expect(out.message).not.toMatch(NEGACAO);
    expect(out.options.some((o) => o.value.startsWith("open_whatsapp"))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A trava de saída — a que vale mesmo (guardrail 4: código, não prompt)
// ─────────────────────────────────────────────────────────────────────────────

describe("a negação sem prova é barrada na saída, venha de onde vier", () => {
  it("barra a frase EXATA que a Júlia recebeu", () => {
    const r = sanitizeUnprovenDenial({
      reply:   "Não encontrei rodízios no nosso cardápio. Posso ajudar com outra coisa? 😊",
      catalog: CAZZA_DELIVERY,
    });
    expect(r.blocked).toBe(true);
    expect(r.term?.id).toBe("rodizio");
    expect(r.reply).not.toMatch(NEGACAO);
    // O alerta carrega a própria evidência (guardrail 6).
    expect(r.evidence).toContain("Não encontrei rodízios");
  });

  it("barra também a forma dura — 'não temos rodízio'", () => {
    const r = sanitizeUnprovenDenial({ reply: "Não temos rodízio, infelizmente.", catalog: CAZZA_DELIVERY });
    expect(r.blocked).toBe(true);
    expect(r.reply).not.toMatch(NEGACAO);
  });

  it("é cirúrgica: troca só a frase ofensora e preserva o resto", () => {
    const r = sanitizeUnprovenDenial({
      reply:   "Não temos rodízio. Mas o Combinado 40 peças é o queridinho da casa 👇",
      catalog: CAZZA_DELIVERY,
    });
    expect(r.blocked).toBe(true);
    expect(r.reply).toContain("Combinado 40 peças");
  });

  it("cobre o resto do padrão: bairro, pagamento, reserva, estacionamento", () => {
    const casos: Array<[string, string]> = [
      ["Não entregamos no seu bairro.",              "entrega_regiao"],
      ["Não aceitamos vale refeição.",               "pagamento"],
      ["Não fazemos reserva de mesa.",               "reserva"],
      ["Infelizmente não temos estacionamento.",     "estacionamento"],
      ["Não temos cardápio infantil.",               "cardapio_infantil"],
    ];
    for (const [frase, id] of casos) {
      const r = sanitizeUnprovenDenial({ reply: frase, catalog: CAZZA_DELIVERY });
      expect(r.blocked, frase).toBe(true);
      expect(r.term?.id, frase).toBe(id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. A METADE QUE PROVA QUE O LEGÍTIMO PASSA
//    Sem ela isto vira carimbo: um Garçom que responde "preciso confirmar" para
//    tudo é pior que o defeito que a trava evita (guardrail 5).
// ─────────────────────────────────────────────────────────────────────────────

describe("o legítimo continua passando", () => {
  it("prato que existe continua virando card, sem 'preciso confirmar'", () => {
    for (const [msg, id] of [
      ["tem temaki?",     "tk1"],
      ["tem yakisoba?",   "yak"],
      ["tem combinado?",  "c40"],
      ["quero sobremesa", "ban"],
    ] as const) {
      const out = responder(msg);
      expect(out.cards, msg).toContain(id);
      expect(out.message.toLowerCase(), msg).not.toContain("preciso confirmar");
    }
  });

  it("prato genuinamente ausente continua sendo respondido como ausente", () => {
    // "Não encontrei pizza" é fato sobre o cardápio e continua permitido — a
    // trava é sobre MODALIDADE do restaurante, não sobre item de menu.
    const out = responder("vocês têm pizza?");
    expect(out.message).toMatch(/n[ãa]o encontrei/i);
    expect(out.message.toLowerCase()).not.toContain("preciso confirmar");
  });

  it("restaurante que TEM rodízio no cardápio fala dele normalmente", () => {
    const out = responder("Vcs tem rodízio", COM_RODIZIO);
    expect(out.cards).toContain("rod");
    expect(out.message.toLowerCase()).not.toContain("preciso confirmar");
  });

  it("quando o catálogo prova a oferta, a trava de saída não interfere", () => {
    const r = sanitizeUnprovenDenial({
      reply:   "Não temos rodízio disponível agora, o próximo é sábado.",
      catalog: COM_RODIZIO,
    });
    expect(r.blocked).toBe(false);
    expect(r.reply).toBe("Não temos rodízio disponível agora, o próximo é sábado.");
  });

  it("a trava não toca negação sobre PRATO", () => {
    for (const frase of [
      "Não encontrei pizza no nosso cardápio. Posso ajudar com outra coisa? 😊",
      "Não temos lasanha hoje.",
      "Não encontrei opções nessa linha agora. Prefere ver outra categoria?",
    ]) {
      expect(sanitizeUnprovenDenial({ reply: frase, catalog: CAZZA_DELIVERY }).blocked, frase).toBe(false);
    }
  });

  it("a trava não toca resposta que não nega nada", () => {
    for (const frase of [
      "Separei boas opções pra você 👇",
      "Temos rodízio sim! É presencial, R$ 99 por pessoa.",
      "Pra alergia eu prefiro não arriscar: confira os ingredientes antes de adicionar 👇",
    ]) {
      const r = sanitizeUnprovenDenial({ reply: frase, catalog: CAZZA_DELIVERY });
      expect(r.blocked, frase).toBe(false);
      expect(r.reply, frase).toBe(frase);
    }
  });

  it("pergunta que mistura oferta e prato real não perde os cards do prato", () => {
    // "vocês fazem entrega de temaki?" — a trava não pode sequestrar a resposta
    // boa. Cards de temaki aparecem; nenhuma negação sai.
    const out = responder("vocês fazem entrega de temaki?");
    expect(out.cards.length).toBeGreaterThan(0);
    expect(out.message).not.toMatch(NEGACAO);
  });

  it("restrição alimentar continua com o dono dela — a trava não duplica a regra", () => {
    // `classifyDietarySafety` já responde "prefiro não cravar" e é mais rígida.
    // Se isto quebrar, é sinal de que passaram a existir dois donos da regra.
    const out = responder("tem opção vegetariana?");
    expect(out.message.toLowerCase()).toMatch(/confirmar|cravar|conferir/);
    expect(out.cards.length).toBeGreaterThan(0);
  });
});
