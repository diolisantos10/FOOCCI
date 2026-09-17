/**
 * EFICIÊNCIA POR ETAPA, SLA E ÍNDICE DE SAÚDE.
 *
 * A pergunta que estes testes fazem não é "o número está certo?" — é
 * **"quando o número não existe, o que aparece?"**. Uma etapa cega precisa sair
 * com `{medido:false}` e FORA da fila de gargalos: se ela entrasse como zero,
 * apareceria como a etapa mais saudável da operação, e o gerente iria cuidar
 * das outras enquanto a cega apodrece.
 */

import { describe, it, expect } from "vitest";
import { bancoDeProva } from "./bancoDeProva";
import { funilDeReceita, janelaAnterior } from "./funilDeReceita";
import {
  comporGravidade,
  eficienciaPorEtapa,
  indiceDeSaude,
  PESOS_DA_SAUDE,
  SLA_DA_ETAPA,
  type EficienciaDaOperacao,
} from "./eficiencia";

const DE = new Date("2026-09-10T00:00:00Z");
const ATE = new Date("2026-09-17T00:00:00Z");
const P = { de: DE, ate: ATE };
const ANTES = janelaAnterior(P);

const MIN = 60_000;
const DIA_MS = 86_400_000;

describe("os prazos são os do projeto", () => {
  it("Hunter 2 dias, SDR 1 dia, Atendimento 4 h, Vendas 2 dias, CRM 7 dias", () => {
    expect(SLA_DA_ETAPA).toEqual({
      HUNTER: 2 * 24 * 60,
      SDR: 1 * 24 * 60,
      ATENDIMENTO: 4 * 60,
      VENDAS: 2 * 24 * 60,
      CRM: 7 * 24 * 60,
    });
  });
});

describe("permanência por etapa, medida no banco", () => {
  it("Hunter: da descoberta até ficar pronta, com a fração dentro do prazo", async () => {
    // Cinco empresas descobertas no dia 10; quatro ficam prontas em 1 dia
    // (dentro do prazo de 2), uma leva 5 dias.
    const atrasos = [1, 1, 1, 1, 5];
    const empresa = atrasos.map((_, i) => ({
      id: `e${i}`,
      descobertaEm: DE,
      estagio: "PRONTA_PARA_SDR",
      prioridade: null,
      fonteDaDescoberta: "planilha",
    }));
    const eventoDaJornada = atrasos.map((d, i) => ({
      id: `ev${i}`,
      entidade: "EMPRESA",
      tipo: "MUDANCA_DE_ESTAGIO",
      paraEstagio: "PRONTA_PARA_SDR",
      empresaId: `e${i}`,
      criadoEm: new Date(DE.getTime() + d * DIA_MS),
    }));

    const db = bancoDeProva({ empresa, eventoDaJornada });
    const funil = await funilDeReceita(db as never, P);
    const ef = await eficienciaPorEtapa(db as never, P, funil);

    const hunter = ef.etapas.find((e) => e.etapa === "HUNTER")!;
    expect(hunter.duracao).toEqual({
      medido: true,
      minutos: Math.round(((4 * 1 + 5) * DIA_MS) / 5 / MIN),
      base: 5,
    });
    expect(hunter.dentroDoSla).toEqual({ medido: true, valor: 0.8, base: 5 });
  });

  it("SDR: conta do ÚLTIMO retorno à fila, não da primeira vez", async () => {
    const empresa = [
      {
        id: "e1",
        descobertaEm: DE,
        estagio: "DECISOR_ENCONTRADO",
        prioridade: null,
        fonteDaDescoberta: "planilha",
      },
    ];
    const eventoDaJornada = [
      // Primeira passagem pela fila, três dias antes.
      {
        id: "v1",
        entidade: "EMPRESA",
        tipo: "MUDANCA_DE_ESTAGIO",
        paraEstagio: "PRONTA_PARA_SDR",
        empresaId: "e1",
        criadoEm: new Date(DE.getTime() + 1 * DIA_MS),
      },
      // Voltou para a fila no dia 4…
      {
        id: "v2",
        entidade: "EMPRESA",
        tipo: "MUDANCA_DE_ESTAGIO",
        paraEstagio: "PRONTA_PARA_SDR",
        empresaId: "e1",
        criadoEm: new Date(DE.getTime() + 4 * DIA_MS),
      },
      // …e o decisor apareceu no dia 5. Meio dia de SDR, não três e meio.
      {
        id: "v3",
        entidade: "EMPRESA",
        tipo: "MUDANCA_DE_ESTAGIO",
        paraEstagio: "DECISOR_ENCONTRADO",
        empresaId: "e1",
        criadoEm: new Date(DE.getTime() + 4.5 * DIA_MS),
      },
    ];

    const db = bancoDeProva({ empresa, eventoDaJornada });
    const funil = await funilDeReceita(db as never, P);
    const ef = await eficienciaPorEtapa(db as never, P, funil);

    const sdr = ef.etapas.find((e) => e.etapa === "SDR")!;
    expect(sdr.duracao).toEqual({ medido: true, minutos: (0.5 * DIA_MS) / MIN, base: 1 });
  });

  it("Vendas e CRM saem de oportunidade e cliente", async () => {
    const db = bancoDeProva({
      oportunidade: [
        {
          id: "o1",
          criadoEm: DE,
          estagio: "GANHA",
          fechadaEm: new Date(DE.getTime() + 1 * DIA_MS),
        },
      ],
      cliente: [
        {
          id: "c1",
          situacao: "ATIVO",
          ganhoEm: DE,
          ativadoEm: new Date(DE.getTime() + 3 * DIA_MS),
          canceladoEm: null,
        },
      ],
    });

    const funil = await funilDeReceita(db as never, P);
    const ef = await eficienciaPorEtapa(db as never, P, funil);

    expect(ef.etapas.find((e) => e.etapa === "VENDAS")!.duracao).toEqual({
      medido: true,
      minutos: DIA_MS / MIN,
      base: 1,
    });
    expect(ef.etapas.find((e) => e.etapa === "CRM")!.duracao).toEqual({
      medido: true,
      minutos: (3 * DIA_MS) / MIN,
      base: 1,
    });
  });
});

describe("etapa cega não é etapa saudável", () => {
  it("banco vazio: cinco etapas cegas, nenhum gargalo, nenhuma gravidade zero", async () => {
    const db = bancoDeProva();
    const funil = await funilDeReceita(db as never, P);
    const ef = await eficienciaPorEtapa(db as never, P, funil);

    expect(ef.cegas).toEqual(["HUNTER", "SDR", "ATENDIMENTO", "VENDAS", "CRM"]);
    expect(ef.gargalos).toEqual([]);
    for (const e of ef.etapas) {
      expect(e.gravidade).toEqual({ medido: false, motivo: "semMedicao" });
      expect(e.duracao.medido).toBe(false);
    }
  });
});

describe("gravidade é conta aberta", () => {
  it("renormaliza pelo peso presente, e não pelo peso total", () => {
    const g = comporGravidade([
      { fator: "a", peso: 50, nota: 1, evidencia: "medido" },
      { fator: "b", peso: 30, nota: 0, evidencia: "medido" },
    ]);
    expect(g).toMatchObject({ medido: true, pesoMedido: 80 });
    if (!g.medido) return;
    expect(g.valor).toBeCloseTo(50 / 80, 6);
  });

  it("sem parcela nenhuma, não vira zero", () => {
    expect(comporGravidade([])).toEqual({ medido: false, motivo: "semMedicao" });
  });
});

describe("índice de saúde", () => {
  function eficienciaFalsa(dentro: number[]): EficienciaDaOperacao {
    return {
      etapas: dentro.map((v) => ({
        dentroDoSla: { medido: true as const, valor: v, base: 10 },
      })) as never,
      gargalos: [],
      cegas: [],
    };
  }

  const funilFalso = {
    pontaAPonta: { medido: true as const, valor: 0.01, base: 500 },
    degraus: [
      {
        etapa: "DECISORES_ENCONTRADOS",
        conversao: { medido: true as const, valor: 0.175, base: 40 },
      },
    ],
  } as never;

  it("cada parcela entra com peso declarado e evidência numérica", () => {
    const s = indiceDeSaude({
      funil: funilFalso,
      eficiencia: eficienciaFalsa([0.8, 0.6]),
      fila: { ativos: 100, emAtraso: 20 },
      ativacao: { ganhos: 10, ativados: 5 },
    });

    expect(s.medido).toBe(true);
    if (!s.medido) return;

    expect(s.pesoMedido).toBe(s.pesoTotal);
    for (const p of s.parcelas) {
      expect(p.evidencia).toMatch(/\d/);
      expect(p.nota).toBeGreaterThanOrEqual(0);
      expect(p.nota).toBeLessThanOrEqual(1);
    }

    // A conta, à mão: 0,5·25 + 0,7·25 + 0,5·20 + 0,5·15 + 0,8·15 = 59,5 sobre 100.
    expect(s.indice).toBe(60);
  });

  it("é reproduzível: a mesma entrada dá o mesmo índice", () => {
    const entrada = {
      funil: funilFalso,
      eficiencia: eficienciaFalsa([0.8, 0.6]),
      fila: { ativos: 100, emAtraso: 20 },
      ativacao: { ganhos: 10, ativados: 5 },
    };
    expect(indiceDeSaude(entrada)).toEqual(indiceDeSaude(entrada));
  });

  it("parcela não medida SAI da conta — não entra como zero", () => {
    const s = indiceDeSaude({
      funil: funilFalso,
      eficiencia: eficienciaFalsa([0.8, 0.6]),
      fila: null,
      ativacao: null,
    });

    expect(s.medido).toBe(true);
    if (!s.medido) return;

    expect(s.pesoMedido).toBe(
      PESOS_DA_SAUDE.conversaoPontaAPonta +
        PESOS_DA_SAUDE.cumprimentoDeSla +
        PESOS_DA_SAUDE.acessoAoDecisor,
    );
    expect(s.pesoMedido).toBeLessThan(s.pesoTotal);
    expect(s.parcelas.map((p) => p.fator)).not.toContain("fila em dia");
    // 0,5·25 + 0,7·25 + 0,5·20 = 40 sobre 70 = 57 — e NÃO 40 sobre 100.
    expect(s.indice).toBe(57);
  });

  it("nada medido não vira zero, vira índice não medido", () => {
    const s = indiceDeSaude({
      funil: { pontaAPonta: null, degraus: [] } as never,
      eficiencia: { etapas: [], gargalos: [], cegas: [] },
      fila: null,
      ativacao: null,
    });
    expect(s).toMatchObject({ medido: false, motivo: "semMedicao", pesoTotal: 100 });
  });
});

describe("a janela anterior serve as duas medidas", () => {
  it("encosta no período e tem o mesmo tamanho", () => {
    expect(ANTES.ate.getTime()).toBe(P.de.getTime());
  });
});
