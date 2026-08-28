/**
 * A CADEIA: o caderno de lacunas chega ao painel do gerente?
 *
 * ── POR QUE ESTE ARQUIVO EXISTE SEPARADO ────────────────────────────────────
 *
 * `lacunas.test.ts` prova que a lista é montada certo. Ele passaria inteiro com
 * `cadernoDeLacunas` **não sendo chamado por ninguém** — e esse é, medido, o
 * defeito mais frequente desta casa: peça pronta, testada, sem chamador. Já
 * aconteceu quatro vezes; da última, um parâmetro trocado por `null` não
 * quebrou um único teste.
 *
 * Então este teste não olha o conteúdo da lista. Ele olha uma coisa só: que
 * `visaoDoGerente` — a função que a rota do painel chama de verdade — devolve
 * `lacunas` no objeto. É a asserção que morre se alguém remover a linha.
 */

import { describe, it, expect } from "vitest";
import { visaoDoGerente } from "./painel";

/**
 * Um banco que responde vazio a tudo.
 *
 * Proxy em vez de objeto escrito à mão porque `visaoDoGerente` toca uma dúzia
 * de tabelas por caminhos indiretos (QA, agenda, distribuição, follow-up), e
 * uma lista escrita à mão viraria manutenção sem virar garantia: cada tabela
 * nova quebraria este teste por motivo nenhum.
 */
function bancoVazio() {
  const tabela: Record<string, unknown> = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    count: async () => 0,
    groupBy: async () => [],
    aggregate: async () => ({ _avg: {}, _sum: {}, _count: {}, _min: {}, _max: {} }),
  };

  return new Proxy(
    {},
    {
      get: (_alvo, prop) => {
        if (typeof prop === "symbol" || prop === "then") return undefined;
        if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return async () => [];
        return tabela;
      },
    },
  ) as never;
}

const PERIODO = {
  de: new Date("2026-08-01T00:00:00Z"),
  ate: new Date("2026-09-01T00:00:00Z"),
  agora: new Date("2026-08-28T12:00:00Z"),
};

describe("⭐ o caderno de lacunas tem chamador", () => {
  it("visaoDoGerente devolve `lacunas` — remover a linha reprova aqui", async () => {
    const visao = await visaoDoGerente(bancoVazio(), PERIODO);

    expect(visao).toHaveProperty("lacunas");
    expect(visao.lacunas).toBeDefined();
  });

  it("banco vazio → o painel diz 'não mediu', e não '0 lacunas'", async () => {
    // A distinção inteira do caderno, vista de cima: sem nenhum atendimento da
    // IA no período, o gerente não pode ler "o agente respondeu tudo".
    const visao = await visaoDoGerente(bancoVazio(), PERIODO);

    expect(visao.lacunas).toEqual({ medido: false, motivo: "semAtendimento" });
  });

  it("o painel continua entregando o resto — a lacuna não derrubou nada", async () => {
    // Se `cadernoDeLacunas` lançasse, o `Promise.all` levaria o painel inteiro
    // junto. Um indicador novo não pode apagar a tela do gerente.
    const visao = await visaoDoGerente(bancoVazio(), PERIODO);

    expect(visao.agora).toBeDefined();
    expect(visao.iaVsHumano).toBeDefined();
    expect(visao.periodo).toEqual({ de: PERIODO.de, ate: PERIODO.ate });
  });
});
