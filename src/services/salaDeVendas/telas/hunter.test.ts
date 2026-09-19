/**
 * AS REGRAS DE HONESTIDADE DO HUNTER (peça 14).
 *
 * A pergunta destes testes não é "a conta fecha?" — é **"quando ninguém apurou,
 * o que sai?"**.
 *
 * Esta é a tela mais exposta ao defeito que esta casa mais teme, e por um
 * motivo concreto: a descoberta automática depende de uma fonte paga que a
 * empresa ainda não contratou, então a base está quase vazia. Uma tela quase
 * vazia é exatamente onde a tentação de "preencher para não ficar feio" é
 * maior — e onde um `false` no lugar de um `null` apaga uma fila de trabalho
 * inteira sem quebrar nada.
 *
 * Os dois helpers abaixo são os que decidem isso, e por isso são públicos.
 */

import { describe, it, expect } from "vitest";
import { ICP_ALTO, ifoodDe, tarefaQueFalta } from "./hunter";

describe("iFood: lista vazia não é “não está no iFood”", () => {
  it("⛔ sem carimbo de apuração, é NULL — nunca false", () => {
    // Este é o caso que o desenho não tem e a nossa base tem aos milhares.
    expect(ifoodDe([], null)).toBeNull();
    // E nem a presença de marketplaces salva: sem carimbo, ninguém apurou.
    expect(ifoodDe(["ifood"], null)).toBeNull();
  });

  it("com carimbo e lista vazia, é false — apurado e não tem", () => {
    expect(ifoodDe([], new Date("2026-09-19T12:00:00Z"))).toBe(false);
  });

  it("com carimbo e iFood na lista, é true", () => {
    expect(ifoodDe(["iFood", "Rappi"], new Date("2026-09-19T12:00:00Z"))).toBe(true);
    // O casamento é por texto e ignora caixa: a planilha escreve de tudo.
    expect(ifoodDe(["IFOOD"], new Date("2026-09-19T12:00:00Z"))).toBe(true);
  });

  it("outro marketplace não vira iFood", () => {
    expect(ifoodDe(["Rappi", "99Food"], new Date("2026-09-19T12:00:00Z"))).toBe(false);
  });
});

describe("a tarefa de enriquecimento é a PRIMEIRA lacuna, não a lista delas", () => {
  const cheia = {
    scoreIcp: 70,
    apuradoMarketplaceEm: new Date("2026-09-19T12:00:00Z"),
    numeroDeUnidades: 3,
    deliveryProprio: true,
    telefone: "1130000000",
    whatsappPublicado: null,
    _temDecisor: true,
  };

  it("sem decisor, a tarefa é buscar o decisor — o mais caro primeiro", () => {
    expect(tarefaQueFalta({ ...cheia, _temDecisor: false })).toBe("Buscar decisor");
  });

  it("com decisor e sem nenhum contato geral, é confirmar o contato", () => {
    expect(
      tarefaQueFalta({ ...cheia, telefone: null, whatsappPublicado: null }),
    ).toBe("Confirmar contato geral");
  });

  it("o WhatsApp publicado conta como contato geral", () => {
    expect(
      tarefaQueFalta({ ...cheia, telefone: null, whatsappPublicado: "5511990000000" }),
    ).not.toBe("Confirmar contato geral");
  });

  it("a ordem é a do trabalho: marketplace antes de delivery, delivery antes de unidades", () => {
    expect(tarefaQueFalta({ ...cheia, apuradoMarketplaceEm: null, deliveryProprio: null })).toBe(
      "Verificar presença em marketplace",
    );
    expect(tarefaQueFalta({ ...cheia, deliveryProprio: null, numeroDeUnidades: null })).toBe(
      "Apurar delivery próprio",
    );
    expect(tarefaQueFalta({ ...cheia, numeroDeUnidades: null, scoreIcp: null })).toBe(
      "Validar número de unidades",
    );
    expect(tarefaQueFalta({ ...cheia, scoreIcp: null })).toBe("Medir o ICP");
  });

  it("⛔ ICP zero é medido e NÃO vira “medir o ICP”", () => {
    // Zero é uma nota: a empresa foi avaliada e não qualifica. Mandar medir de
    // novo faria a fila reprocessar para sempre quem já tem resposta.
    expect(tarefaQueFalta({ ...cheia, scoreIcp: 0 })).toBe("Revisar a ficha");
  });

  it("⛔ delivery próprio FALSE é apurado, e não vira tarefa", () => {
    expect(tarefaQueFalta({ ...cheia, deliveryProprio: false })).toBe("Revisar a ficha");
  });

  it("ficha completa não inventa pendência", () => {
    expect(tarefaQueFalta(cheia)).toBe("Revisar a ficha");
  });
});

describe("a régua do ICP alto é uma só", () => {
  it("existe como constante, e não digitada em cada tela", () => {
    expect(ICP_ALTO).toBe(80);
  });
});
