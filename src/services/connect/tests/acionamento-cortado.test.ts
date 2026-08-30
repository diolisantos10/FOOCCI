/**
 * ⭐ O TESTE PRINCIPAL — CORTAR O ACIONAMENTO DE PROPÓSITO.
 *
 * A medição que originou o Dioli Connect foi esta: um mecanismo de acionamento
 * da plataforma **devolve "sucesso" e não entrega nada**. Um despachante que
 * confirma sem entregar é pior que a ausência de despachante — o que falha alto
 * a gente conserta; este deixa todo mundo achando que despachou.
 *
 * Então a prova desta obra não é que ela funciona quando tudo dá certo. É que
 * **quando o acionamento é cortado, ela diz que foi cortado.** Cada teste aqui
 * corta o fio num ponto diferente da corrente — o agente, a gravação, a
 * releitura, o conteúdo do que voltou — e cobra sempre as mesmas três coisas:
 *
 *   1. o estado é `nao_verificavel`;
 *   2. o HTTP **não** é 2xx (é 502);
 *   3. a caixa NÃO diz que gravou, e nunca diz `acionado`.
 *
 * A ordem dos cortes segue a ordem da corrente, e o último é o mais importante:
 * o executor jura que gravou, e o banco não devolve a linha. É exatamente o
 * defeito que este projeto existe para matar, reproduzido de propósito.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SimulationRunResult } from "@/services/simulation/types";
import { conferirPedido, type PedidoDeDespacho } from "@/services/connect/contrato";
import { despachar, type DependenciasDoDespacho } from "@/services/connect/despacho";
import { sementeDoTurno, type ArmazemDoConnect, type LinhaDeRodadaLida } from "@/services/connect/armazem";
import { DIRETOR_GERAL, GERENTE_DO_PRODUTO } from "@/services/connect/cadastro";
import { CABECALHO_DO_SEGREDO } from "@/services/connect/porta";

// ── O banco de mentira da metade HTTP (só o laboratório, como sempre). ─────
const memoria = vi.hoisted(() => ({
  runs: [] as Record<string, unknown>[],
  cenarios: [] as Record<string, unknown>[],
  /** ⭐ A chave do corte: quando ligado, a releitura devolve `null`. */
  releituraCortada: { valor: false },
}));

const db = vi.hoisted(() => ({
  agentSimulationRun: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const linha = { id: `run-${memoria.runs.length + 1}`, ...data };
      memoria.runs.push(linha);
      return { id: linha.id };
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      if (memoria.releituraCortada.valor) return null; // o corte
      const r = memoria.runs.find((x) => x.id === where.id);
      return r ? { ...r, scenarios: memoria.cenarios.filter((c) => c.runId === r.id), opportunities: [] } : null;
    }),
    findMany: vi.fn(async () => []),
  },
  agentSimulationScenario: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const linha = { id: `cen-${memoria.cenarios.length + 1}`, ...data };
      memoria.cenarios.push(linha);
      return { id: linha.id };
    }),
  },
  agentSimulationOpportunity: { createMany: vi.fn(async () => ({ count: 0 })) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { POST } from "@/app/api/connect/despacho/route";

const SEGREDO = "segredo-do-dioli-connect-no-foocci";
const FIO = "connect:foocci:fio-de-teste";

/** O pedido, conferido de verdade — nada de montar `PedidoConferido` à mão. */
function pedidoLimpo(extra: Record<string, unknown> = {}) {
  const bruto: PedidoDeDespacho = {
    modo: "homologacao",
    sintetico: true,
    acao: "receber",
    de: DIRETOR_GERAL,
    para: GERENTE_DO_PRODUTO,
    mensagem: "Rode o ensaio e me diga o que reprovou.",
    fio: FIO,
    cenarios: 2,
    ...extra,
  };
  const c = conferirPedido(bruto);
  if (!c.ok) throw new Error(`o corpo do teste não passa no contrato: ${c.motivo}`);
  return c.pedido;
}

/** Uma rodada que o agente devolveu com sucesso — o resto é o que se corta. */
function rodadaBoa(): SimulationRunResult {
  const agora = new Date("2026-08-30T12:00:00.000Z").toISOString();
  return {
    agentSlug: "waiter",
    departmentSlug: "waiter",
    restaurantId: null,
    mode: "DIAGNOSTIC",
    driver: "SERVICE",
    status: "COMPLETED",
    seed: sementeDoTurno(FIO, 1),
    startedAt: agora,
    finishedAt: agora,
    durationMs: 12,
    scenariosTotal: 2,
    scenariosPassed: 2,
    scenariosWarning: 0,
    scenariosFailed: 0,
    p0Count: 0,
    p1Count: 0,
    p2Count: 0,
    opportunityCount: 0,
    scenarios: [],
    opportunities: [],
    runtimeTouched: false,
  };
}

/** A linha como o banco a devolveria, completa. */
function linhaBoa(id = "run-1"): LinhaDeRodadaLida {
  return {
    id,
    agentSlug: "waiter",
    status: "COMPLETED",
    seed: sementeDoTurno(FIO, 1),
    startedAt: new Date("2026-08-30T12:00:00.000Z"),
    finishedAt: new Date("2026-08-30T12:00:00.012Z"),
    durationMs: 12,
    scenariosTotal: 2,
    scenariosPassed: 2,
    scenariosWarning: 0,
    scenariosFailed: 0,
    p0Count: 0,
    opportunityCount: 0,
    metadata: JSON.stringify({ connect: { fio: FIO, turno: 1, estado: "entregue" }, runtimeTouched: false }),
    cenarios: [],
    oportunidades: [],
  };
}

/** O armazém completo, do qual cada teste estraga UMA peça. */
function armazem(sobrepor: Partial<ArmazemDoConnect> = {}): ArmazemDoConnect {
  return {
    // Um antecedente para o fio existir; `receber` não depende disso, mas
    // mantém o cenário realista.
    async antecedentes() {
      return [];
    },
    async gravarRodada() {
      return { runId: "run-1" };
    },
    async relerRodada() {
      return linhaBoa();
    },
    ...sobrepor,
  };
}

function deps(sobrepor: Partial<DependenciasDoDespacho> = {}): DependenciasDoDespacho {
  return {
    armazem: armazem(),
    agora: () => new Date("2026-08-30T12:00:00.000Z"),
    novoFio: () => "fio-fixo-do-teste",
    executar: async () => rodadaBoa(),
    ...sobrepor,
  };
}

/** As três cobranças que TODO corte tem que satisfazer. */
function cobrarNaoVerificavel(r: Awaited<ReturnType<typeof despachar>>) {
  expect(r.estado, JSON.stringify(r)).toBe("nao_verificavel");
  if (r.estado !== "nao_verificavel") return;
  expect(r.rodadaId).toBeNull();
  expect(r.caixa.gravado).toBe(false);
  expect(r.caixa.estado).toBeNull();
  expect(r.caixa.nunca_grava).toBe("acionado");
  expect(r.motivo.length).toBeGreaterThan(20);
}

beforeEach(() => {
  memoria.runs.length = 0;
  memoria.cenarios.length = 0;
  memoria.releituraCortada.valor = false;
  vi.stubEnv("DIOLI_CONNECT_SECRET", SEGREDO);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ───────────────────────────────────────────────────────────────────────────
describe("⭐ o acionamento cortado NUNCA vira sucesso", () => {
  it("A METADE DE CONTROLE — sem corte nenhum, o mesmo caminho dá `executado`", async () => {
    // Sem esta metade, todos os testes abaixo passariam com a função devolvendo
    // `nao_verificavel` para tudo — inclusive para o caso bom. Portão que reprova
    // sempre não é portão.
    const r = await despachar(pedidoLimpo(), deps());
    expect(r.estado, JSON.stringify(r)).toBe("executado");
    if (r.estado !== "executado") return;
    expect(r.caixa.estado).toBe("entregue");
    expect(r.caixa.gravado).toBe(true);
    expect(r.prova.relido_do_banco).toBe(true);
    expect(r.rodadaId).toBe("run-1");
  });

  it("corte 1 — o agente LANÇA antes de concluir", async () => {
    const r = await despachar(
      pedidoLimpo(),
      deps({
        executar: async () => {
          throw new Error("motor caiu no meio");
        },
      }),
    );
    cobrarNaoVerificavel(r);
    if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/lançou antes de concluir/i);
  });

  it("corte 2 — o agente volta sem cenário nenhum (FAILED)", async () => {
    const r = await despachar(
      pedidoLimpo(),
      deps({ executar: async () => ({ ...rodadaBoa(), status: "FAILED", scenariosTotal: 0 }) }),
    );
    cobrarNaoVerificavel(r);
    if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/não completou nenhum cenário/i);
  });

  it("corte 3 — a rodada volta sem a garantia de sandbox (`runtimeTouched` mentiroso)", async () => {
    const r = await despachar(
      pedidoLimpo(),
      deps({
        executar: async () =>
          ({ ...rodadaBoa(), runtimeTouched: true } as unknown as SimulationRunResult),
      }),
    );
    cobrarNaoVerificavel(r);
    if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/runtime não foi tocado/i);
  });

  it("corte 4 — algum cenário relatou uso de provedor de IA: a promessa de custo zero quebrou", async () => {
    const comIA = {
      ...rodadaBoa(),
      scenarios: [
        {
          scenario: { scenarioKey: "k", scenarioType: "t", persona: "p", customerGoal: "g", customerConstraints: {}, initialMessage: "m", expectedBehaviors: [], disallowedBehaviors: [] },
          output: { transcript: [], finalMessage: "", cards: [], mode: "x", optionsCount: 0, usedLLM: true },
          evaluation: { status: "PASS" as const, severity: "INFO" as const, score: 100, summary: "s", evidence: [] },
        },
      ],
    } as unknown as SimulationRunResult;
    const r = await despachar(pedidoLimpo(), deps({ executar: async () => comIA }));
    cobrarNaoVerificavel(r);
    if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/provedor de IA/i);
  });

  it("corte 5 — a GRAVAÇÃO falha", async () => {
    const r = await despachar(
      pedidoLimpo(),
      deps({
        armazem: armazem({
          async gravarRodada() {
            throw new Error("banco indisponível");
          },
        }),
      }),
    );
    cobrarNaoVerificavel(r);
    if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/gravação da rodada falhou/i);
  });

  it("corte 6 — a gravação devolve um id vazio", async () => {
    const r = await despachar(
      pedidoLimpo(),
      deps({ armazem: armazem({ async gravarRodada() { return { runId: "" }; } }) }),
    );
    cobrarNaoVerificavel(r);
    if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/nenhuma rodada foi gravada/i);
  });

  it("corte 7 — a RELEITURA lança", async () => {
    const r = await despachar(
      pedidoLimpo(),
      deps({
        armazem: armazem({
          async relerRodada() {
            throw new Error("conexão caiu na leitura");
          },
        }),
      }),
    );
    cobrarNaoVerificavel(r);
    if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/releitura da rodada .* falhou/i);
  });

  it('⭐⭐ corte 8 — O DESPACHANTE DIZ QUE GRAVOU, E A LINHA NÃO VOLTA DO BANCO', async () => {
    // ESTE é o defeito medido na plataforma, reproduzido de propósito: tudo
    // "deu certo" — o agente rodou, a gravação devolveu um id — e a prova não
    // existe. Um despachante honesto tem que reprovar aqui.
    const r = await despachar(pedidoLimpo(), deps({ armazem: armazem({ async relerRodada() { return null; } }) }));
    cobrarNaoVerificavel(r);
    if (r.estado === "nao_verificavel") {
      expect(r.motivo).toMatch(/não voltou do banco/i);
      expect(r.motivo).toMatch(/"eu gravei" não é prova de que gravou/i);
    }
  });

  it("corte 9 — a linha volta PELA METADE (sem fim)", async () => {
    const r = await despachar(
      pedidoLimpo(),
      deps({ armazem: armazem({ async relerRodada() { return { ...linhaBoa(), finishedAt: null }; } }) }),
    );
    cobrarNaoVerificavel(r);
    if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/pela metade não é execução/i);
  });

  it("corte 10 — a linha volta sem cenário nenhum gravado", async () => {
    const r = await despachar(
      pedidoLimpo(),
      deps({ armazem: armazem({ async relerRodada() { return { ...linhaBoa(), scenariosTotal: 0 }; } }) }),
    );
    cobrarNaoVerificavel(r);
  });

  it("⭐ corte 11 — a linha volta, mas é de OUTRO fio: prova de outra conversa não prova esta", async () => {
    const deOutroFio = {
      ...linhaBoa(),
      metadata: JSON.stringify({ connect: { fio: "connect:foocci:outra-conversa", turno: 1 }, runtimeTouched: false }),
    };
    const r = await despachar(pedidoLimpo(), deps({ armazem: armazem({ async relerRodada() { return deOutroFio; } }) }));
    cobrarNaoVerificavel(r);
    if (r.estado === "nao_verificavel") {
      expect(r.motivo).toMatch(/sem o registro de caixa deste fio/i);
      expect(r.motivo).toContain("connect:foocci:outra-conversa");
    }
  });

  it("corte 12 — a linha volta sem metadados nenhum", async () => {
    const r = await despachar(
      pedidoLimpo(),
      deps({ armazem: armazem({ async relerRodada() { return { ...linhaBoa(), metadata: null }; } }) }),
    );
    cobrarNaoVerificavel(r);
  });

  it('corte 13 — em "responder", a leitura do histórico falha: não se inventa conversa nova', async () => {
    const r = await despachar(
      pedidoLimpo({ acao: "responder" }),
      deps({
        armazem: armazem({
          async antecedentes() {
            throw new Error("índice corrompido");
          },
        }),
      }),
    );
    cobrarNaoVerificavel(r);
    if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/a leitura do fio .* falhou/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("⭐ o mesmo corte, agora medido na rota HTTP: e ele NÃO é 2xx", () => {
  const autorizado = { [CABECALHO_DO_SEGREDO]: SEGREDO, "content-type": "application/json" };

  function pedir(corpo: unknown): NextRequest {
    return new NextRequest("http://localhost/api/connect/despacho", {
      method: "POST",
      headers: autorizado,
      body: JSON.stringify(corpo),
    });
  }

  const corpo = {
    modo: "homologacao",
    sintetico: true,
    acao: "receber",
    de: DIRETOR_GERAL,
    para: GERENTE_DO_PRODUTO,
    mensagem: "Rode o ensaio.",
    cenarios: 2,
  };

  it("a metade de controle — sem corte, a rota responde 200", async () => {
    const r = await POST(pedir(corpo));
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    expect(memoria.runs).toHaveLength(1);
  });

  it("⭐ com a releitura cortada, a MESMA chamada responde 502 e `nao_verificavel`", async () => {
    memoria.releituraCortada.valor = true;

    const r = await POST(pedir(corpo));

    // 502, e o ponto é este: NÃO é 2xx.
    expect(r.status).toBe(502);
    expect(r.status).toBeGreaterThanOrEqual(400);
    const resposta = await r.json();
    expect(resposta.estado).toBe("nao_verificavel");
    expect(resposta.rodadaId).toBeNull();
    expect(resposta.motivo).toMatch(/não voltou do banco/i);

    // ⭐ E repare no detalhe cruel: a linha ESTÁ gravada no banco falso. O agente
    // rodou, a gravação aconteceu, e ainda assim a porta reprova — porque o que
    // vale é o que ela conseguiu RELER, não o que ela lembra de ter feito.
    expect(memoria.runs).toHaveLength(1);

    // A caixa não mente sobre isso: nada de "entregue", nada de "acionado".
    expect(resposta.caixa.gravado).toBe(false);
    expect(resposta.caixa.estado).toBeNull();
    expect(resposta.caixa.nunca_grava).toBe("acionado");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("a trava de sandbox — sem ela fechada, nada roda", () => {
  it("⭐ `assertSimulationSafeMode` barrando é RECUSA, e o agente nem é chamado", async () => {
    const executar = vi.fn(async () => rodadaBoa());
    const r = await despachar(
      pedidoLimpo(),
      deps({
        executar,
        assegurarSandbox: () => {
          throw new Error("Simulation SafeMode violated: allowMessaging must be false");
        },
      }),
    );

    expect(r.estado).toBe("recusado");
    if (r.estado === "recusado") {
      expect(r.motivo).toMatch(/allowMessaging must be false/);
      expect(r.motivo).toMatch(/Zero envio real é trava/i);
      expect(r.caixa.gravado).toBe(false);
    }
    // A prova de que a trava é ANTERIOR: o agente não chegou a ser chamado.
    expect(executar).not.toHaveBeenCalled();
  });

  it("a outra metade — com o sandbox fechado (o padrão de verdade), executa", async () => {
    // Sem `assegurarSandbox` injetado: quem roda é a `assertSimulationSafeMode`
    // de verdade, contra o SIMULATION_SAFE_MODE congelado da casa.
    const r = await despachar(pedidoLimpo(), deps());
    expect(r.estado).toBe("executado");
  });
});
