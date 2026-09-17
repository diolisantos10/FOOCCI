/**
 * O FUNIL DE RECEITA — e a pergunta que este arquivo existe para responder:
 * **um zero nesta tela é um zero medido, ou é ninguém tendo medido?**
 */

import { describe, it, expect } from "vitest";
import { bancoDeProva } from "./bancoDeProva";
import {
  funilDeReceita,
  janelaAnterior,
  tendencia,
  totalDe,
  volumesDaJanela,
  ETAPAS_DA_RECEITA,
} from "./funilDeReceita";

const DE = new Date("2026-09-10T00:00:00Z");
const ATE = new Date("2026-09-17T00:00:00Z");
const P = { de: DE, ate: ATE };
const ANTES = janelaAnterior(P);

function dia(n: number): Date {
  return new Date(DE.getTime() + n * 86_400_000);
}

function empresas(n: number, base: Partial<Record<string, unknown>>, prefixo: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefixo}-${i}`,
    estagio: "QUALIFICADA",
    prioridade: null,
    scoreIcp: 50,
    fonteDaDescoberta: "planilha",
    ...base,
  }));
}

function eventosDeEstagio(ids: string[], para: string, quando: Date) {
  return ids.map((id) => ({
    id: `ev-${para}-${id}`,
    entidade: "EMPRESA",
    tipo: "MUDANCA_DE_ESTAGIO",
    paraEstagio: para,
    empresaId: id,
    criadoEm: quando,
  }));
}

describe("janela anterior", () => {
  it("tem o mesmo tamanho e encosta no início do período", () => {
    expect(ANTES.ate.getTime()).toBe(DE.getTime());
    expect(ATE.getTime() - DE.getTime()).toBe(ANTES.ate.getTime() - ANTES.de.getTime());
  });
});

describe("volume: medido zero × não medido", () => {
  it("tabela vazia desde sempre NÃO vira zero — vira 'sem fonte'", async () => {
    const db = bancoDeProva();
    const v = await volumesDaJanela(db as never, P);

    for (const etapa of ETAPAS_DA_RECEITA) {
      expect(v[etapa].medido, `${etapa} não podia estar medida`).toBe(false);
      expect(totalDe(v[etapa])).toBeNull();
    }
  });

  it("houve linha fora da janela: aí o zero é MEDIDO, e aparece como zero", async () => {
    const db = bancoDeProva({
      empresa: empresas(3, { descobertaEm: new Date("2026-01-01T00:00:00Z") }, "velha"),
    });

    const v = await volumesDaJanela(db as never, P);
    expect(v.EMPRESAS_ENCONTRADAS).toEqual({ medido: true, total: 0 });
  });

  it("linha dentro da janela conta, linha fora não", async () => {
    const db = bancoDeProva({
      empresa: [
        ...empresas(4, { descobertaEm: dia(1) }, "dentro"),
        ...empresas(9, { descobertaEm: dia(-30) }, "fora"),
      ],
    });

    const v = await volumesDaJanela(db as never, P);
    expect(v.EMPRESAS_ENCONTRADAS).toEqual({ medido: true, total: 4 });
  });
});

describe("as sete etapas vêm do banco", () => {
  it("cada etapa conta a sua tabela, com a sua regra", async () => {
    const dentro = empresas(10, { descobertaEm: dia(1) }, "a");
    // Duas descartadas: entram em "encontradas", saem de "prospects válidos".
    dentro[0]!.estagio = "DESCARTADA";
    dentro[1]!.estagio = "DESCARTADA";

    const db = bancoDeProva({
      empresa: dentro,
      eventoDaJornada: eventosDeEstagio(
        dentro.slice(0, 6).map((e) => e.id),
        "PRONTA_PARA_SDR",
        dia(2),
      ),
      // Três contatos decisores, mas DOIS são da mesma empresa: o funil conta
      // empresas alcançadas, não pessoas encontradas.
      contato: [
        { id: "c1", empresaId: "a-0", ehDecisor: true, criadoEm: dia(3) },
        { id: "c2", empresaId: "a-0", ehDecisor: true, criadoEm: dia(3) },
        { id: "c3", empresaId: "a-1", ehDecisor: true, criadoEm: dia(3) },
      ],
      oportunidade: [
        { id: "o1", criadoEm: dia(4), estagio: "PROPOSTA", fechadaEm: null },
        { id: "o2", criadoEm: dia(4), estagio: "GANHA", fechadaEm: dia(5) },
      ],
      cliente: [
        { id: "cl1", situacao: "ATIVO" },
        { id: "cl2", situacao: "EM_ATIVACAO" },
      ],
    });

    const v = await volumesDaJanela(db as never, P);

    expect(v.EMPRESAS_ENCONTRADAS).toEqual({ medido: true, total: 10 });
    expect(v.PROSPECTS_VALIDOS).toEqual({ medido: true, total: 8 });
    expect(v.PRONTAS_PARA_SDR).toEqual({ medido: true, total: 6 });
    expect(v.DECISORES_ENCONTRADOS).toEqual({ medido: true, total: 2 });
    expect(v.OPORTUNIDADES).toEqual({ medido: true, total: 2 });
    expect(v.VENDAS).toEqual({ medido: true, total: 1 });
    expect(v.CLIENTES_ATIVOS).toEqual({ medido: true, total: 1 });
  });

  it("conversão entre etapas, e nada de conversão com amostra pequena", async () => {
    const dentro = empresas(20, { descobertaEm: dia(1) }, "b");
    const db = bancoDeProva({
      empresa: dentro,
      eventoDaJornada: eventosDeEstagio(
        dentro.slice(0, 10).map((e) => e.id),
        "PRONTA_PARA_SDR",
        dia(2),
      ),
      contato: dentro.slice(0, 2).map((e, i) => ({
        id: `d${i}`,
        empresaId: e.id,
        ehDecisor: true,
        criadoEm: dia(3),
      })),
      oportunidade: [{ id: "o1", criadoEm: dia(4), estagio: "PROPOSTA", fechadaEm: null }],
    });

    const funil = await funilDeReceita(db as never, P);
    const porEtapa = new Map(funil.degraus.map((d) => [d.etapa, d]));

    expect(porEtapa.get("EMPRESAS_ENCONTRADAS")!.conversao).toBeNull();
    expect(porEtapa.get("PRONTAS_PARA_SDR")!.conversao).toEqual({
      medido: true,
      valor: 0.5,
      base: 20,
    });
    // 2 decisores sobre 10 prontas: a base é 10, acima do mínimo, então mede.
    expect(porEtapa.get("DECISORES_ENCONTRADOS")!.conversao).toEqual({
      medido: true,
      valor: 0.2,
      base: 10,
    });
    // Uma oportunidade sobre 2 decisores: a base é 2, abaixo do mínimo de
    // amostra — e 50% sobre dois é folclore, não taxa.
    expect(porEtapa.get("OPORTUNIDADES")!.conversao).toEqual({
      medido: false,
      motivo: "amostraPequena",
      base: 2,
    });
  });

  it("ponta a ponta não se calcula quando as vendas não têm fonte", async () => {
    const db = bancoDeProva({
      empresa: empresas(10, { descobertaEm: dia(1) }, "c"),
    });
    const funil = await funilDeReceita(db as never, P);
    expect(funil.pontaAPonta).toBeNull();
  });
});

describe("tendência", () => {
  it("compara com a janela anterior de mesmo tamanho", async () => {
    const db = bancoDeProva({
      empresa: [
        ...empresas(8, { descobertaEm: dia(1) }, "ag"),
        ...empresas(10, { descobertaEm: new Date(ANTES.de.getTime() + 86_400_000) }, "an"),
      ],
    });

    const funil = await funilDeReceita(db as never, P);
    const topo = funil.degraus[0]!;

    expect(topo.volume).toEqual({ medido: true, total: 8 });
    expect(topo.volumeAnterior).toEqual({ medido: true, total: 10 });
    expect(topo.tendencia).toEqual({ medido: true, variacao: -0.2, de: 10, para: 8 });
  });

  it("base zero não vira crescimento infinito, vira 'sem base'", () => {
    expect(tendencia({ medido: true, total: 0 }, { medido: true, total: 7 })).toEqual({
      medido: false,
      motivo: "baseZero",
      para: 7,
    });
  });

  it("sem volume medido de um dos lados, não há comparação", () => {
    expect(
      tendencia({ medido: false, motivo: "semFonte" }, { medido: true, total: 7 }),
    ).toEqual({ medido: false, motivo: "semComparacao" });
  });
});
