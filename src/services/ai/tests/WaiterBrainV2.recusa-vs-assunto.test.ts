/**
 * Golden set — "não " no começo da frase não é fim de conversa.
 *
 * ─── O caso real que motivou ────────────────────────────────────────────────
 * `REFUSAL_GENERIC_RE` tinha como primeiro ramo
 * `n[ãa]o\s*,?\s*(obrigad[oa])?\.?` — com os dois grupos opcionais, sobrava
 * `^não\s`. Medido rodando `decide()` em 06/08/2026:
 *
 *   cliente: "nao consigo achar o rodizio"
 *   garçom : "Perfeito 😊 Fico por aqui se precisar de uma sugestão."
 *
 * O restaurante TEM rodízio, e o handler que responde "temos sim, R$ X, só no
 * salão" mora depois do bloco de recusa — nunca era alcançado. É o incidente do
 * rodízio com outra roupa, e `sanitizeUnprovenDenial` é cego para ele: não há
 * negação na resposta, há ausência de resposta.
 *
 * ─── As DUAS metades ────────────────────────────────────────────────────────
 * Bloco ① prova que o assunto legítimo SEGUE a conversa.
 * Bloco ② prova que a recusa legítima CONTINUA encerrando — sem esta metade, o
 * conserto viraria um Garçom que insiste com quem já disse que acabou, e isso é
 * pior que a evasiva que ele evita (guardrail 5).
 */

import { describe, it, expect } from "vitest";

import { decide, type V2Input } from "@/services/ai/WaiterBrainV2";
import { ehRecusaGenerica, recusaDeComplementoPosposta } from "@/services/ai/waiter/recusaDoCliente";
import { waiterSyntheticCatalog } from "@/services/simulation/waiter/waiterSyntheticCatalog";
import type { DineInOnlyItem } from "@/services/ai/waiter/offeringClaims";

const catalog = waiterSyntheticCatalog();

/** O item que a cliente Júlia perguntou e ouviu "não encontrei". */
const RODIZIO: DineInOnlyItem = {
  id:           "rodizio-presencial",
  name:         "RODIZIO PRESENCIAL",
  categoryName: "Rodízio",
  price:        119,
  description:  "Rodízio completo servido no salão.",
};

function turno(message: string, opts: { cart?: string[]; salao?: DineInOnlyItem[] } = {}) {
  const cart = opts.cart ?? [];
  return decide({
    event:           "ON_USER_MESSAGE",
    cartItemIds:     cart,
    cartValue:       cart.length ? 50 : 0,
    catalog,
    message,
    dineInOnlyItems: opts.salao ?? [],
    knowledgeItems:  [],
  } as unknown as V2Input);
}

/** As duas frases de despedida do bloco de recusa genérica. */
const DESPEDIDA =
  /Fico por aqui se precisar de uma sugestão|Quando quiser, é só tocar em Finalizar Pedido/;

// ═══════════════════════════════════════════════════════════════════════════
// ① O ASSUNTO SEGUE — mensagem que apenas COMEÇA com "não"
// ═══════════════════════════════════════════════════════════════════════════

describe("① mensagem que começa com 'não' mas traz assunto NÃO encerra a conversa", () => {
  const ASSUNTOS = [
    "nao consigo achar o rodizio",
    "não gosto de peixe cru, tem outra coisa?",
    "não entendi o preço do combo",
    "não faço ideia, o que pedir aqui?",
    "não quero gastar muito",
    "não sei se vocês entregam no Butantã",
    "não tem nada mais barato?",
    "não achei a bebida que eu queria",
  ];

  for (const msg of ASSUNTOS) {
    it(`"${msg}" não é classificada como recusa`, () => {
      expect(ehRecusaGenerica(msg)).toBe(false);
    });

    it(`"${msg}" não recebe a frase de despedida (carrinho vazio)`, () => {
      expect(turno(msg).message).not.toMatch(DESPEDIDA);
    });

    it(`"${msg}" não é empurrada para o caixa (carrinho cheio)`, () => {
      const out = turno(msg, { cart: ["yakisoba"] });
      expect(out.message).not.toMatch(DESPEDIDA);
      expect(out.mode).not.toBe("CHECKOUT_SUPPORT");
    });
  }
});

describe("① o caso que custou a cliente: 'nao consigo achar o rodizio' volta a ser respondido", () => {
  it("alcança o handler de item de salão e conta a verdade do cadastro", () => {
    const out = turno("nao consigo achar o rodizio", { salao: [RODIZIO] });
    expect(out.message).toContain("RODIZIO PRESENCIAL");
    expect(out.message).toContain("119");
    expect(out.message).toMatch(/s[óo] no sal[ãa]o/i);
  });

  it("continua sem virar card — item de salão nunca entra no carrinho", () => {
    const out = turno("nao consigo achar o rodizio", { salao: [RODIZIO] });
    expect(out.cards).toEqual([]);
  });

  it("com carrinho cheio também responde, em vez de mandar finalizar", () => {
    const out = turno("nao consigo achar o rodizio", { cart: ["yakisoba"], salao: [RODIZIO] });
    expect(out.message).toContain("RODIZIO PRESENCIAL");
    expect(out.mode).not.toBe("CHECKOUT_SUPPORT");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ② A RECUSA LEGÍTIMA CONTINUA ENCERRANDO
//    Sem este bloco o conserto vira um Garçom que insiste com quem já acabou.
// ═══════════════════════════════════════════════════════════════════════════

describe("② recusa legítima continua sendo reconhecida", () => {
  const RECUSAS = [
    "não",
    "não.",
    "Não!",
    "não, obrigado",
    "não obrigado",
    "nao, obrigada",
    "não, obrigado 😊",
    "não quero mais nada",
    "não quero nada",
    "não quero mais",
    "não precisa",
    "não vou querer mais nada",
    "só isso",
    "só isso mesmo",
    "é só isso",
    "só isso mesmo, valeu",
    "tá bom assim",
    "tá certo assim",
    "pode fechar",
    "pode fechar o pedido",
    "chega",
    "já chega",
    "nada mais",
    "tudo certo",
    "por enquanto é só",
  ];

  for (const msg of RECUSAS) {
    it(`"${msg}" é recusa`, () => {
      expect(ehRecusaGenerica(msg)).toBe(true);
    });
  }

  it("com carrinho cheio, orienta a finalizar", () => {
    const out = turno("não, obrigado", { cart: ["yakisoba"] });
    expect(out.mode).toBe("CHECKOUT_SUPPORT");
    expect(out.message).toMatch(/Finalizar Pedido/);
  });

  it("com carrinho vazio, se despede sem empurrar produto", () => {
    const out = turno("não, obrigado");
    expect(out.message).toMatch(/Fico por aqui/);
    expect(out.cards).toEqual([]);
  });

  it("recusa NUNCA vira sugestão de produto", () => {
    for (const msg of ["não, obrigado", "só isso mesmo", "já chega", "nada mais"]) {
      expect(turno(msg).cards).toEqual([]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ A recusa de complemento posposta — o que o ramo frouxo cobria por acidente
// ═══════════════════════════════════════════════════════════════════════════

describe("③ 'bebida não' / 'sobremesa não' continuam sendo recusa de complemento", () => {
  it("'não, bebida não' é recusa de bebida", () => {
    expect(recusaDeComplementoPosposta("não, bebida não")).toBe("BEBIDA");
  });

  it("'sobremesa não' é recusa de sobremesa", () => {
    expect(recusaDeComplementoPosposta("sobremesa não")).toBe("SOBREMESA");
  });

  it("'não, bebida não' registra a recusa na memória e não oferece nada", () => {
    const out = turno("não, bebida não", { cart: ["yakisoba"] });
    expect(out.memoryPatch?.declinedSuggestionTypes).toContain("drink_upsell");
    expect(out.cards).toEqual([]);
  });

  it("'bebida não alcoólica' NÃO é recusa — o 'não' tem continuação", () => {
    expect(recusaDeComplementoPosposta("quero uma bebida não alcoólica")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ A régua em si: o que a lista fechada aceita e o que ela recusa
// ═══════════════════════════════════════════════════════════════════════════

describe("④ a régua exige a mensagem INTEIRA, não um prefixo", () => {
  it("mensagem vazia não é recusa", () => {
    expect(ehRecusaGenerica("")).toBe(false);
    expect(ehRecusaGenerica("   ")).toBe(false);
  });

  it("recusa + cortesia continua recusa; recusa + assunto não", () => {
    expect(ehRecusaGenerica("não, obrigado")).toBe(true);
    expect(ehRecusaGenerica("não, obrigado. e a taxa de entrega?")).toBe(false);
  });

  it("'não quero gastar muito' e 'não quero mais nada' são coisas diferentes", () => {
    expect(ehRecusaGenerica("não quero gastar muito")).toBe(false);
    expect(ehRecusaGenerica("não quero mais nada")).toBe(true);
  });

  it("'tá bom' sozinho NÃO é recusa — pode ser um 'sim' a uma sugestão", () => {
    expect(ehRecusaGenerica("tá bom")).toBe(false);
    expect(ehRecusaGenerica("tá bom assim")).toBe(true);
  });
});
