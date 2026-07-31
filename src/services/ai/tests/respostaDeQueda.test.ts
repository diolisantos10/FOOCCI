/**
 * A queda parou de apagar a conversa.
 *
 * Regressão do incidente real: uma cliente pedindo um poke recebeu a tela de
 * entrada CINCO vezes no meio do pedido, porque todo portão do Cérebro que
 * reprovava caía em `templateReply ?? welcomeMessage`.
 *
 * Metade destes testes prova que a queda nova preserva o contexto. A outra
 * metade prova que o primeiro contato continua recebendo a saudação — sem ela,
 * o conserto quebraria a porta de entrada, que é o comportamento certo.
 */

import { describe, it, expect } from "vitest";

import {
  ehAmnesia,
  escolherSemRepetir,
  FRASES_DE_QUEDA,
  respostaQuandoNaoEntendeu,
} from "../respostaDeQueda";

const SAUDACAO = "Olá! Tudo bem? 😊 O que você deseja?";

describe("no meio da conversa", () => {
  it("REGRESSÃO: não manda a saudação — foi isso que aconteceu 5x com a cliente", () => {
    const r = respostaQuandoNaoEntendeu({ conversaEmAndamento: true, saudacao: SAUDACAO });
    expect(r).not.toBe(SAUDACAO);
    expect(r).not.toContain("O que você deseja");
  });

  it("a resposta pede para repetir, em vez de recomeçar", () => {
    const r = respostaQuandoNaoEntendeu({ conversaEmAndamento: true, saudacao: SAUDACAO });
    expect(r.toLowerCase()).toMatch(/repet|outro jeito|outras palavras|entend/);
  });

  it("não repete a mesma queda duas vezes seguidas", () => {
    const primeira = respostaQuandoNaoEntendeu({ conversaEmAndamento: true, saudacao: SAUDACAO });
    const segunda = respostaQuandoNaoEntendeu({
      conversaEmAndamento: true,
      saudacao: SAUDACAO,
      ultimaFalaDoAgente: primeira,
    });
    expect(segunda).not.toBe(primeira);
  });

  it("a última fala vem com o rodapé do menu colado e ainda assim não repete", () => {
    // No runtime a fala gravada é `appendBackToMainMenu(queda)` — tem sufixo.
    const primeira = FRASES_DE_QUEDA[0]!;
    const gravada = `${primeira}\n\n0. menu`;
    expect(respostaQuandoNaoEntendeu({
      conversaEmAndamento: true, saudacao: SAUDACAO, ultimaFalaDoAgente: gravada,
    })).not.toBe(primeira);
  });
});

describe("primeiro contato — o que NÃO podia quebrar", () => {
  it("quem acabou de chegar recebe a saudação configurada", () => {
    expect(respostaQuandoNaoEntendeu({ conversaEmAndamento: false, saudacao: SAUDACAO })).toBe(SAUDACAO);
  });

  it("a saudação vale mesmo que exista fala anterior fora da janela", () => {
    // conversaEmAndamento=false é a decisão do chamador (janela de 30 min).
    expect(respostaQuandoNaoEntendeu({
      conversaEmAndamento: false, saudacao: SAUDACAO, ultimaFalaDoAgente: "algo antigo",
    })).toBe(SAUDACAO);
  });
});

describe("a escolha sem repetição", () => {
  it("sem fala anterior, devolve a primeira — determinístico, dá replay", () => {
    expect(escolherSemRepetir(FRASES_DE_QUEDA)).toBe(FRASES_DE_QUEDA[0]);
    expect(escolherSemRepetir(FRASES_DE_QUEDA, null)).toBe(FRASES_DE_QUEDA[0]);
    expect(escolherSemRepetir(FRASES_DE_QUEDA, "   ")).toBe(FRASES_DE_QUEDA[0]);
  });

  it("mesma entrada, mesma saída", () => {
    const a = escolherSemRepetir(FRASES_DE_QUEDA, FRASES_DE_QUEDA[0]);
    const b = escolherSemRepetir(FRASES_DE_QUEDA, FRASES_DE_QUEDA[0]);
    expect(a).toBe(b);
  });

  it("lista vazia não deixa o cliente sem resposta", () => {
    expect(escolherSemRepetir([]).length).toBeGreaterThan(0);
    expect(escolherSemRepetir(["  ", ""]).length).toBeGreaterThan(0);
  });

  it("todas as frases já ditas ainda devolve alguma coisa", () => {
    const tudo = FRASES_DE_QUEDA.join(" ");
    expect(escolherSemRepetir(FRASES_DE_QUEDA, tudo)).toBe(FRASES_DE_QUEDA[0]);
  });

  it("toda frase do repertório é utilizável", () => {
    for (const f of FRASES_DE_QUEDA) {
      expect(f.trim().length, f).toBeGreaterThan(10);
      expect(f).not.toContain("O que você deseja"); // nunca uma saudação disfarçada
    }
  });
});

describe("o detector de amnésia — a régua do incidente", () => {
  it("saudação no meio da conversa é amnésia", () => {
    expect(ehAmnesia({ resposta: `${SAUDACAO}\n\n0. menu`, saudacao: SAUDACAO, conversaEmAndamento: true })).toBe(true);
  });

  it("saudação no primeiro contato não é amnésia — é o certo", () => {
    expect(ehAmnesia({ resposta: SAUDACAO, saudacao: SAUDACAO, conversaEmAndamento: false })).toBe(false);
  });

  it("a queda nova nunca é amnésia", () => {
    for (const f of FRASES_DE_QUEDA) {
      expect(ehAmnesia({ resposta: f, saudacao: SAUDACAO, conversaEmAndamento: true }), f).toBe(false);
    }
  });

  it("saudação vazia não vira falso positivo", () => {
    expect(ehAmnesia({ resposta: "qualquer coisa", saudacao: "   ", conversaEmAndamento: true })).toBe(false);
  });
});
