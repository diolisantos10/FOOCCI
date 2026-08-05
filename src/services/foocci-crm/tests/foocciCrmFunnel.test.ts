/**
 * A trava do número honesto.
 *
 * O pedido do CEO tem uma frase que vira teste: "se não há dado suficiente para
 * uma taxa, a tela diz 'ainda não dá para dizer' em vez de mostrar 0% ou 100%
 * enganoso". Estes testes existem para que ninguém consiga "melhorar" a tela
 * mostrando uma porcentagem com três contatos.
 */

import { describe, it, expect } from "vitest";
import {
  computeFunnel, montaDegrau, formataTaxa, podeMover, indiceEtapa,
  SEQUENCIA_FUNIL, MIN_LEADS_PARA_TAXA, contaComoAbordagem,
  type FoocciLeadStage,
} from "../foocciCrmFunnel";

function leads(pares: Array<[FoocciLeadStage, FoocciLeadStage]>) {
  return pares.map(([atual, maisAvancada]) => ({ atual, maisAvancada }));
}

/** n contatos que chegaram e nunca saíram de NOVO. */
function novos(n: number) {
  return leads(Array.from({ length: n }, () => ["NOVO", "NOVO"] as [FoocciLeadStage, FoocciLeadStage]));
}

describe("taxa de conversão — amostra insuficiente NUNCA vira número", () => {
  it("não calcula taxa com menos contatos que o mínimo", () => {
    const d = montaDegrau("NOVO", "CONTATADO", MIN_LEADS_PARA_TAXA - 1, 1);
    expect(d.taxa).toBeNull();
    expect(d.motivoSemTaxa).toBe("amostra_insuficiente");
    expect(d.explicacao).toContain("Ainda não dá para dizer");
    // As CONTAGENS continuam disponíveis: fato é fato, o que se esconde é a razão.
    expect(d.base).toBe(MIN_LEADS_PARA_TAXA - 1);
    expect(d.alcancaram).toBe(1);
  });

  it("o caso perigoso: 1 de 1 NÃO vira 100%", () => {
    const d = montaDegrau("NOVO", "FECHADO", 1, 1);
    expect(d.taxa).toBeNull();
    expect(formataTaxa(d.taxa)).toBe("ainda não dá para dizer");
  });

  it("o outro caso perigoso: 0 de 3 NÃO vira 0%", () => {
    const d = montaDegrau("NOVO", "FECHADO", 3, 0);
    expect(d.taxa).toBeNull();
    expect(formataTaxa(d.taxa)).not.toContain("0%");
  });

  it("etapa sem ninguém diz que está sem ninguém, não 0%", () => {
    const d = montaDegrau("PROPOSTA", "FECHADO", 0, 0);
    expect(d.taxa).toBeNull();
    expect(d.motivoSemTaxa).toBe("sem_ninguem");
    expect(d.explicacao).toContain("Ninguém chegou");
  });

  it("calcula a taxa a partir do mínimo, e só a partir dele", () => {
    const abaixo = montaDegrau("NOVO", "CONTATADO", MIN_LEADS_PARA_TAXA - 1, 5);
    const exato  = montaDegrau("NOVO", "CONTATADO", MIN_LEADS_PARA_TAXA, 5);
    expect(abaixo.taxa).toBeNull();
    expect(exato.taxa).toBeCloseTo(5 / MIN_LEADS_PARA_TAXA);
  });

  it("o funil inteiro respeita a trava quando a base é pequena", () => {
    const r = computeFunnel(leads([
      ["CONTATADO", "CONTATADO"],
      ["FECHADO", "FECHADO"],
      ["NOVO", "NOVO"],
    ]));
    expect(r.total).toBe(3);
    for (const d of r.degraus) expect(d.taxa).toBeNull();
    expect(r.pontaAPonta?.taxa).toBeNull();
  });
});

describe("computeFunnel — o que conta e o que não conta", () => {
  it("um contato conta em todas as etapas até onde chegou", () => {
    const r = computeFunnel(leads([["PROPOSTA", "PROPOSTA"]]));
    const por = Object.fromEntries(r.etapas.map((e) => [e.stage, e.alcancaram]));
    expect(por.NOVO).toBe(1);
    expect(por.CONTATADO).toBe(1);
    expect(por.QUALIFICADO).toBe(1);
    expect(por.PROPOSTA).toBe(1);
    expect(por.FECHADO).toBe(0);
  });

  it("quem virou PERDIDO continua contando na etapa mais alta que alcançou", () => {
    // É aqui que o funil mostra ONDE vaza. Se o perdido sumisse do degrau
    // "qualificado → proposta", um mês de propostas recusadas pareceria um mês
    // sem propostas — e a conclusão seria consertar a etapa errada.
    const r = computeFunnel(leads([["PERDIDO", "PROPOSTA"]]));
    const por = Object.fromEntries(r.etapas.map((e) => [e.stage, e.alcancaram]));
    expect(por.PROPOSTA).toBe(1);
    expect(r.perdidos).toBe(1);
    // …mas ele não está "parado" em nenhuma etapa do funil.
    expect(r.etapas.every((e) => e.agora === 0)).toBe(true);
  });

  it("PERDIDO fica fora da sequência do funil", () => {
    expect(SEQUENCIA_FUNIL).not.toContain("PERDIDO");
    expect(indiceEtapa("PERDIDO")).toBe(-1);
  });

  it("separa 'alcançaram' de 'estão aqui agora'", () => {
    const r = computeFunnel(leads([
      ["FECHADO", "FECHADO"],
      ["CONTATADO", "CONTATADO"],
    ]));
    const contatado = r.etapas.find((e) => e.stage === "CONTATADO")!;
    expect(contatado.alcancaram).toBe(2); // os dois passaram por CONTATADO
    expect(contatado.agora).toBe(1);      // só um está parado ali
  });

  it("com amostra suficiente a taxa aparece e bate com as contagens", () => {
    // 12 chegaram, 6 foram contatados.
    const base = [
      ...novos(6),
      ...leads(Array.from({ length: 6 }, () => ["CONTATADO", "CONTATADO"] as [FoocciLeadStage, FoocciLeadStage])),
    ];
    const r = computeFunnel(base);
    const primeiro = r.degraus[0]!;
    expect(primeiro.base).toBe(12);
    expect(primeiro.alcancaram).toBe(6);
    expect(primeiro.taxa).toBeCloseTo(0.5);
    expect(formataTaxa(primeiro.taxa)).toBe("50%");
  });

  it("base vazia não produz taxa nenhuma", () => {
    const r = computeFunnel([]);
    expect(r.total).toBe(0);
    expect(r.pontaAPonta).toBeNull();
    for (const d of r.degraus) expect(d.taxa).toBeNull();
  });
});

describe("interações de saída", () => {
  it("só o que a Foocci FEZ conta como abordagem", () => {
    expect(contaComoAbordagem("MENSAGEM_ENVIADA")).toBe(true);
    expect(contaComoAbordagem("LIGACAO")).toBe(true);
    expect(contaComoAbordagem("REUNIAO")).toBe(true);
    // Uma anotação interna não pode tirar o contato da fila de "não abordados".
    expect(contaComoAbordagem("NOTA")).toBe(false);
    expect(contaComoAbordagem("RESPOSTA_RECEBIDA")).toBe(false);
    expect(contaComoAbordagem("CAPTURA")).toBe(false);
  });
});

describe("transições", () => {
  it("permite pular etapa — o histórico guarda o pulo", () => {
    expect(podeMover("NOVO", "FECHADO")).toBe(true);
  });

  it("não permite 'mover' para a etapa em que já está", () => {
    expect(podeMover("PROPOSTA", "PROPOSTA")).toBe(false);
  });

  it("recusa etapa que não existe", () => {
    expect(podeMover("NOVO", "QUASE_FECHANDO" as FoocciLeadStage)).toBe(false);
  });
});
