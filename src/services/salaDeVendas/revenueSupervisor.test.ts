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

/**
 * ⭐ A TABELA DA META, pendurada no banco de prova SEM tocá-lo.
 *
 * `bancoDeProva` é compartilhado por meia dúzia de frentes e não conhece
 * `meta_de_receita_mensal`. Em vez de mexer no arquivo de todo mundo, o teste
 * pendura aqui a única leitura que `metaDoMesCorrente` faz — e pendura de
 * verdade: `findUnique` procura pela competência, como a consulta real.
 */
function comMeta<T extends object>(db: T, metas: Array<{ competencia: string; valorCentavos: number }>) {
  return {
    ...db,
    metaDeReceitaMensal: {
      async findUnique(args: { where: { competencia: string } }) {
        const m = metas.find((x) => x.competencia === args.where.competencia);
        return m
          ? {
              id: `meta-${m.competencia}`,
              ...m,
              definidoPorId: null,
              definidoPorNome: "CEO (decisão de 19/09/2026)",
              atualizadoEm: new Date("2026-09-19T00:00:00Z"),
            }
          : null;
      },
    },
  };
}

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
    const v = await visaoDoSupervisor(comMeta(bancoDeProva(), []) as never, P);

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

    const v = await visaoDoSupervisor(comMeta(db, []) as never, P);

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


/**
 * ⭐ A META NA VISÃO DO SUPERVISOR (19/09/2026).
 *
 * A tela 13 foi construída sem "Meta do mês" porque a meta não existia em lugar
 * nenhum do sistema. Agora existe — e o que estes casos guardam é a diferença
 * entre "ninguém decidiu a meta" e "a meta é zero", que a barra de progresso
 * apagaria se ninguém estivesse olhando.
 */
describe("⭐ a meta do mês dentro da visão", () => {
  it("sem meta cadastrada, o progresso NÃO é zero — é não medido, com motivo", async () => {
    const v = await visaoDoSupervisor(comMeta(bancoDeProva(), []) as never, P);

    expect(v.metaDoMes.meta).toMatchObject({ definida: false, motivo: "semMeta" });
    expect(v.metaDoMes.progresso).toMatchObject({ medido: false, motivo: "semMeta" });
    expect(v.metaDoMes.progresso).not.toMatchObject({ medido: true });
  });

  it("com meta e receita, a porcentagem é a da conta — e a competência é a de `agora`", async () => {
    const db = bancoDeProva({
      leadProposta: [
        { id: "p1", leadId: "l1", situacao: "ACEITA", respondidaEm: new Date("2026-09-05T00:00:00Z"), valorMensalCent: 4_000_000 },
        { id: "p2", leadId: "l2", situacao: "ACEITA", respondidaEm: new Date("2026-09-14T00:00:00Z"), valorMensalCent: 4_000_000 },
      ],
    });

    const v = await visaoDoSupervisor(
      comMeta(db, [{ competencia: "2026-09", valorCentavos: 10_000_000 }]) as never,
      P,
    );

    expect(v.metaDoMes.competencia).toBe("2026-09");
    expect(v.metaDoMes.progresso).toMatchObject({ medido: true, fracao: 0.8 });
  });

  it("⛔ a visão não carrega previsão nem projeção de receita", async () => {
    const v = await visaoDoSupervisor(comMeta(bancoDeProva(), []) as never, P);
    const chaves = Object.keys(v.metaDoMes).join(",").toLowerCase();
    expect(chaves).not.toContain("previs");
    expect(chaves).not.toContain("projec");
  });
});
