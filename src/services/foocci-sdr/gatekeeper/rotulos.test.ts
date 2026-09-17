/**
 * OS RÓTULOS NÃO PODEM DISCORDAR DO CLASSIFICADOR NEM DO BANCO.
 *
 * Um catálogo de rótulo é a coisa mais fácil de deixar para trás: alguém
 * acrescenta um tipo de porteiro no enum, o classificador passa a carimbá-lo, e
 * a tela — que lista "os nove" — simplesmente não mostra o décimo. Ninguém
 * percebe, porque a tela continua bonita. Este teste faz o compilador e a
 * bateria cobrarem a linha que falta.
 */

import { describe, it, expect } from "vitest";
import { classificarInterlocutor } from "./classificacao";
import { ROTULO_DO_TIPO, TIPOS_DE_GATEKEEPER, PORTEIRO_DE_CARNE_E_OSSO, ehPorteiroHumano } from "./rotulos";
import { estadoDaFilaDoSdr } from "@/services/salaDeVendas/prospeccao/filaDoSdr";

const AGORA = new Date("2026-09-17T12:00:00.000Z");

describe("o catálogo de tipos cobre o que o classificador sabe carimbar", () => {
  it("são nove tipos, sem repetido e todos com rótulo não vazio", () => {
    expect(new Set(TIPOS_DE_GATEKEEPER).size).toBe(9);
    for (const t of TIPOS_DE_GATEKEEPER) {
      expect(ROTULO_DO_TIPO[t]).toBeTruthy();
    }
    expect(Object.keys(ROTULO_DO_TIPO).sort()).toEqual([...TIPOS_DE_GATEKEEPER].sort());
  });

  it("todo tipo que o classificador devolve está no catálogo", () => {
    const frases = [
      "1 - Fazer pedido, 2 - Acompanhar pedido",
      "preencha o formulário de contato no site",
      "sou a recepcionista, vou anotar seu recado",
      "aqui é o SAC, qual o número do seu pedido?",
      "sou atendente, posso ajudar?",
      "aqui é o caixa do restaurante",
    ];
    for (const f of frases) {
      const c = classificarInterlocutor(f);
      if (c.tipoDeGatekeeper !== null) {
        expect(TIPOS_DE_GATEKEEPER).toContain(c.tipoDeGatekeeper);
      }
    }
  });
});

describe("'dá para insistir' concorda com a régua da fila do SDR", () => {
  /**
   * As duas listas são escritas em arquivos diferentes de propósito (a da fila
   * é detalhe privado dela). O que NÃO pode acontecer é elas divergirem: a tela
   * diria "dá para insistir" num tipo que a fila trata como máquina. Aqui a
   * concordância é medida pelo COMPORTAMENTO da fila, não por cópia da lista.
   */
  for (const tipo of TIPOS_DE_GATEKEEPER) {
    it(`${tipo}: a fila e o rótulo dizem a mesma coisa`, () => {
      const estado = estadoDaFilaDoSdr(
        {
          estagio: "GATEKEEPER",
          contatos: [{ ehDecisor: false, ehGatekeeper: true, tipoDeGatekeeper: tipo }],
          leads: [],
        },
        AGORA,
      );
      const filaDizQueEhGente = estado === "FALANDO_COM_ATENDENTE";
      expect(ehPorteiroHumano(tipo)).toBe(filaDizQueEhGente);
    });
  }

  it("a lista de porteiro humano tem exatamente os quatro de carne e osso", () => {
    expect([...PORTEIRO_DE_CARNE_E_OSSO].sort()).toEqual(["ATENDENTE", "CAIXA", "RECEPCIONISTA", "SAC"]);
  });
});
