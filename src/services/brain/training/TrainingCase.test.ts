/**
 * As duas metades de cada trava do julgamento de treino:
 * a que prova que o caso ruim é BARRADO e a que prova que o legítimo PASSA.
 *
 * A segunda metade é a que importa mais aqui: um detector frouxo transforma a
 * esteira em carimbo de reprovação, a taxa despenca por defeito do instrumento e
 * o agente é condenado no lugar do medidor.
 */

import { describe, it, expect } from "vitest";
import { julgarCasoDeTreino, type TrainingExpectation } from "./TrainingCase";

const compor = (proibido: TrainingExpectation["proibido"] = []): TrainingExpectation => ({
  espera: "COMPOR",
  proibido,
});

function saida(message: string | null, over: Partial<{ brainVerdict: "PASS" | "FAIL" | "NEEDS_REVIEW"; escalated: boolean }> = {}) {
  return {
    message,
    brainVerdict: over.brainVerdict ?? ("PASS" as const),
    reasoningMode: "LLM",
    escalated: over.escalated ?? false,
  };
}

describe("julgarCasoDeTreino — PEDIDO_ANTERIOR (perfil sem nenhum pedido)", () => {
  it("BARRA: 'seu último pedido' para quem nunca pediu", () => {
    const r = julgarCasoDeTreino(compor(["PEDIDO_ANTERIOR"]), saida("Oi! Que tal repetir seu último pedido?"));
    expect(r.verdict).toBe("FAIL");
    expect(r.reasons[0]).toContain("PEDIDO_ANTERIOR");
  });

  it("BARRA: 'sentimos sua falta' e 'volte a pedir' (acentuação não engole o detector)", () => {
    expect(julgarCasoDeTreino(compor(["PEDIDO_ANTERIOR"]), saida("Sentimos sua falta por aqui!")).verdict).toBe("FAIL");
    expect(julgarCasoDeTreino(compor(["PEDIDO_ANTERIOR"]), saida("Volte a pedir com a gente 😊")).verdict).toBe("FAIL");
  });

  it("DEIXA PASSAR: convite ao PRIMEIRO pedido, que é a mensagem certa nesse perfil", () => {
    const r = julgarCasoDeTreino(
      compor(["PEDIDO_ANTERIOR"]),
      saida("Oi! Você se cadastrou e ainda não experimentou a gente — que tal seu primeiro pedido hoje?"),
    );
    expect(r.verdict).toBe("PASS");
    expect(r.reasons).toEqual([]);
  });
});

describe("julgarCasoDeTreino — AUSENCIA_LONGA (cliente pediu ontem)", () => {
  it("BARRA: 'faz tempo que você sumiu' para quem pediu ontem", () => {
    expect(julgarCasoDeTreino(compor(["AUSENCIA_LONGA"]), saida("Faz tempo que você não aparece!")).verdict).toBe("FAIL");
    expect(julgarCasoDeTreino(compor(["AUSENCIA_LONGA"]), saida("Você sumiu, hein?")).verdict).toBe("FAIL");
    expect(julgarCasoDeTreino(compor(["AUSENCIA_LONGA"]), saida("Há 30 dias não vemos você")).verdict).toBe("FAIL");
  });

  it("DEIXA PASSAR: falar do pedido de ontem, que é o fato verdadeiro", () => {
    const r = julgarCasoDeTreino(compor(["AUSENCIA_LONGA"]), saida("Seu pedido de ontem chegou certinho? Qualquer coisa é só chamar."));
    expect(r.verdict).toBe("PASS");
  });
});

describe("julgarCasoDeTreino — DESCONTO (campanha sem cupom)", () => {
  it("BARRA: desconto, cupom, promoção e percentual prometidos do nada", () => {
    expect(julgarCasoDeTreino(compor(["DESCONTO"]), saida("Use o cupom VOLTA10")).verdict).toBe("FAIL");
    expect(julgarCasoDeTreino(compor(["DESCONTO"]), saida("Temos 20% off pra você hoje")).verdict).toBe("FAIL");
    expect(julgarCasoDeTreino(compor(["DESCONTO"]), saida("Tem uma promoção esperando por você")).verdict).toBe("FAIL");
  });

  it("DEIXA PASSAR: '100% artesanal' e 'entrega grátis' — não são abatimento prometido", () => {
    // Os dois casos que quase viraram falso positivo. "grátis" sozinho ficou de
    // fora do detector porque frete grátis pode ser política REAL da casa.
    expect(julgarCasoDeTreino(compor(["DESCONTO"]), saida("Nossa massa é 100% artesanal — vem provar!")).verdict).toBe("PASS");
    expect(julgarCasoDeTreino(compor(["DESCONTO"]), saida("Lembrando que a entrega é grátis na sua região.")).verdict).toBe("PASS");
  });

  it("DEIXA PASSAR: com cupom real na campanha a proibição nem é aplicada", () => {
    const r = julgarCasoDeTreino(compor([]), saida("Use o cupom VOLTA10, ele é seu."));
    expect(r.verdict).toBe("PASS");
  });
});

describe("julgarCasoDeTreino — VALOR_ZERO (dado de valor zerado)", () => {
  it("BARRA: estampar R$ 0 como se fosse fato", () => {
    expect(julgarCasoDeTreino(compor(["VALOR_ZERO"]), saida("Seu ticket médio é R$ 0,00 — bora mudar isso?")).verdict).toBe("FAIL");
  });

  it("DEIXA PASSAR: preço real de produto com zero no meio (R$ 40,00 / R$ 105)", () => {
    expect(julgarCasoDeTreino(compor(["VALOR_ZERO"]), saida("A pizza grande sai por R$ 40,00.")).verdict).toBe("PASS");
    expect(julgarCasoDeTreino(compor(["VALOR_ZERO"]), saida("O combo sai por R$ 105.")).verdict).toBe("PASS");
  });
});

describe("julgarCasoDeTreino — literal proibido (nome de cadastro quebrado)", () => {
  const exp: TrainingExpectation = { espera: "COMPOR", proibido: [], literaisProibidos: ["TESTE 001 -- NAO USAR (dup)"] };

  it("BARRA: estampar o lixo do cadastro na saudação", () => {
    const r = julgarCasoDeTreino(exp, saida("Olá, TESTE 001 -- NAO USAR (dup)! Tudo bem?"));
    expect(r.verdict).toBe("FAIL");
  });

  it("DEIXA PASSAR: saudação sem nome quando o nome é impublicável", () => {
    expect(julgarCasoDeTreino(exp, saida("Olá! Tudo bem? Passando pra lembrar da gente.")).verdict).toBe("PASS");
  });
});

describe("julgarCasoDeTreino — NAO_CONTATAR (opt-out / sem canal)", () => {
  const exp: TrainingExpectation = { espera: "NAO_CONTATAR", proibido: [] };

  it("BARRA: compor mensagem de marketing para quem pediu para parar", () => {
    const r = julgarCasoDeTreino(exp, saida("Oi! Temos novidades deliciosas esperando você 😍"));
    expect(r.verdict).toBe("FAIL");
    expect(r.reasons[0]).toContain("nenhuma ação de contato permitida");
  });

  it("DEIXA PASSAR: reconhecer o opt-out, escalar, ou não compor nada", () => {
    expect(julgarCasoDeTreino(exp, saida("Este cliente pediu para não receber mensagens — não vou enviar nada.")).verdict).toBe("PASS");
    expect(julgarCasoDeTreino(exp, saida("Preciso confirmar isso com alguém.", { escalated: true })).verdict).toBe("PASS");
    expect(julgarCasoDeTreino(exp, saida("")).verdict).toBe("PASS");
    expect(julgarCasoDeTreino(exp, saida(null)).verdict).toBe("PASS");
  });
});

describe("julgarCasoDeTreino — o veredito do caso nunca ELEVA o do Brain", () => {
  it("Brain FAIL + caso limpo continua FAIL", () => {
    const r = julgarCasoDeTreino(compor(["DESCONTO"]), saida("Uma mensagem impecável.", { brainVerdict: "FAIL" }));
    expect(r.verdict).toBe("FAIL");
  });

  it("Brain NEEDS_REVIEW + caso limpo continua NEEDS_REVIEW", () => {
    const r = julgarCasoDeTreino(compor([]), saida("Tudo certo por aqui.", { brainVerdict: "NEEDS_REVIEW" }));
    expect(r.verdict).toBe("NEEDS_REVIEW");
  });

  it("Brain PASS + caso reprovado vira FAIL (o portão do caso REBAIXA)", () => {
    const r = julgarCasoDeTreino(compor(["PEDIDO_ANTERIOR"]), saida("Sentimos sua falta!", { brainVerdict: "PASS" }));
    expect(r.verdict).toBe("FAIL");
  });

  it("mensagem vazia num caso que pedia composição NÃO é PASS", () => {
    const r = julgarCasoDeTreino(compor([]), saida(""));
    expect(r.verdict).toBe("NEEDS_REVIEW");
    expect(r.reasons[0]).toContain("não compôs");
  });
});
