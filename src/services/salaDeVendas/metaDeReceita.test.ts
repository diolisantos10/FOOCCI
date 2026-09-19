/**
 * A META DE RECEITA — e as três coisas que ela não pode deixar acontecer.
 *
 *   1. mês sem meta virar 0%;
 *   2. meta cadastrada calcular percentual errado;
 *   3. trocar a meta de um mês mexer em outro.
 *
 * A terceira é a razão de a tabela ter uma linha por competência em vez do
 * `singleton` que o resto da casa usa para configuração: com um valor só,
 * mudar a meta de outubro reescreveria o "% da meta" de setembro depois do mês
 * fechado.
 */

import { describe, it, expect } from "vitest";
import {
  competenciaDe,
  competenciaValida,
  definirMeta,
  emReais,
  janelaDaCompetencia,
  lerMeta,
  progressoDaMeta,
  type MetaDoMes,
} from "./metaDeReceita";

/** Um banco mínimo, feito para esta tabela: duas listas e o suficiente delas. */
function banco() {
  const metas: Array<Record<string, unknown>> = [];
  const historico: Array<Record<string, unknown>> = [];

  const db = {
    metaDeReceitaMensal: {
      async findUnique(a: { where: { competencia: string } }) {
        // Cópia, como o Prisma devolve: a linha viva deixaria `definirMeta`
        // ler o valor JÁ atualizado e gravar "anterior = novo" na trilha.
        const m = metas.find((x) => x.competencia === a.where.competencia);
        return m ? { ...m } : null;
      },
      async findMany() {
        return [...metas].sort((x, y) => String(y.competencia).localeCompare(String(x.competencia)));
      },
      async upsert(a: { where: { competencia: string }; create: Record<string, unknown>; update: Record<string, unknown> }) {
        const alvo = metas.find((m) => m.competencia === a.where.competencia);
        if (alvo) {
          Object.assign(alvo, a.update, { atualizadoEm: new Date() });
          return alvo;
        }
        const nova = { id: `meta-${a.where.competencia}`, atualizadoEm: new Date(), ...a.create };
        metas.push(nova);
        return nova;
      },
    },
    metaDeReceitaHistorico: {
      async create(a: { data: Record<string, unknown> }) {
        const nova = { id: `h-${historico.length + 1}`, alteradoEm: new Date(), ...a.data };
        historico.push(nova);
        return nova;
      },
      async findMany() {
        return [...historico].reverse();
      },
    },
    async $transaction<T>(fn: (tx: typeof db) => Promise<T>) {
      return fn(db);
    },
  };

  return { db, metas, historico };
}

const CEO = { alteradoPorId: "u-ceo", alteradoPorNome: "Diego" };

describe("a competência", () => {
  it("nasce da data em UTC, no formato AAAA-MM", () => {
    expect(competenciaDe(new Date("2026-09-19T12:00:00Z"))).toBe("2026-09");
    expect(competenciaDe(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });

  it("a janela é o mês inteiro, aberta no fim", () => {
    expect(janelaDaCompetencia("2026-09")).toEqual({
      de: new Date("2026-09-01T00:00:00Z"),
      ate: new Date("2026-10-01T00:00:00Z"),
    });
  });

  it("recusa formato que não é AAAA-MM", () => {
    expect(competenciaValida("2026-09")).toBe(true);
    expect(competenciaValida("2026-13")).toBe(false);
    expect(competenciaValida("setembro")).toBe(false);
  });
});

describe("⛔ mês sem meta não vira 0%", () => {
  it("progresso de mês sem meta é não medido, com motivo", () => {
    const sem: MetaDoMes = { definida: false, competencia: "2026-10", motivo: "semMeta" };
    const p = progressoDaMeta(sem, { medido: true, centavos: 5_000_000, propostas: 3 });

    expect(p.medido).toBe(false);
    if (!p.medido) {
      expect(p.motivo).toBe("semMeta");
      expect(p.detalhe).toContain("2026-10");
    }
  });

  it("meta cadastrada com receita NÃO medida também não vira 0%", () => {
    const com: MetaDoMes = {
      definida: true,
      competencia: "2026-09",
      centavos: 10_000_000,
      definidoPorNome: "Diego",
      definidoPorId: "u-ceo",
      atualizadoEm: new Date(),
    };
    const p = progressoDaMeta(com, { medido: false, motivo: "semPropostas" });

    expect(p).toMatchObject({ medido: false, motivo: "receitaNaoMedida" });
  });
});

describe("meta cadastrada calcula a porcentagem certa", () => {
  it("R$ 80.000 contra R$ 100.000 são 80%", async () => {
    const { db } = banco();
    await definirMeta(db as never, { competencia: "2026-09", valorCentavos: 10_000_000, ...CEO });

    const meta = await lerMeta(db as never, "2026-09");
    const p = progressoDaMeta(meta, { medido: true, centavos: 8_000_000, propostas: 5 });

    expect(p).toEqual({
      medido: true,
      fracao: 0.8,
      metaCentavos: 10_000_000,
      receitaCentavos: 8_000_000,
    });
  });

  it("passar da meta passa de 1 — a fração não é aparada na origem", () => {
    const com: MetaDoMes = {
      definida: true,
      competencia: "2026-09",
      centavos: 10_000_000,
      definidoPorNome: "Diego",
      definidoPorId: null,
      atualizadoEm: new Date(),
    };
    const p = progressoDaMeta(com, { medido: true, centavos: 12_000_000, propostas: 7 });
    expect(p).toMatchObject({ medido: true, fracao: 1.2 });
  });
});

describe("⛔ trocar a meta de um mês não altera outro", () => {
  it("outubro muda e setembro fica exatamente como estava", async () => {
    const { db } = banco();

    await definirMeta(db as never, { competencia: "2026-09", valorCentavos: 10_000_000, ...CEO });
    await definirMeta(db as never, { competencia: "2026-10", valorCentavos: 10_000_000, ...CEO });

    await definirMeta(db as never, { competencia: "2026-10", valorCentavos: 25_000_000, ...CEO });

    const setembro = await lerMeta(db as never, "2026-09");
    const outubro = await lerMeta(db as never, "2026-10");

    expect(setembro).toMatchObject({ definida: true, centavos: 10_000_000 });
    expect(outubro).toMatchObject({ definida: true, centavos: 25_000_000 });

    // E o percentual de setembro continua o mesmo depois da mexida em outubro.
    expect(progressoDaMeta(setembro, { medido: true, centavos: 8_000_000, propostas: 5 })).toMatchObject({
      fracao: 0.8,
    });
  });

  it("a troca registra quem, o valor anterior e o novo", async () => {
    const { db, historico } = banco();

    await definirMeta(db as never, { competencia: "2026-09", valorCentavos: 10_000_000, ...CEO });
    await definirMeta(db as never, {
      competencia: "2026-09",
      valorCentavos: 12_000_000,
      ...CEO,
      motivo: "time novo",
    });

    expect(historico).toHaveLength(2);
    expect(historico[0]).toMatchObject({
      valorAnteriorCentavos: null,
      valorNovoCentavos: 10_000_000,
      alteradoPorNome: "Diego",
    });
    expect(historico[1]).toMatchObject({
      valorAnteriorCentavos: 10_000_000,
      valorNovoCentavos: 12_000_000,
      motivo: "time novo",
    });
  });
});

describe("o que a escrita recusa", () => {
  it("competência fora do formato", async () => {
    const { db } = banco();
    const r = await definirMeta(db as never, { competencia: "setembro", valorCentavos: 1, ...CEO });
    expect(r).toMatchObject({ ok: false, causa: "competenciaInvalida" });
  });

  it("⛔ meta zero ou negativa — 'sem meta' e 'meta zero' não podem virar a mesma coisa", async () => {
    const { db } = banco();
    expect(await definirMeta(db as never, { competencia: "2026-09", valorCentavos: 0, ...CEO })).toMatchObject({
      ok: false,
      causa: "valorInvalido",
    });
    expect(await definirMeta(db as never, { competencia: "2026-09", valorCentavos: -1, ...CEO })).toMatchObject({
      ok: false,
      causa: "valorInvalido",
    });
  });
});

describe("a semente do CEO", () => {
  it("R$ 100.000 em centavos é o que a migração grava", () => {
    expect(emReais(10_000_000)).toContain("100.000,00");
  });
});
