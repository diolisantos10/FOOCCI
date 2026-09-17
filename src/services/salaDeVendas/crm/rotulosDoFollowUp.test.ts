/**
 * OS CATORZE ESTADOS DA TELA SÃO OS CATORZE ESTADOS DA RÉGUA.
 *
 * A régua de follow-up (`estadoDeFollowUp.ts`) é quem decide; o catálogo de
 * rótulo é quem desenha. Se a régua ganhar um estado e o catálogo não, a tela
 * some com uma fila inteira sem avisar ninguém — e o contato que caiu nela
 * desaparece do painel enquanto continua existindo no banco.
 */

import { describe, it, expect } from "vitest";
import { REGRAS, ESTADOS_QUE_PEDEM_ACAO } from "./estadoDeFollowUp";
import { CADENCIA_POR_ESTADO, contagemZeradaPorEstado } from "./planoDoDia";
import { ESTADOS_DE_FOLLOW_UP, EXPLICACAO_DO_ESTADO, ROTULO_DO_ESTADO } from "./rotulosDoFollowUp";

describe("o catálogo cobre a régua inteira", () => {
  it("são catorze, sem repetido, todos com rótulo e explicação", () => {
    expect(ESTADOS_DE_FOLLOW_UP.length).toBe(14);
    expect(new Set(ESTADOS_DE_FOLLOW_UP).size).toBe(14);
    for (const e of ESTADOS_DE_FOLLOW_UP) {
      expect(ROTULO_DO_ESTADO[e]).toBeTruthy();
      expect(EXPLICACAO_DO_ESTADO[e]).toBeTruthy();
    }
  });

  it("todo estado que alguma regra da régua produz está no catálogo", () => {
    for (const r of REGRAS) {
      expect(ESTADOS_DE_FOLLOW_UP).toContain(r.estado);
    }
  });

  it("os baldes do plano do dia e os do catálogo são exatamente os mesmos", () => {
    expect(Object.keys(contagemZeradaPorEstado()).sort()).toEqual([...ESTADOS_DE_FOLLOW_UP].sort());
  });

  it("todo estado com cadência declarada existe no catálogo", () => {
    for (const estado of Object.keys(CADENCIA_POR_ESTADO)) {
      expect(ESTADOS_DE_FOLLOW_UP).toContain(estado as never);
    }
  });

  it("todo estado que pede ação aparece na tela", () => {
    for (const e of ESTADOS_QUE_PEDEM_ACAO) {
      expect(ESTADOS_DE_FOLLOW_UP).toContain(e);
    }
  });
});
