/**
 * A VISÃO DO SUPERVISOR — a junção, e a regra que ela não pode violar:
 * **nenhuma ação recomendada sem um número que a sustente.**
 */

import { describe, it, expect } from "vitest";
import { bancoDeProva } from "./bancoDeProva";
import { montarAcoes, visaoDoSupervisor } from "./revenueSupervisor";

const DE = new Date("2026-09-10T00:00:00Z");
const ATE = new Date("2026-09-17T00:00:00Z");
const AGORA = new Date("2026-09-16T12:00:00Z");
const P = { de: DE, ate: ATE, agora: AGORA };

describe("montar as ações", () => {
  it("toda ação carrega o porquê numérico, e nenhuma se repete", () => {
    const acoes = montarAcoes(
      {
        medido: true,
        acaoRecomendada: "priorizar decisores",
        causaProvavel: "15% de conversão contra 50%",
      } as never,
      {
        etapas: [],
        cegas: [],
        gargalos: [
          {
            etapa: "SDR",
            gravidade: {
              medido: true,
              valor: 0.7,
              pesoMedido: 80,
              parcelas: [
                { fator: "estouro do prazo", peso: 50, nota: 0.9, evidencia: "3 d contra 1 d" },
                { fator: "queda de conversão", peso: 30, nota: 0.2, evidencia: "15% contra 50%" },
              ],
            },
          },
        ],
      } as never,
    );

    expect(acoes).toHaveLength(2);
    expect(acoes[0]!.origem).toBe("diagnostico");
    expect(acoes[1]!.texto).toContain("SDR");
    // A parcela escolhida é a PIOR, não a primeira da lista.
    expect(acoes[1]!.porque).toBe("3 d contra 1 d");
    for (const a of acoes) expect(a.porque).toMatch(/\d/);
  });

  it("gargalo cego não gera ordem — gera silêncio", () => {
    const acoes = montarAcoes({ medido: false } as never, {
      etapas: [],
      cegas: ["HUNTER"],
      gargalos: [{ etapa: "HUNTER", gravidade: { medido: false, motivo: "semMedicao" } }],
    } as never);
    expect(acoes).toEqual([]);
  });
});

describe("a visão inteira", () => {
  it("banco vazio: nada medido, nenhuma ação, e as cinco etapas declaradas cegas", async () => {
    const v = await visaoDoSupervisor(bancoDeProva() as never, P);

    expect(v.saude).toMatchObject({ medido: false });
    expect(v.diagnostico).toMatchObject({ medido: false, motivo: "semBase" });
    expect(v.acoes).toEqual([]);
    expect(v.cegas).toEqual(["Hunter", "SDR", "Atendimento", "Vendas", "CRM"]);
    for (const d of v.funil.degraus) expect(d.volume.medido).toBe(false);
  });

  it("com operação, o funil, a saúde e o diagnóstico chegam juntos", async () => {
    const dia = (n: number) => new Date(DE.getTime() + n * 86_400_000);
    const antes = (n: number) => new Date(DE.getTime() - n * 86_400_000);

    const empresa = [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `ant-${i}`,
        descobertaEm: antes(5),
        estagio: "QUALIFICADA",
        prioridade: null,
        fonteDaDescoberta: "planilha",
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `at-${i}`,
        descobertaEm: dia(1),
        estagio: "PRONTA_PARA_SDR",
        prioridade: "ALTA",
        fonteDaDescoberta: "planilha",
      })),
    ];

    const db = bancoDeProva({
      empresa,
      siteLead: [
        { id: "l1", stage: "CONTATO", atendidoPor: "IA", createdAt: dia(1), primeiraRespostaEm: null, slaVenceEm: null, proximaAcaoEm: null, optOutAt: null },
      ],
      cliente: [
        { id: "c1", situacao: "ATIVO", ganhoEm: dia(1), ativadoEm: dia(2), canceladoEm: null },
      ],
    });

    const v = await visaoDoSupervisor(db as never, P);

    expect(v.funil.degraus[0]!.volume).toEqual({ medido: true, total: 12 });
    expect(v.funil.degraus[0]!.tendencia).toMatchObject({ medido: true, de: 30, para: 12 });
    // A queda aparece mais abaixo (prospects válidos), mas a causa é o topo:
    // a conversão daquela passagem não mudou — o volume que entrou nela mudou.
    expect(v.diagnostico).toMatchObject({ medido: true, foco: "PROSPECTS_VALIDOS" });
    if (v.diagnostico.medido) {
      expect(v.diagnostico.causa).toMatchObject({
        acima: "EMPRESAS_ENCONTRADAS",
        dominante: "volume",
      });
    }
    expect(v.saude).toMatchObject({ medido: true });
    if (v.saude.medido) expect(v.saude.pesoMedido).toBeLessThan(v.saude.pesoTotal);
    expect(v.acoes.length).toBeGreaterThan(0);
    for (const a of v.acoes) expect(a.porque).toMatch(/\d/);
  });
});
