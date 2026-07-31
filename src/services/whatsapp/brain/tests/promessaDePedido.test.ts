/**
 * O agente parou de prometer pedido que ele não consegue criar.
 *
 * Regressão do incidente real: o caminho do WhatsApp não tem carrinho, e mesmo
 * assim o agente disse "vou adicionar tare ao seu pedido" e "posso confirmar o
 * seu pedido agora?". A cliente respondeu "Sim" duas vezes, as duas no vazio.
 *
 * Metade destes testes usa as FALAS REAIS do incidente. A outra metade prova que
 * conversa legítima continua passando — sem ela o detector viraria carimbo e o
 * agente pararia de conversar.
 */

import { describe, it, expect } from "vitest";

import { encaminharParaOCardapio, prometeuPedido } from "../promessaDePedido";

describe("as falas reais do incidente", () => {
  const FALAS = [
    "Perfeito! Vou adicionar tare ao seu pedido e não incluirei shoyu. Posso confirmar o seu pedido agora?",
    "Perfeito! Você escolheu o Poke Salmão Cru. Posso confirmar o seu pedido?",
    "Ótima escolha! Vou anotar no seu pedido.",
  ];

  it("todas são barradas", () => {
    for (const f of FALAS) {
      const v = prometeuPedido(f);
      expect(v.prometeu, f).toBe(true);
      expect(v.motivos.length, f).toBeGreaterThan(0);
    }
  });

  it("o motivo é nomeado — o log precisa dizer o que pegou", () => {
    expect(prometeuPedido("Vou adicionar tare ao seu pedido").motivos).toContain("anotou item");
    expect(prometeuPedido("Posso confirmar o seu pedido?").motivos).toContain("pede confirmação");
  });
});

describe("outras encenações de comanda", () => {
  it.each([
    ["Já incluí o refrigerante no seu pedido",      "anotou item"],
    ["Coloquei mais uma porção na comanda",         "anotou item"],
    ["Montei seu pedido, confere pra mim?",         "montou o pedido"],
    ["Seu pedido está anotado!",                    "promete registrar"],
    ["Confirma o seu pedido pra eu fechar?",        "pede confirmação"],
    ["Qual o endereço para entrega?",               "coleta de entrega"],
    ["Vai precisar de troco?",                      "coleta de troco"],
  ])("barra: %s", (frase, motivo) => {
    const v = prometeuPedido(frase);
    expect(v.prometeu).toBe(true);
    expect(v.motivos).toContain(motivo);
  });

  it("funciona sem acento — o agente escreve dos dois jeitos", () => {
    expect(prometeuPedido("Posso confirmar o seu pedido?").prometeu).toBe(true);
    expect(prometeuPedido("Qual o endereco para entrega?").prometeu).toBe(true);
  });
});

describe("o que NÃO pode ser barrado — senão o agente para de conversar", () => {
  it.each([
    "Olá! Tudo bem? 😊 O que você deseja?",
    "Nosso horário é das 18h às 23h.",
    "Temos Poke Fry, Poke Shimeji e Poke Salmão Grelhado.",
    "Pra fechar o pedido é rapidinho pelo nosso cardápio 😊",
    "Aceitamos Pix, cartão e dinheiro.",
    "Vou adicionar essa informação na nossa base, obrigado!",
    "Seu pedido anterior saiu às 20h30.",
    "Entregamos na região central.",
    "Posso te ajudar com mais alguma coisa?",
    "Vou confirmar essa informação com a equipe.",
  ])("passa: %s", (frase) => {
    expect(prometeuPedido(frase).prometeu, frase).toBe(false);
  });

  it("REGRESSÃO: a própria frase de encaminhamento não pode ser barrada", () => {
    // Se ela caísse no detector, o agente ficaria num laço barrando a si mesmo.
    expect(prometeuPedido(encaminharParaOCardapio()).prometeu).toBe(false);
    expect(prometeuPedido(encaminharParaOCardapio("https://x.com/r/abc")).prometeu).toBe(false);
  });

  it("texto vazio não explode", () => {
    expect(prometeuPedido("").prometeu).toBe(false);
    expect(prometeuPedido("   ").prometeu).toBe(false);
  });
});

describe("o encaminhamento", () => {
  it("com link, manda o link", () => {
    expect(encaminharParaOCardapio("https://foocci.com.br/r/x")).toContain("https://foocci.com.br/r/x");
  });

  it("sem link, ainda diz o que fazer", () => {
    expect(encaminharParaOCardapio(null).toLowerCase()).toContain("cardápio");
    expect(encaminharParaOCardapio(undefined).length).toBeGreaterThan(10);
  });
});
