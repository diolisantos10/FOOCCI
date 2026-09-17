/**
 * FOLLOW-UP E PÓS-VENDA — e o "não sei" somado dentro do número.
 *
 * ── O DEFEITO QUE ESTES CASOS GUARDAM ───────────────────────────────────────
 *
 * `NAO_MEDIDO` é o estado de quem nenhuma regra classificou, e `risco === null`
 * é a conta em que nenhum sinal pôde ser observado. Somar qualquer um dos dois
 * dentro de um total faz o painel mentir **sem ter uma única linha errada**: o
 * número fica maior, parece trabalho, e ninguém consegue apontar onde está o
 * erro. É o erro mais caro que esta tela poderia cometer, e o mais fácil.
 */

import { describe, it, expect, vi } from "vitest";
import { panoramaDoRelacionamento, estadosNaOrdemDasRegras, regrasNaTela } from "./relacionamento";
import { REGRAS, ESTADOS_QUE_PEDEM_ACAO, classificarFollowUp, fichaDaLinha } from "../crm/estadoDeFollowUp";
import { avaliarRiscoDeChurn, proximosPassosDoCliente } from "../crm/posVenda";

const AGORA = new Date("2026-09-17T12:00:00Z");

/** Uma linha de lead como o `SELECT_PARA_CLASSIFICAR` a devolve. */
function linha(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
    nome: "Bar do Zé",
    stage: "PRIMEIRO_CONTATO",
    temperatura: null,
    score: null,
    optOutAt: null,
    lastContactedAt: new Date("2026-09-01T12:00:00Z"),
    primeiraRespostaEm: null,
    ultimaMensagemEm: new Date("2026-09-01T12:00:00Z"),
    ultimaMensagemDeQuem: "SAIDA",
    propostas: [],
    compromissos: [],
    oportunidades: [],
    ...over,
  };
}

/** Uma conta de cliente como o `SELECT_DO_CLIENTE` a devolve. */
function conta(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    situacao: "EM_ATIVACAO",
    ganhoEm: new Date("2026-09-16T12:00:00Z"),
    ativadoEm: null,
    passosDeAtivacao: [],
    saude: null,
    saudeEm: null,
    nps: null,
    npsEm: null,
    riscoDeChurn: null,
    motivoDoRisco: null,
    ultimaCompraEm: null,
    recompras: 0,
    upsells: 0,
    receitaTotalCents: 0,
    ...over,
  };
}

function banco(resp: {
  linhas?: ReturnType<typeof linha>[];
  emSilencio?: number;
  cadencias?: unknown[];
  contas?: ReturnType<typeof conta>[];
}) {
  const leadWheres: unknown[] = [];
  return {
    leadWheres,
    siteLead: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        leadWheres.push(args.where);
        return resp.linhas ?? [];
      }),
      count: vi.fn(async (args: { where: unknown }) => {
        leadWheres.push(args.where);
        return resp.emSilencio ?? 0;
      }),
    },
    cadencia: { findMany: vi.fn(async () => resp.cadencias ?? []) },
    cliente: { findMany: vi.fn(async () => resp.contas ?? []) },
  };
}

describe("⭐ os catorze estados, derivados das regras", () => {
  it("são catorze, e NAO_MEDIDO é o último", () => {
    // Derivada de REGRAS de propósito: digitar a lista aqui criaria uma segunda
    // versão da verdade, e bastaria alguém acrescentar uma regra para a tela
    // passar a esconder um estado inteiro.
    const estados = estadosNaOrdemDasRegras();
    expect(estados).toHaveLength(14);
    expect(estados, "NAO_MEDIDO sumiu da lista").toContain("NAO_MEDIDO");
    expect(new Set(estados).size, "há estado repetido na lista").toBe(14);
  });

  it("a ordem é a ordem normativa das regras, não alfabética", () => {
    const daRegra: string[] = [];
    for (const r of REGRAS) if (!daRegra.includes(r.estado)) daRegra.push(r.estado);
    expect(estadosNaOrdemDasRegras().slice(0, daRegra.length)).toEqual(daRegra);
  });

  it("quem pede ação na tela é quem pede ação na doutrina", () => {
    for (const r of regrasNaTela()) {
      expect(r.pedeAcao).toBe(ESTADOS_QUE_PEDEM_ACAO.includes(r.estado));
    }
  });
});

describe("⭐ o não medido fica FORA do total que pede ação", () => {
  it("um contato que nenhuma regra classifica não infla o número de trabalho", async () => {
    // Uma ficha sem relógio nenhum: nada para medir.
    const semRelogio = linha({
      stage: "EM_QUALIFICACAO",
      lastContactedAt: null,
      ultimaMensagemEm: null,
      primeiraRespostaEm: null,
    });

    const db = banco({ linhas: [semRelogio] });
    const p = await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA });

    const naoMedido = p.estados.find((e) => e.estado === "NAO_MEDIDO")!;
    expect(naoMedido.medido).toBe(false);
    expect(p.naoMedidos).toBe(naoMedido.total);
    // O total que pede ação não pode conter o não medido.
    const somaPedindoAcao = p.estados
      .filter((e) => e.pedeAcao)
      .reduce((t, e) => t + e.total, 0);
    expect(p.pedindoAcao).toBe(somaPedindoAcao);
    expect(p.estados.find((e) => e.estado === "NAO_MEDIDO")!.pedeAcao).toBe(false);
  });

  it("havendo não medido, a tela escreve quantos são e que ficam de fora", async () => {
    const db = banco({
      linhas: [
        linha({ stage: "EM_QUALIFICACAO", lastContactedAt: null, ultimaMensagemEm: null }),
      ],
    });
    const p = await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA });

    if (p.naoMedidos > 0) {
      expect(p.naoMedido.join(" ")).toContain("FORA do total que pede ação");
    }
  });
});

describe("⭐ a contagem é a classificação real, não um rótulo paralelo", () => {
  it("cada contato cai no estado que `classificarFollowUp` devolve", async () => {
    // O teste que alcança o código que responde ao usuário: a tela não pode ter
    // a sua própria ideia de "sumiu". Ela conta o que a doutrina classifica.
    const linhas = [
      linha({ id: "a", optOutAt: null, stage: "NOVO" }),
      linha({
        id: "b",
        stage: "PROPOSTA_ENVIADA",
        primeiraRespostaEm: new Date("2026-08-01T12:00:00Z"),
        ultimaMensagemDeQuem: "ENTRADA",
        ultimaMensagemEm: new Date("2026-08-01T12:00:00Z"),
        lastContactedAt: new Date("2026-08-01T12:00:00Z"),
      }),
    ];

    const db = banco({ linhas });
    const p = await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA });

    const esperado = new Map<string, number>();
    for (const l of linhas) {
      const c = classificarFollowUp(fichaDaLinha(l as never), AGORA);
      esperado.set(c.estado, (esperado.get(c.estado) ?? 0) + 1);
    }

    for (const e of p.estados) {
      expect(e.total, `contagem divergente em ${e.estado}`).toBe(esperado.get(e.estado) ?? 0);
    }
    expect(p.contatosAnalisados).toBe(2);
  });

  it("⭐ nada é gravado na leitura — a tela não escreve na linha do tempo", async () => {
    // Gravar a cada F5 encheria a história de cada lead com uma nota por visita.
    const db = banco({ linhas: [linha()] }) as unknown as Record<string, unknown>;
    await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA });

    expect(
      (db as { siteLeadInteraction?: unknown }).siteLeadInteraction,
      "a leitura tentou escrever na linha do tempo",
    ).toBeUndefined();
  });

  it("quem pediu silêncio fica fora da análise e é contado à parte", async () => {
    const db = banco({ linhas: [linha()], emSilencio: 9 });
    const p = await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA });

    expect(p.emSilencio).toBe(9);
    expect(JSON.stringify(db.leadWheres[0]), "a varredura não excluiu quem pediu silêncio").toContain(
      '"optOutAt":null',
    );
  });

  it("o teto da varredura é declarado quando corta", async () => {
    const db = banco({ linhas: [linha({ id: "x" }), linha({ id: "y" })] });
    const p = await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA, limite: 2 });

    expect(p.contatosAnalisados).toBe(2);
    expect(p.naoMedido.join(" ")).toContain("teto de 2 contatos");
  });

  it("o escopo entra na varredura e na contagem de silêncio", async () => {
    const db = banco({ linhas: [] });
    await panoramaDoRelacionamento(db as never, {
      escopo: { atendenteUserId: "user-diego" },
      agora: AGORA,
    });

    for (const [i, w] of db.leadWheres.entries()) {
      expect(JSON.stringify(w), `consulta ${i} sem escopo`).toContain("user-diego");
    }
  });
});

describe("⭐ risco de churn não medido NÃO é risco zero", () => {
  it("conta sem ativação, sem saúde e sem NPS sai em `riscoNaoMedido`", async () => {
    const semSinal = conta();
    // A régua concorda: nenhum sinal observável.
    expect(avaliarRiscoDeChurn(semSinal as never, AGORA).risco).toBeNull();

    const db = banco({ contas: [semSinal] });
    const p = await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA });

    expect(p.riscoNaoMedido).toBe(1);
    expect(
      p.risco.some((f) => f.rotulo.includes("sem sinal")),
      "a conta não medida foi contada como 'olhado e sem sinal'",
    ).toBe(false);
    expect(p.naoMedido.join(" ")).toContain("não é risco zero");
  });

  it("conta olhada e sem sinal é outra coisa, e aparece separada", async () => {
    const olhada = conta({
      situacao: "ATIVO",
      ativadoEm: new Date("2026-09-10T12:00:00Z"),
      saude: 90,
      nps: 9,
    });
    expect(avaliarRiscoDeChurn(olhada as never, AGORA).risco).toBe(0);

    const db = banco({ contas: [olhada] });
    const p = await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA });

    expect(p.riscoNaoMedido).toBe(0);
    expect(p.risco.find((f) => f.rotulo.includes("sem sinal"))!.contas).toBe(1);
  });

  it("os marcos pendentes são os que a régua de pós-venda devolve", async () => {
    const atrasada = conta({ ganhoEm: new Date("2026-08-01T12:00:00Z") });
    const esperados = proximosPassosDoCliente(atrasada as never, AGORA).map((a) => a.marco);
    expect(esperados).toContain("ATIVACAO");

    const db = banco({ contas: [atrasada] });
    const p = await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA });

    expect(p.marcos.map((m) => m.marco).sort()).toEqual([...esperados].sort());
    expect(p.marcos.find((m) => m.marco === "ATIVACAO")!.exemplo).toContain("churn nasce");
  });

  it("sem cliente nenhum, a tela diz que a jornada ainda não começou", async () => {
    const db = banco({ contas: [] });
    const p = await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA });

    expect(p.clientes).toBe(0);
    expect(p.naoMedido.join(" ")).toContain("primeiro GANHO");
  });
});

describe("as cadências vêm do banco, com as condições declaradas", () => {
  it("cada cadência traz passos, inscritos e os estados que a acionam", async () => {
    const db = banco({
      cadencias: [
        {
          slug: "carrinho-abandonado",
          nome: "Carrinho abandonado",
          ativa: true,
          _count: { passos: 2 },
          em: [{ id: "x" }, { id: "y" }, { id: "z" }],
        },
      ],
    });
    const p = await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA });

    const c = p.cadencias[0]!;
    expect(c.passos).toBe(2);
    expect(c.inscritosAtivos).toBe(3);
    expect(c.acionadaPor).toContain("CARRINHO_ABANDONADO");
    expect(c.condicoes.length, "as condições declaradas do catálogo sumiram").toBeGreaterThan(0);
  });

  it("sem cadência cadastrada, a tela diz que o motor está desligado", async () => {
    const db = banco({ cadencias: [] });
    const p = await panoramaDoRelacionamento(db as never, { escopo: {}, agora: AGORA });

    expect(p.naoMedido.join(" ")).toContain("Nenhuma cadência cadastrada");
  });
});
