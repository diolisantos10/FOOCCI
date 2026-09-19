/**
 * O MOTOR DE DECISÃO — e o zero que tranquiliza.
 *
 * ── O DEFEITO QUE ESTES CASOS EXISTEM PARA IMPEDIR ──────────────────────────
 *
 * Um painel de roteamento mente de dois jeitos, e os dois são bonitos na tela:
 *
 *  · **desenha regra que não roda.** O desenho lista onze critérios; seis não
 *    existem. Pintá-los todos de verde ensina o gerente a contar com um
 *    roteamento por idioma que nunca existiu — e o erro só aparece num cliente
 *    perdido, sem rastro.
 *  · **mostra "0 SLAs estourados" com o relógio desligado.** É exatamente a
 *    tela que uma operação saudável mostraria, e as duas situações são opostas.
 */

import { describe, it, expect, vi } from "vitest";
import {
  panoramaDoRoteamento,
  simularCascata,
  REGRAS_QUE_EXISTEM,
  PREVISTAS_NAO_CONSTRUIDAS,
  MODO_PADRAO,
} from "./roteamento";
import type { CandidatoADistribuicao } from "../distribuicao";

const AGORA = new Date("2026-09-17T12:00:00Z");

function pessoa(over: Record<string, unknown> = {}) {
  return {
    id: "u1",
    nome: "Ana",
    disponibilidade: {
      estado: "DISPONIVEL",
      capacidade: 10,
      especialidades: [],
      regioes: [],
      pausadoAte: null,
    },
    ...over,
  };
}

function banco(resp: {
  distribuicao?: string | null;
  pessoas?: ReturnType<typeof pessoa>[];
  cargas?: { atendenteUserId: string; _count: { _all: number } }[];
  ultimos?: { atendenteUserId: string; _max: { atendenteDesde: Date | null } }[];
  semResponsavel?: number;
  comPrazo?: number;
  estourados?: { id: string; slaVenceEm: Date }[];
  fila?: Record<string, unknown>[];
  logs?: Record<string, unknown>[];
}) {
  const counts = [resp.semResponsavel ?? 0, resp.comPrazo ?? 0];
  const countWheres: unknown[] = [];

  return {
    countWheres,
    sdrIaConfig: {
      findUnique: vi.fn(async () =>
        resp.distribuicao === null || resp.distribuicao === undefined
          ? null
          : { distribuicao: resp.distribuicao },
      ),
    },
    internalUser: { findMany: vi.fn(async () => resp.pessoas ?? []) },
    siteLead: {
      count: vi.fn(async (args: { where: unknown }) => {
        countWheres.push(args.where);
        return counts.shift() ?? 0;
      }),
      groupBy: vi.fn(async (args: { by: string[]; _max?: unknown }) =>
        args._max ? (resp.ultimos ?? []) : (resp.cargas ?? []),
      ),
      // Duas leituras diferentes passam por aqui: a FILA do preview (que pede
      // `oportunidades` no select) e a consulta de SLA estourado. Distinguir
      // pelo select é o que impede o falso de devolver a lista errada — e um
      // falso que devolve a lista errada esconde justamente o defeito que
      // estes casos existem para pegar.
      findMany: vi.fn(async (args: { select?: Record<string, unknown> }) =>
        args?.select && "oportunidades" in args.select
          ? (resp.fila ?? [])
          : (resp.estourados ?? []),
      ),
    },
    siteLeadInteraction: {
      findMany: vi.fn(async () => resp.logs ?? []),
    },
  };
}

/** Um lead da fila, do jeito que o Prisma o devolve para o preview. */
function leadNaFila(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
    codigo: "A7K2M",
    nome: "Restaurante do Zé",
    cidade: null,
    createdAt: new Date("2026-09-17T10:00:00Z"),
    prioritario: false,
    temperatura: null,
    score: null,
    atendidoPor: "NINGUEM",
    oportunidades: [],
    ...over,
  };
}

describe("⭐ as duas listas nunca se confundem", () => {
  it("nenhum critério aparece como construído E como previsto", () => {
    // O caso que carrega o arquivo. No dia em que alguém construir "VIP", tem
    // que TIRAR da lista de previstos — senão a tela diz as duas coisas.
    const existem = new Set(REGRAS_QUE_EXISTEM.map((r) => r.criterio.toLowerCase()));
    for (const p of PREVISTAS_NAO_CONSTRUIDAS) {
      expect(existem.has(p.criterio.toLowerCase()), `"${p.criterio}" está nas duas listas`).toBe(
        false,
      );
    }
  });

  it("toda regra que existe aponta o arquivo e a função que a executam", () => {
    // Regra de tela que ninguém consegue localizar no código é promessa, não
    // mecanismo. O endereço é o que permite conferir sem acreditar.
    for (const r of REGRAS_QUE_EXISTEM) {
      expect(r.ondeMora, `"${r.criterio}" não diz onde mora`).toMatch(/\.ts · \w/);
    }
  });

  it("toda regra prevista diz o que falta para ela existir", () => {
    for (const p of PREVISTAS_NAO_CONSTRUIDAS) {
      expect(p.oQueFalta.trim().length, `"${p.criterio}" não explica o que falta`).toBeGreaterThan(
        20,
      );
    }
  });

  it("os critérios do desenho que não existem estão TODOS declarados", () => {
    const previstos = PREVISTAS_NAO_CONSTRUIDAS.map((p) => p.criterio.toLowerCase()).join(" ");
    for (const criterio of ["produto", "idioma", "valor", "carteira", "vip", "fallback", "sla"]) {
      expect(previstos, `o desenho pede "${criterio}" e a tela não diz que ele falta`).toContain(
        criterio,
      );
    }
  });
});

describe("⭐ o SLA não mostra zero com o relógio desligado", () => {
  it("sem nenhum lead com prazo, `estourados` é null e o motivo é escrito", async () => {
    const db = banco({ comPrazo: 0 });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.sla.estourados, "zero aqui é indistinguível de 'tudo em dia'").toBeNull();
    expect(p.sla.naoMedido).toContain("slaVenceEm");
    expect(p.naoMedido.join(" ")).toContain("slaVenceEm");
    // E nem gastou uma consulta para contar estouro de um relógio parado.
    // (a fila do preview também usa `findMany` — o que não pode existir é uma
    // chamada que filtre por `slaVenceEm`.)
    const consultasDeSla = db.siteLead.findMany.mock.calls.filter((c) =>
      JSON.stringify(c[0] ?? {}).includes("slaVenceEm"),
    );
    expect(consultasDeSla).toHaveLength(0);
  });

  it("havendo prazo gravado, conta o estouro de verdade", async () => {
    const db = banco({
      comPrazo: 4,
      estourados: [
        { id: "l1", slaVenceEm: new Date("2026-09-17T11:00:00Z") },
        { id: "l2", slaVenceEm: new Date("2026-09-17T10:00:00Z") },
      ],
    });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.sla.comPrazo).toBe(4);
    expect(p.sla.estourados).toBe(2);
    expect(p.sla.naoMedido).toBeNull();
  });
});

describe("⭐ o modo e a aptidão vêm do banco", () => {
  it("sem configuração gravada, o modo é o padrão — e a tela diz que é padrão", async () => {
    const db = banco({ distribuicao: null });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.modo).toBe(MODO_PADRAO);
    expect(p.modoEhPadrao).toBe(true);
    expect(p.naoMedido.join(" ")).toContain("MANUAL");
  });

  it("com configuração gravada, é ela que vale", async () => {
    const db = banco({ distribuicao: "RODIZIO" });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.modo).toBe("RODIZIO");
    expect(p.modoEhPadrao).toBe(false);
  });

  it("a aptidão é a MESMA que a distribuição usaria — offline não é apto", async () => {
    const db = banco({
      pessoas: [
        pessoa(),
        pessoa({
          id: "u2",
          nome: "Bruno",
          disponibilidade: {
            estado: "OFFLINE",
            capacidade: 10,
            especialidades: [],
            regioes: [],
            pausadoAte: null,
          },
        }),
      ],
      cargas: [{ atendenteUserId: "u1", _count: { _all: 2 } }],
    });

    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.aptos).toBe(1);
    const bruno = p.atendentes.find((a) => a.userId === "u2")!;
    expect(bruno.apto).toBe(false);
    expect(bruno.motivo).toBe("offline");
    // A carga é a contada agora, não um contador guardado na linha do SDR.
    expect(p.atendentes.find((a) => a.userId === "u1")!.carga).toBe(2);
  });

  it("quem está no limite sai da roda, e o painel diz por quê", async () => {
    const db = banco({
      pessoas: [
        pessoa({
          disponibilidade: {
            estado: "DISPONIVEL",
            capacidade: 3,
            especialidades: [],
            regioes: [],
            pausadoAte: null,
          },
        }),
      ],
      cargas: [{ atendenteUserId: "u1", _count: { _all: 3 } }],
    });

    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.aptos).toBe(0);
    expect(p.porQueNinguemEstaApto).toContain("no limite");
  });

  it("time vazio não é 'todo mundo ocupado' — é motor sem para quem distribuir", async () => {
    const db = banco({ pessoas: [] });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.atendentes).toEqual([]);
    expect(p.naoMedido.join(" ")).toContain("Nenhum atendente com disponibilidade");
  });

  it("a fila sem responsável só conta lead em aberto", async () => {
    const db = banco({ semResponsavel: 7 });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.semResponsavel).toBe(7);
    const w = JSON.stringify(db.countWheres[0]);
    expect(w).toContain("NINGUEM");
    expect(w).toContain("GANHO");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ⭐ O PREVIEW EM TEMPO REAL

   A peça que a auditoria chamou de "a mais valiosa e construível hoje". Ela
   tem UM jeito de estragar tudo: encher a tela com o lead de exemplo do
   desenho (Ana Souza, R$ 12.000). Um número plausível numa tela bonita é o
   pior defeito desta casa, porque ninguém desconfia dele — e no segundo print
   ele já virou o número que a operação repete em reunião.
   ═══════════════════════════════════════════════════════════════════════════ */
describe("⭐ o preview mostra a fila real, ou não mostra nada", () => {
  it("fila vazia não vira lead de exemplo — vira o vazio com o motivo", async () => {
    const db = banco({ fila: [] });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.preview).toEqual([]);
    expect(p.previewVazio).toBeTruthy();
    expect(p.previewVazio).toContain("fila REAL");
  });

  it("campo sem fonte vem `null`, nunca um valor plausível", async () => {
    // O lead real não tem oportunidade: não há produto nem valor. A tela
    // escreve "não informado"; o serviço jamais inventa o número.
    const db = banco({ fila: [leadNaFila()] });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    const l = p.preview[0]!;
    expect(l.produto).toBeNull();
    expect(l.valorCents).toBeNull();
    expect(l.regiao).toBeNull();
    expect(l.interesse).toBeNull();
    expect(l.nome).toBe("Restaurante do Zé");
  });

  it("havendo oportunidade, produto e valor saem DELA — e de mais lugar nenhum", async () => {
    const db = banco({
      fila: [
        leadNaFila({
          cidade: "Belo Horizonte",
          oportunidades: [{ valorPotencialCents: 123400, produtoDeInteresse: "Plano Pro" }],
        }),
      ],
    });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.preview[0]!.valorCents).toBe(123400);
    expect(p.preview[0]!.produto).toBe("Plano Pro");
    expect(p.preview[0]!.regiao).toBe("Belo Horizonte");
  });

  it("em modo MANUAL nenhum cartão promete roteamento — e o motivo é dito", async () => {
    const db = banco({ pessoas: [pessoa()], fila: [leadNaFila()] });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.modo).toBe("MANUAL");
    expect(p.preview[0]!.decisao.roteia).toBe(false);
    expect(p.preview[0]!.decisao.regra).toBe("Manual (fila aberta)");
  });

  it("sem decisão gravada, o log fica vazio com o motivo — nunca com decisão inventada", async () => {
    const db = banco({ logs: [] });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.logs).toEqual([]);
    expect(p.logsVazio).toBeTruthy();
  });

  it("o log sai da linha que a própria distribuição gravou", async () => {
    const db = banco({
      logs: [
        {
          leadId: "l9",
          createdAt: new Date("2026-09-17T09:00:00Z"),
          nota: "Distribuído automaticamente: é a vez dele no rodízio.",
          lead: { nome: "Bar do João" },
        },
      ],
    });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.logs[0]!.leadNome).toBe("Bar do João");
    expect(p.logs[0]!.nota).toContain("rodízio");
    expect(JSON.stringify(db.siteLeadInteraction.findMany.mock.calls[0])).toContain("distribuicao");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   A CASCATA — por que ela não pode ser uma chamada isolada por lead
   ═══════════════════════════════════════════════════════════════════════════ */
describe("⭐ a cascata conta a carga que ela mesma acrescenta", () => {
  function candidato(over: Partial<CandidatoADistribuicao> = {}): CandidatoADistribuicao {
    return {
      userId: "u1",
      nome: "Ana",
      estado: "DISPONIVEL",
      capacidade: 10,
      carga: 0,
      especialidades: [],
      regioes: [],
      pausadoAte: null,
      ultimoRecebimentoEm: null,
      ...over,
    };
  }

  it("não entrega os três leads à mesma pessoa", () => {
    // O defeito exato que este caso impede: `escolherResponsavel` chamado três
    // vezes com o MESMO estado devolve o mesmo nome três vezes, e o gerente lê
    // na tela uma concentração que não aconteceria na vida.
    const time = [
      candidato({ userId: "u1", nome: "Ana" }),
      candidato({ userId: "u2", nome: "Bruno" }),
      candidato({ userId: "u3", nome: "Carla" }),
    ];

    const d = simularCascata("RODIZIO", time, 3, AGORA);
    const nomes = d.map((x) => (x.roteia ? x.paraNome : "-"));

    expect(new Set(nomes).size, `cascata concentrou: ${nomes.join(", ")}`).toBe(3);
  });

  it("não muda o time que recebeu — a simulação não tem efeito colateral", () => {
    const time = [candidato()];
    simularCascata("RODIZIO", time, 4, AGORA);

    expect(time[0]!.carga, "a simulação mexeu na carga real do candidato").toBe(0);
    expect(time[0]!.ultimoRecebimentoEm).toBeNull();
  });

  it("quando ninguém está apto, cada linha diz o motivo em vez de sumir", () => {
    const d = simularCascata("RODIZIO", [candidato({ estado: "OFFLINE" })], 2, AGORA);

    expect(d).toHaveLength(2);
    expect(d[0]!.roteia).toBe(false);
    expect(d[0]!.porque).toContain("offline");
  });
});
