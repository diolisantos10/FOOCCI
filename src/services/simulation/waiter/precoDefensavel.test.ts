/**
 * O checador de preço parou de reprovar o Garçom por acertar.
 *
 * Ele só aceitava preço EXATO de item. Um total ("seu pedido dá R$ 87,00")
 * nunca é preço de item — então virava `CRÍTICO: preço inventado`, na mesma
 * gaveta de alucinação. E os cenários onde isso acontece são PAYMENT_QUESTION
 * e WANTS_CHECKOUT, em que dizer o total é o comportamento CERTO.
 *
 * Metade destes testes prova que o legítimo passa. A outra metade prova que o
 * inventado continua caindo — sem ela, o conserto teria virado carimbo.
 */

import { describe, it, expect } from "vitest";

import { emCentavos, precoSeSustenta, valoresDefensaveis } from "./precoDefensavel";

const CATALOGO = [32.9, 45.0, 18.5, 9.9];

const mesa = (over: Partial<Parameters<typeof valoresDefensaveis>[0]> = {}) =>
  valoresDefensaveis({
    precosDoCatalogo: CATALOGO,
    valorDoCarrinho: 0,
    precosMostrados: [],
    ...over,
  });

describe("o que o garçom pode dizer", () => {
  it("preço de item do cardápio — a régua original continua valendo", () => {
    const d = mesa();
    for (const p of CATALOGO) expect(precoSeSustenta(p, d), `R$ ${p}`).toBe(true);
  });

  it("o TOTAL do carrinho — era isto que virava crítico", () => {
    const d = mesa({ valorDoCarrinho: 77.9 });
    expect(precoSeSustenta(77.9, d)).toBe(true);
  });

  it("carrinho + item sugerido — o upsell honesto", () => {
    const d = mesa({ valorDoCarrinho: 45.0, precosMostrados: [18.5] });
    expect(precoSeSustenta(63.5, d)).toBe(true);
  });

  it('soma dos itens mostrados — "os dois saem por X"', () => {
    const d = mesa({ precosMostrados: [32.9, 32.9] });
    expect(precoSeSustenta(65.8, d)).toBe(true);
  });

  it("soma de três mostrados também fecha", () => {
    const d = mesa({ precosMostrados: [32.9, 18.5, 9.9] });
    expect(precoSeSustenta(61.3, d)).toBe(true);
  });

  it("um centavo de arredondamento não é mentira", () => {
    const d = mesa({ valorDoCarrinho: 65.79 });
    expect(precoSeSustenta(65.8, d)).toBe(true);
  });
});

describe("o que continua sendo preço inventado", () => {
  it("valor que não bate com nada da mesa", () => {
    expect(precoSeSustenta(199.99, mesa())).toBe(false);
  });

  it("preço de item que não existe no cardápio", () => {
    expect(precoSeSustenta(27.5, mesa())).toBe(false);
  });

  it("soma de itens que o agente NÃO mostrou — número tirado do nada", () => {
    // 45,00 + 9,90 = 54,90 existe no catálogo, mas ele não mostrou nenhum dos dois
    expect(precoSeSustenta(54.9, mesa({ precosMostrados: [] }))).toBe(false);
  });

  it("carrinho vazio não legitima total nenhum", () => {
    expect(precoSeSustenta(87.0, mesa({ valorDoCarrinho: 0 }))).toBe(false);
  });

  it("erro maior que um centavo não passa", () => {
    const d = mesa({ valorDoCarrinho: 65.5 });
    expect(precoSeSustenta(65.8, d)).toBe(false);
  });

  it("a régua não vira carimbo: a maioria dos valores aleatórios cai", () => {
    const d = mesa({ valorDoCarrinho: 45.0, precosMostrados: [32.9] });
    const testados = [13.7, 21.4, 39.9, 51.2, 88.8, 104.5, 150.0];
    const passaram = testados.filter((v) => precoSeSustenta(v, d));
    expect(passaram, `passaram indevidamente: ${passaram.join(", ")}`).toEqual([]);
  });
});

describe("centavos em vez de ponto flutuante", () => {
  it("três itens de 32,90 fecham exatamente em 98,70", () => {
    // O motivo de existir esta peça: em ponto flutuante a mesma soma dá
    // 98.69999999999999, e uma comparação direta reprovaria um total correto.
    expect(32.9 + 32.9 + 32.9).not.toBe(98.7);
    expect(emCentavos(32.9) * 3).toBe(emCentavos(98.7));
  });

  it("e o checador aceita esse total, apesar da dízima", () => {
    const d = mesa({ precosMostrados: [32.9, 32.9, 32.9] });
    expect(precoSeSustenta(98.7, d)).toBe(true);
  });

  it("preço com um decimal só não quebra", () => {
    expect(precoSeSustenta(18.5, mesa())).toBe(true);
  });
});
