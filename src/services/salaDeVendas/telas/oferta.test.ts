/**
 * O QUADRO DAS PROPOSTAS — e o pipeline que encolhe sozinho.
 *
 * `LeadProposta.valorMensalCent` é opcional e nasce vazio. Somar tratando
 * `null` como zero produz um número menor que a realidade **com cara de número
 * exato** — o pior tipo de erro, porque ninguém desconfia de um total.
 *
 * Por isso toda soma desta tela vem em três partes, e estes casos guardam as
 * três.
 */

import { describe, it, expect, vi } from "vitest";
import { panoramaDaOferta, ORDEM_DAS_SITUACOES } from "./oferta";
import {
  catalogoDePlanos,
  TRANSICOES_DA_PROPOSTA,
  SITUACOES_TERMINAIS_DA_PROPOSTA,
  VALIDADE_PADRAO_EM_DIAS,
  LIMITE_DE_DESCONTO_PCT,
} from "../propostas";

const AGORA = new Date("2026-09-17T12:00:00Z");

function banco(resp: {
  porSituacao?: { situacao: string; _count: { _all: number } }[];
  somas?: { situacao: string; _count: { _all: number }; _sum: { valorMensalCent: number | null } }[];
  semValor?: { situacao: string; _count: { _all: number } }[];
  vencendo?: unknown[];
}) {
  const groupBys: { where: unknown }[] = [];
  let chamada = 0;

  return {
    groupBys,
    findManyArgs: [] as unknown[],
    leadProposta: {
      groupBy: vi.fn(async (args: { where: unknown }) => {
        groupBys.push(args);
        chamada += 1;
        if (chamada === 1) return resp.porSituacao ?? [];
        if (chamada === 2) return resp.somas ?? [];
        return resp.semValor ?? [];
      }),
      findMany: vi.fn(async () => resp.vencendo ?? []),
    },
  };
}

describe("⭐ nenhuma proposta sem valor entra na soma", () => {
  it("a soma traz o dinheiro, quantas entraram e quantas ficaram de fora", async () => {
    const db = banco({
      porSituacao: [{ situacao: "ENVIADA", _count: { _all: 5 } }],
      somas: [{ situacao: "ENVIADA", _count: { _all: 2 }, _sum: { valorMensalCent: 39_800 } }],
      semValor: [{ situacao: "ENVIADA", _count: { _all: 3 } }],
    });

    const p = await panoramaDaOferta(db as never, { escopo: {}, agora: AGORA });
    const enviada = p.colunas.find((c) => c.situacao === "ENVIADA")!;

    expect(enviada.total).toBe(5);
    expect(enviada.soma.cents).toBe(39_800);
    expect(enviada.soma.comValor).toBe(2);
    expect(enviada.soma.semValor, "as três sem valor sumiram da tela").toBe(3);
    // A soma não pode ter sido calculada em cima das cinco.
    expect(enviada.soma.comValor + enviada.soma.semValor).toBe(enviada.total);
  });

  it("a consulta da soma EXCLUI valor nulo no banco, não depois", async () => {
    // Filtrar em memória devolveria o mesmo total por acaso hoje e erraria no
    // dia em que a consulta ganhasse paginação.
    const db = banco({});
    await panoramaDaOferta(db as never, { escopo: {}, agora: AGORA });

    expect(JSON.stringify(db.groupBys[1]!.where)).toContain('"not":null');
    expect(JSON.stringify(db.groupBys[2]!.where)).toContain('"valorMensalCent":null');
  });

  it("havendo proposta sem valor, a tela DIZ que ela ficou fora", async () => {
    const db = banco({
      porSituacao: [{ situacao: "RASCUNHO", _count: { _all: 2 } }],
      semValor: [{ situacao: "RASCUNHO", _count: { _all: 2 } }],
    });
    const p = await panoramaDaOferta(db as never, { escopo: {}, agora: AGORA });

    expect(p.naoMedido.join(" ")).toContain("FORA de toda soma");
  });

  it("quadro vazio é explicado — não é pipeline de R$ 0,00", async () => {
    const db = banco({});
    const p = await panoramaDaOferta(db as never, { escopo: {}, agora: AGORA });

    expect(p.totalDePropostas).toBe(0);
    expect(p.naoMedido.join(" ")).toContain("Nenhuma proposta registrada");
  });
});

describe("⭐ o escopo do lead vale para a proposta", () => {
  it("toda consulta de proposta carrega o recorte de quem perguntou", async () => {
    const db = banco({});
    await panoramaDaOferta(db as never, { escopo: { atendenteUserId: "user-diego" }, agora: AGORA });

    for (const [i, g] of db.groupBys.entries()) {
      expect(JSON.stringify(g.where), `groupBy ${i} sem escopo`).toContain("user-diego");
    }
    const args = db.leadProposta.findMany.mock.calls[0]![0] as { where: unknown };
    expect(JSON.stringify(args.where)).toContain("user-diego");
  });
});

describe("a máquina de estados é a real, não um desenho paralelo", () => {
  it("cada coluna leva as transições que o serviço de propostas declara", async () => {
    const db = banco({});
    const p = await panoramaDaOferta(db as never, { escopo: {}, agora: AGORA });

    for (const coluna of p.colunas) {
      expect(coluna.vaiPara).toEqual(TRANSICOES_DA_PROPOSTA[coluna.situacao]);
    }
  });

  it("as terminais são as terminais de verdade, e não vão a lugar nenhum", async () => {
    const db = banco({});
    const p = await panoramaDaOferta(db as never, { escopo: {}, agora: AGORA });

    for (const coluna of p.colunas) {
      expect(coluna.terminal).toBe(SITUACOES_TERMINAIS_DA_PROPOSTA.includes(coluna.situacao));
      if (coluna.terminal) expect(coluna.vaiPara).toEqual([]);
    }
  });

  it("a ordem das colunas cobre todas as situações da máquina", () => {
    expect([...ORDEM_DAS_SITUACOES].sort()).toEqual(Object.keys(TRANSICOES_DA_PROPOSTA).sort());
  });

  it("o relógio só olha proposta de pé — terminal não vence, já terminou", async () => {
    const db = banco({});
    await panoramaDaOferta(db as never, { escopo: {}, agora: AGORA });

    const args = JSON.stringify(db.leadProposta.findMany.mock.calls[0]![0]);
    expect(args).toContain("notIn");
    expect(args).toContain("ACEITA");
  });

  it("dias para vencer sai da data gravada, e fica negativo quando já venceu", async () => {
    const db = banco({
      vencendo: [
        {
          id: "p1",
          leadId: "l1",
          plano: "GROWTH",
          validaAte: new Date("2026-09-15T12:00:00Z"),
          valorMensalCent: null,
          lead: { nome: "Bar do Zé" },
        },
      ],
    });
    const p = await panoramaDaOferta(db as never, { escopo: {}, agora: AGORA });

    expect(p.vencendo[0]!.diasParaVencer).toBe(-2);
    expect(p.vencendo[0]!.lead).toBe("Bar do Zé");
    expect(p.vencendo[0]!.valorMensalCent, "valor ausente virou zero").toBeNull();
  });
});

describe("⭐ o catálogo é a fonte única de preço, não uma cópia", () => {
  it("os planos da tela são exatamente os do serviço de propostas", async () => {
    // Se alguém digitar um preço nesta tela, este caso cai. É o único jeito de
    // garantir que a proposta, o site e o cartão continuem dizendo o mesmo.
    const db = banco({});
    const p = await panoramaDaOferta(db as never, { escopo: {}, agora: AGORA });

    expect(p.catalogo).toEqual(catalogoDePlanos());
    expect(p.catalogo.length).toBeGreaterThan(0);
    for (const item of p.catalogo) {
      expect(item.doCicloCents, `${item.plano}/${item.ciclo} sem preço`).toBeGreaterThan(0);
    }
  });

  it("a alçada vem das constantes do serviço — o desconto do vendedor é zero", async () => {
    const db = banco({});
    const p = await panoramaDaOferta(db as never, { escopo: {}, agora: AGORA });

    expect(p.limiteDeDescontoPct).toBe(LIMITE_DE_DESCONTO_PCT);
    expect(p.limiteDeDescontoPct).toBe(0);
    expect(p.validadePadraoEmDias).toBe(VALIDADE_PADRAO_EM_DIAS);
  });
});
