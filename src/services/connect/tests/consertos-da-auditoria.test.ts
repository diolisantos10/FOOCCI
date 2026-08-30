/**
 * ⭐ OS CONSERTOS DA AUDITORIA INDEPENDENTE DE 30/08/2026.
 *
 * O auditor disse que a arquitetura desta porta é boa, e é: o segredo resistiu,
 * a autoridade barrou até o próprio Agente Gerente, a prova é relida de verdade,
 * `acionado` é impossível de gravar e `nao_verificavel` nunca chegou a 2xx. O
 * que ele derrubou foram **afirmações sobre travas** — travas que não podiam
 * falhar, vendidas em comentário como se pudessem. É o defeito que vira ✅ falso
 * três semanas depois, quando alguém confia no comentário.
 *
 * Cada bloco aqui fecha um achado nas DUAS metades: o problema plantado é
 * barrado, E o caso legítimo continua passando. Um portão que reprova sempre não
 * é portão, e um teste que só mede a recusa não sabe a diferença.
 *
 * ⚠️ E cada bloco também mede a VARIANTE VIZINHA do achado — o auditor mede
 * exatamente onde o dedo aponta, e a fraude anda um metro ao lado.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import https from "node:https";
import type { SimulationRunResult } from "@/services/simulation/types";
import {
  CAMPOS_ACEITOS,
  CAMPOS_DO_DOMINIO_PROIBIDOS,
  MAX_ASSUNTO,
  MAX_ECO,
  MAX_MENSAGEM,
  MAX_TAMANHO_DO_FIO,
  conferirPedido,
  fioNovo,
  type PedidoDeDespacho,
} from "@/services/connect/contrato";
import { despachar, type DependenciasDoDespacho } from "@/services/connect/despacho";
import {
  donoDoFio,
  runtimeTocadoDaLinha,
  sementeDoTurno,
  type ArmazemDoConnect,
  type LinhaDeRodadaLida,
} from "@/services/connect/armazem";
import { DIRETOR_DO_PRODUTO, DIRETOR_GERAL, GERENTE_DO_PRODUTO } from "@/services/connect/cadastro";
import { CABECALHO_DO_SEGREDO } from "@/services/connect/porta";
import { medicaoConfiavel, medindoRede } from "@/services/connect/sentinela";

// ── O banco de mentira: SÓ o laboratório de simulação, como nos irmãos. ────
const memoria = vi.hoisted(() => ({
  runs: [] as Record<string, unknown>[],
  cenarios: [] as Record<string, unknown>[],
  oportunidades: [] as Record<string, unknown>[],
  /** Quando ligado, a leitura do histórico do fio explode (achado B-6). */
  leituraDoFioCortada: { valor: false },
}));

const db = vi.hoisted(() => ({
  agentSimulationRun: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const linha = { id: `run-${memoria.runs.length + 1}`, ...data };
      memoria.runs.push(linha);
      return { id: linha.id };
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const r = memoria.runs.find((x) => x.id === where.id);
      if (!r) return null;
      return {
        ...r,
        scenarios: memoria.cenarios.filter((c) => c.runId === r.id),
        opportunities: memoria.oportunidades.filter((o) => o.runId === r.id),
      };
    }),
    findMany: vi.fn(async ({ where }: { where: { agentSlug: string; seed: { startsWith: string } } }) => {
      if (memoria.leituraDoFioCortada.valor) throw new Error("índice corrompido");
      return memoria.runs.filter(
        (r) => r.agentSlug === where.agentSlug && String(r.seed ?? "").startsWith(where.seed.startsWith),
      );
    }),
  },
  agentSimulationScenario: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const linha = { id: `cen-${memoria.cenarios.length + 1}`, ...data };
      memoria.cenarios.push(linha);
      return { id: linha.id };
    }),
  },
  agentSimulationOpportunity: {
    createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      for (const d of data) memoria.oportunidades.push({ id: `opo-${memoria.oportunidades.length + 1}`, ...d });
      return { count: data.length };
    }),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { POST } from "@/app/api/connect/despacho/route";

const SEGREDO = "segredo-do-dioli-connect-no-foocci";
const autorizado = { [CABECALHO_DO_SEGREDO]: SEGREDO };
const UUID_A = "11111111-2222-4333-8444-555555555555";
const FIO_A = fioNovo(UUID_A);

function pedir(corpo: unknown, cabecalhos: Record<string, string> = autorizado): NextRequest {
  return new NextRequest("http://localhost/api/connect/despacho", {
    method: "POST",
    headers: { "content-type": "application/json", ...cabecalhos },
    body: JSON.stringify(corpo),
  });
}

function corpoLimpo(extra: Record<string, unknown> = {}) {
  return {
    modo: "homologacao",
    sintetico: true,
    acao: "receber",
    de: DIRETOR_GERAL,
    para: GERENTE_DO_PRODUTO,
    mensagem: "Como está o agente de atendimento do produto?",
    cenarios: 2,
    ...extra,
  };
}

/** O pedido conferido de verdade — nada de montar `PedidoConferido` à mão. */
function pedidoLimpo(extra: Record<string, unknown> = {}) {
  const c = conferirPedido(corpoLimpo(extra) as PedidoDeDespacho);
  if (!c.ok) throw new Error(`o corpo do teste não passa no contrato: ${c.motivo}`);
  return c.pedido;
}

function rodadaBoa(fio = FIO_A, turno = 1): SimulationRunResult {
  const agora = new Date("2026-08-30T12:00:00.000Z").toISOString();
  return {
    agentSlug: "waiter",
    departmentSlug: "waiter",
    restaurantId: null,
    mode: "DIAGNOSTIC",
    driver: "SERVICE",
    status: "COMPLETED",
    seed: sementeDoTurno(fio, turno),
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

function linhaBoa(sobrepor: Partial<LinhaDeRodadaLida> = {}, registro: Record<string, unknown> = {}): LinhaDeRodadaLida {
  return {
    id: "run-1",
    agentSlug: "waiter",
    status: "COMPLETED",
    seed: sementeDoTurno(FIO_A, 1),
    startedAt: new Date("2026-08-30T12:00:00.000Z"),
    finishedAt: new Date("2026-08-30T12:00:00.012Z"),
    durationMs: 12,
    scenariosTotal: 2,
    scenariosPassed: 2,
    scenariosWarning: 0,
    scenariosFailed: 0,
    p0Count: 0,
    opportunityCount: 0,
    metadata: JSON.stringify({
      connect: { fio: FIO_A, turno: 1, estado: "entregue", de: DIRETOR_GERAL, ...registro },
      runtimeTouched: false,
    }),
    cenarios: [],
    oportunidades: [],
    ...sobrepor,
  };
}

function armazem(sobrepor: Partial<ArmazemDoConnect> = {}): ArmazemDoConnect {
  return {
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
    novoFio: () => UUID_A,
    executar: async () => rodadaBoa(),
    ...sobrepor,
  };
}

beforeEach(() => {
  memoria.runs.length = 0;
  memoria.cenarios.length = 0;
  memoria.oportunidades.length = 0;
  memoria.leituraDoFioCortada.valor = false;
  vi.stubEnv("DIOLI_CONNECT_SECRET", SEGREDO);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ═══════════════════════════════════════════════════════════════════════════
// B-1 — a promessa de "sem rede" virou medição, e a medição pode dar diferente
// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ B-1 · a sentinela de rede — a trava que AGORA pode falhar", () => {
  /** Troca o `fetch` do processo por um que não sai de casa, e devolve o desfazer. */
  function fetchDeMentira(): () => void {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof globalThis.fetch;
    return () => {
      globalThis.fetch = original;
    };
  }

  it("⭐⭐ um executor que chama a rede derruba para `nao_verificavel` — e NÃO é 2xx", async () => {
    const desfazer = fetchDeMentira();
    try {
      const r = await despachar(
        pedidoLimpo(),
        deps({
          executar: async () => {
            // Exatamente o que esta porta jura não fazer: falar com um provedor.
            await fetch("https://api.provedor-de-ia.example/v1/messages");
            return rodadaBoa();
          },
        }),
      );

      expect(r.estado, JSON.stringify(r)).toBe("nao_verificavel");
      if (r.estado !== "nao_verificavel") return;
      expect(r.motivo).toMatch(/saiu para a rede 1 vez/i);
      expect(r.motivo).toContain("https://api.provedor-de-ia.example");
      expect(r.rodadaId).toBeNull();
      expect(r.caixa.gravado).toBe(false);
      expect(r.caixa.estado).toBeNull();
    } finally {
      desfazer();
    }
  });

  it("⭐ a variante vizinha: quem sai por `https.get` em vez de `fetch` também é contado", async () => {
    const originalGet = https.get;
    // Um `get` que não sai de casa — a contagem acontece antes de delegar.
    (https as { get: unknown }).get = (() => ({ on() {}, end() {} })) as unknown as typeof https.get;
    try {
      const r = await despachar(
        pedidoLimpo(),
        deps({
          executar: async () => {
            https.get("https://webhook.evolution.example/enviar");
            return rodadaBoa();
          },
        }),
      );
      expect(r.estado, JSON.stringify(r)).toBe("nao_verificavel");
      if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/saiu para a rede/i);
    } finally {
      (https as { get: unknown }).get = originalGet;
    }
  });

  it("A OUTRA METADE — o executor de verdade não sai para a rede, e passa", async () => {
    const r = await POST(pedir(corpoLimpo()));
    const corpo = await r.json();
    expect(r.status, JSON.stringify(corpo)).toBe(200);
    expect(corpo.medicao.rede.chamadas).toBe(0);
    expect(corpo.medicao.rede.canais).toContain("fetch");
  });

  it("não medir NÃO é medir zero: sem o canal obrigatório a medição não vale", () => {
    expect(medicaoConfiavel({ chamadas: 0, destinos: [], canais: ["http"], fonte: "medido no processo durante o acionamento" })).toBe(false);
    expect(medicaoConfiavel({ chamadas: 0, destinos: [], canais: ["fetch", "http"], fonte: "medido no processo durante o acionamento" })).toBe(true);
  });

  it("⭐ a sentinela devolve os globais como estava — inclusive quando a janela estoura", async () => {
    const fetchAntes = globalThis.fetch;
    const getAntes = https.get;

    await medindoRede(async () => "ok");
    expect(globalThis.fetch).toBe(fetchAntes);
    expect(https.get).toBe(getAntes);

    await expect(
      medindoRede(async () => {
        throw new Error("o agente estourou dentro da janela");
      }),
    ).rejects.toThrow(/estourou dentro da janela/);
    // Janela que fica aberta contaminaria toda requisição seguinte do processo.
    expect(globalThis.fetch).toBe(fetchAntes);
    expect(https.get).toBe(getAntes);
  });

  it("janelas aninhadas contam cada uma a sua parte, e a de fora vê tudo", async () => {
    const desfazer = fetchDeMentira();
    try {
      const fora = await medindoRede(async () => {
        await fetch("https://um.example");
        const dentro = await medindoRede(async () => {
          await fetch("https://dois.example");
          return null;
        });
        expect(dentro.rede.chamadas).toBe(1);
        expect(dentro.rede.destinos).toEqual(["https://dois.example"]);
        return null;
      });
      expect(fora.rede.chamadas).toBe(2);
    } finally {
      desfazer();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B-2 — `runtime_tocado` vem do banco; o que é medido saiu do bloco `prova`
// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ B-2 · a prova só carrega o que foi mesmo relido", () => {
  it("⭐⭐ a linha volta SEM `runtimeTouched` nos metadados → `nao_verificavel`", async () => {
    const semGarantia = linhaBoa({
      metadata: JSON.stringify({ connect: { fio: FIO_A, turno: 1, estado: "entregue", de: DIRETOR_GERAL } }),
    });
    const r = await despachar(pedidoLimpo(), deps({ armazem: armazem({ async relerRodada() { return semGarantia; } }) }));

    expect(r.estado, JSON.stringify(r)).toBe("nao_verificavel");
    if (r.estado !== "nao_verificavel") return;
    expect(r.motivo).toMatch(/sem declarar `runtimeTouched`/i);
    expect(r.motivo).toMatch(/RELIDA daqui, nunca/i);
    expect(r.rodadaId).toBeNull();
  });

  it("a variante vizinha: a linha volta declarando `runtimeTouched: true` → `nao_verificavel`", async () => {
    const suja = linhaBoa({
      metadata: JSON.stringify({
        connect: { fio: FIO_A, turno: 1, estado: "entregue", de: DIRETOR_GERAL },
        runtimeTouched: true,
      }),
    });
    const r = await despachar(pedidoLimpo(), deps({ armazem: armazem({ async relerRodada() { return suja; } }) }));
    expect(r.estado).toBe("nao_verificavel");
    if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/declarando `runtimeTouched: true`/i);
  });

  it("A OUTRA METADE — com a garantia na linha, executa e a prova ecoa o que foi lido", async () => {
    const r = await despachar(pedidoLimpo(), deps());
    expect(r.estado, JSON.stringify(r)).toBe("executado");
    if (r.estado !== "executado") return;
    expect(r.prova.relido_do_banco).toBe(true);
    expect(r.prova.runtime_tocado).toBe(runtimeTocadoDaLinha(linhaBoa()));
    expect(r.prova.runtime_tocado).toBe(false);
  });

  it("⭐ o bloco `prova` não carrega mais nenhum campo de medição", async () => {
    const r = await despachar(pedidoLimpo(), deps());
    if (r.estado !== "executado") throw new Error("o caso de controle precisa executar");

    // O que existe em `prova` tem que ter vindo da linha relida. `usou_ia` e a
    // rede são medidos aqui, e por isso moram em `medicao`, que se declara.
    expect(Object.keys(r.prova).sort()).toEqual(
      ["agente", "cenarios", "duracaoMs", "fim", "inicio", "relido_do_banco", "rodadaId", "runtime_tocado", "semente", "status", "tabela"],
    );
    expect(r.medicao.relido_do_banco).toBe(false);
    expect(r.medicao.usou_ia).toBe(false);
    expect(r.medicao.cenarios_com_ia).toBe(0);
  });

  it("`runtimeTocadoDaLinha` distingue os três casos, e `null` não é `false`", () => {
    expect(runtimeTocadoDaLinha(linhaBoa())).toBe(false);
    expect(runtimeTocadoDaLinha(linhaBoa({ metadata: JSON.stringify({ runtimeTouched: true }) }))).toBe(true);
    expect(runtimeTocadoDaLinha(linhaBoa({ metadata: JSON.stringify({}) }))).toBeNull();
    expect(runtimeTocadoDaLinha(linhaBoa({ metadata: null }))).toBeNull();
    expect(runtimeTocadoDaLinha(linhaBoa({ metadata: "isto não é json" }))).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B-3 — allowlist de corpo, e a varredura que NÃO se encontra a si mesma
// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ B-3 · o corpo é allowlist: campo desconhecido é recusa NOMEADA", () => {
  /**
   * ⚠️ A varredura antiga era uma lista escrita à mão que era SUBCONJUNTO da
   * própria constante — ela se encontrava a si mesma. Esta itera a constante
   * inteira, e a asserção de tamanho impede que alguém encurte a constante sem
   * o teste notar.
   */
  it("⭐ TODOS os campos do domínio proibido são recusados, com a explicação inteira", async () => {
    expect(CAMPOS_DO_DOMINIO_PROIBIDOS.length).toBe(13);
    for (const campo of CAMPOS_DO_DOMINIO_PROIBIDOS) {
      const r = await POST(pedir(corpoLimpo({ [campo]: "valor-que-existe-de-verdade" })));
      expect(r.status, campo).toBe(400);
      const corpo = await r.json();
      expect(corpo.estado, campo).toBe("recusado");
      expect(corpo.motivo, campo).toContain(campo);
      expect(corpo.motivo, campo).toMatch(/não toca o domínio operacional/i);
    }
    expect(memoria.runs).toHaveLength(0);
  });

  it("⭐⭐ A VARIANTE VIZINHA — os sete que o auditor passou com HTTP 200 agora são 400", async () => {
    // Estes eram ignorados em silêncio: a denylist só conhecia os treze nomes
    // exatos, e cada um destes anda um metro ao lado de um deles.
    const oQueOAuditorPassou = [
      "restaurant_id",
      "RestaurantId",
      "restaurantid",
      "tenantId",
      "userId",
      "orderNumber",
      "email",
    ];
    for (const campo of oQueOAuditorPassou) {
      const r = await POST(pedir(corpoLimpo({ [campo]: "valor-que-existe-de-verdade" })));
      expect(r.status, campo).toBe(400);
      const corpo = await r.json();
      expect(corpo.motivo, campo).toContain(campo);
      expect(corpo.motivo, campo).toMatch(/não é entrada desta porta/i);
      expect(corpo.motivo, campo).toMatch(/nunca ignorado em silêncio/i);
    }
    expect(memoria.runs).toHaveLength(0);
  });

  it("e a variante que ninguém escreveu: um nome qualquer, nunca visto, também é recusado", async () => {
    for (const campo of ["restaurant-id", "RESTAURANTID", "webhook_url", "x", "__proto__", "constructor"]) {
      const r = await POST(pedir(corpoLimpo({ [campo]: 1 })));
      expect(r.status, campo).toBe(400);
      expect((await r.json()).motivo, campo).toMatch(/não é entrada desta porta/i);
    }
    expect(memoria.runs).toHaveLength(0);
  });

  it("corpo que não é objeto de campos é recusado COM O MOTIVO DELE, antes de tudo", async () => {
    // ⚠️ O motivo cobrado é o específico. Aceitar "corpo inválido OU modo
    // inválido" deixaria a trava ser apagada sem o teste ver: sem ela, uma lista
    // vazia cai na trava do modo e responde 400 do mesmo jeito.
    for (const corpo of [[], [1, 2], "texto", 42, true]) {
      const r = await POST(pedir(corpo));
      expect(r.status, JSON.stringify(corpo)).toBe(400);
      expect((await r.json()).motivo, JSON.stringify(corpo)).toMatch(/corpo inválido/i);
    }
    expect(memoria.runs).toHaveLength(0);
  });

  it("⭐ A OUTRA METADE — TODOS os campos aceitos atravessam juntos, num pedido só", async () => {
    // ⚠️ O corpo é de PRODUÇÃO desde 30/08/2026, e por uma razão de contrato:
    // `caso` entrou na allowlist e ele **só** é aceito em `producao` — em
    // homologação a presença dele é recusa nomeada. Um corpo de homologação não
    // tem mais como exercitar a lista inteira, e escrever a lista "menos um"
    // faria o teste parar de cobrar exatamente o campo novo.
    const completo: Record<string, unknown> = {
      modo: "producao",
      sintetico: false,
      acao: "receber",
      de: DIRETOR_GERAL,
      para: GERENTE_DO_PRODUTO,
      agente: "waiter",
      fio: FIO_A,
      mensagem: "a mensagem que chegou",
      assunto: "o assunto declarado",
      cenarios: 2,
      caso: { resumo: "o lead pediu um volume acima do plano e propôs permuta" },
    };
    // O teste é sobre a allowlist: o corpo usa TODOS os nomes dela, e nenhum outro.
    expect(Object.keys(completo).sort()).toEqual([...CAMPOS_ACEITOS].sort());

    const r = await POST(pedir(completo));
    const corpo = await r.json();
    expect(r.status, JSON.stringify(corpo)).toBe(200);
    expect(corpo.estado).toBe("executado");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B-4 — o fio tem dono, e o dono é conferido em TODO verbo que emenda turno
// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ B-4 · o fio tem dono — conversa dos outros não se continua", () => {
  /** Abre um fio de verdade, pela rota, em nome de quem for. */
  async function abrirFio(de: string): Promise<string> {
    const r = await POST(
      pedir({
        modo: "homologacao",
        sintetico: true,
        acao: "iniciar",
        de,
        para: GERENTE_DO_PRODUTO,
        assunto: "Rodada de homologação do agente de atendimento",
        cenarios: 2,
      }),
    );
    const corpo = await r.json();
    expect(corpo.estado, JSON.stringify(corpo)).toBe("executado");
    return corpo.fio as string;
  }

  it("⭐⭐ a reprodução do auditor: quem abriu foi `diretor-geral`; `diretor-foocci` responde → RECUSADO", async () => {
    const fio = await abrirFio(DIRETOR_GERAL);
    const rodadasAntes = memoria.runs.length;

    const r = await POST(
      pedir(corpoLimpo({ acao: "responder", de: DIRETOR_DO_PRODUTO, fio, mensagem: "E o que reprovou?" })),
    );

    expect(r.status).toBe(422);
    const corpo = await r.json();
    expect(corpo.estado).toBe("recusado");
    expect(corpo.motivo).toContain(DIRETOR_GERAL);
    expect(corpo.motivo).toContain(DIRETOR_DO_PRODUTO);
    expect(corpo.motivo).toMatch(/conversa dos outros\s+não se continua/i);
    // E o efeito é o que importa: nenhum turno 2 foi gravado em nome do invasor.
    expect(memoria.runs).toHaveLength(rodadasAntes);
    expect(corpo.caixa.gravado).toBe(false);
  });

  it("⭐ A VARIANTE VIZINHA — `receber` no fio alheio é barrado igual, e não só `responder`", async () => {
    // `receber` também aceita `fio` e também emenda turno. Fechar só o verbo que
    // o auditor usou seria trancar a porta apontada e deixar a do lado aberta.
    const fio = await abrirFio(DIRETOR_GERAL);
    const rodadasAntes = memoria.runs.length;

    const r = await POST(pedir(corpoLimpo({ acao: "receber", de: DIRETOR_DO_PRODUTO, fio })));

    expect(r.status).toBe(422);
    expect((await r.json()).motivo).toMatch(/conversa dos outros/i);
    expect(memoria.runs).toHaveLength(rodadasAntes);
  });

  it("⭐ A OUTRA METADE — o DONO responde no próprio fio e executa, no turno 2", async () => {
    const fio = await abrirFio(DIRETOR_GERAL);

    const r = await POST(
      pedir(corpoLimpo({ acao: "responder", de: DIRETOR_GERAL, fio, mensagem: "E o que reprovou?" })),
    );
    const corpo = await r.json();
    expect(r.status, JSON.stringify(corpo)).toBe(200);
    expect(corpo.turno).toBe(2);
    expect(corpo.fio).toBe(fio);
    expect(corpo.de).toBe(DIRETOR_GERAL);
  });

  it("e o outro papel autorizado não fica de fora: ele abre e continua o fio DELE", async () => {
    const fio = await abrirFio(DIRETOR_DO_PRODUTO);
    const r = await POST(
      pedir(corpoLimpo({ acao: "responder", de: DIRETOR_DO_PRODUTO, fio, mensagem: "segue" })),
    );
    const corpo = await r.json();
    expect(corpo.estado, JSON.stringify(corpo)).toBe("executado");
    expect(corpo.turno).toBe(2);
  });

  it("fio com turno gravado mas SEM dono legível → `nao_verificavel`, não `executado`", async () => {
    // Ausência de informação não é informação: sem saber quem abriu, não dá para
    // dizer que quem chega é o dono — nem que não é.
    const anonima = linhaBoa({ id: "run-0" }, { de: undefined });
    const r = await despachar(
      pedidoLimpo({ acao: "responder", fio: FIO_A }),
      deps({ armazem: armazem({ async antecedentes() { return [anonima]; } }) }),
    );
    expect(r.estado, JSON.stringify(r)).toBe("nao_verificavel");
    if (r.estado === "nao_verificavel") expect(r.motivo).toMatch(/nenhum deles diz quem o abriu/i);
  });

  it("o dono é o turno MAIS ANTIGO — um turno intruso não vira dono", () => {
    const turno1 = linhaBoa({ id: "a" }, { turno: 1, de: DIRETOR_GERAL });
    const turno2 = linhaBoa({ id: "b" }, { turno: 2, de: DIRETOR_DO_PRODUTO });
    expect(donoDoFio([turno2, turno1])).toBe(DIRETOR_GERAL);
    expect(donoDoFio([turno1, turno2])).toBe(DIRETOR_GERAL);
    expect(donoDoFio([])).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B-5 — o fio tem forma e tamanho; e o texto livre tem teto
// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ B-5 · o fio é identificador, não caixa de texto livre", () => {
  /**
   * ⚠️ OS DOIS GRUPOS SÃO SEPARADOS DE PROPÓSITO, e cada um cobra O SEU motivo.
   *
   * São duas travas distintas — o TETO e a FORMA — e um `toMatch(/forma|teto/)`
   * único deixaria qualquer uma das duas ser apagada sem o teste notar: o que
   * escapasse do teto cairia na forma e o teste continuaria verde. Foi
   * exatamente o que aconteceu na primeira versão deste arquivo.
   */
  it("⭐⭐ o que o auditor mandou e recebeu 200 agora é 400 — pela FORMA", async () => {
    for (const fio of ["../../etc/passwd", "connect:foocci:../../etc/passwd", "connect:foocci:"]) {
      const r = await POST(pedir(corpoLimpo({ acao: "responder", fio, mensagem: "oi" })));
      expect(r.status, fio).toBe(400);
      const corpo = await r.json();
      expect(corpo.estado, fio).toBe("recusado");
      expect(corpo.motivo, fio).toMatch(/fio com forma inválida/i);
    }
    expect(memoria.runs).toHaveLength(0);
  });

  it("⭐⭐ e o fio de 100.000 caracteres é 400 — pelo TETO, com o tamanho dito", async () => {
    const casos: [string, number][] = [
      ["x".repeat(100_000), 100_000],
      ["connect:outroproduto:11111111-2222-4333-8444-555555555555", 57],
      // Fio válido com a semente colada no fim, e com um caractere a mais.
      ["connect:foocci:11111111-2222-4333-8444-555555555555#t2", 54],
      ["connect:foocci:11111111-2222-4333-8444-555555555555x", 52],
    ];
    for (const [fio, tamanho] of casos) {
      const r = await POST(pedir(corpoLimpo({ acao: "responder", fio, mensagem: "oi" })));
      expect(r.status, String(tamanho)).toBe(400);
      const corpo = await r.json();
      expect(corpo.estado, String(tamanho)).toBe("recusado");
      expect(corpo.motivo, String(tamanho)).toMatch(
        new RegExp(`fio grande demais: recebi ${tamanho} caracteres e o máximo é ${MAX_TAMANHO_DO_FIO}`, "i"),
      );
    }
    expect(memoria.runs).toHaveLength(0);
  });

  it("⭐ a variante vizinha: quase-certo continua errado, e é recusado PELA FORMA", async () => {
    const quaseCertos = [
      "connect:foocci:nao-e-um-uuid",
      "connect:foocci:11111111-2222-4333-8444-55555555555", // um dígito a menos
      "connect:FOOCCI:11111111-2222-4333-8444-555555555555", // produto em caixa alta
      // Outro produto, com prefixo do MESMO tamanho — se fosse mais comprido, a
      // recusa viria do teto e não da forma, e o teste mediria a trava errada.
      "connect:fooccx:11111111-2222-4333-8444-555555555555",
      "11111111-2222-4333-8444-555555555555", // sem o prefixo
      "connect:foocci:11111111-2222-4333-8444-55555555555Z", // um caractere fora do hex
      // A semente colada no fio, cabendo EXATO no teto: é a forma que recusa,
      // não o tamanho — e é a variante que tentaria injetar turno de outro fio.
      "connect:foocci:11111111-2222-4333-8444-55555555#t22",
    ];
    for (const fio of quaseCertos) {
      const r = await POST(pedir(corpoLimpo({ acao: "responder", fio, mensagem: "oi" })));
      const corpo = await r.json();
      // ⚠️ 400 E o motivo da FORMA. Aceitar "400 ou 422" aqui deixaria o teste
      // passar mesmo se a trava de forma sumisse — 422 é o que um fio bem
      // formado e inexistente responde, e é justamente o que não pode ser
      // confundido com isto.
      expect(r.status, fio).toBe(400);
      expect(corpo.estado, fio).toBe("recusado");
      expect(corpo.motivo, fio).toMatch(/fio com forma inválida/i);
    }
    expect(memoria.runs).toHaveLength(0);
  });

  it("o `trim` do contrato não é buraco: o fio com espaço nas pontas é o MESMO fio", async () => {
    // Este anda ao lado do teste acima e tem que dar o resultado OPOSTO: aparado,
    // ele é um fio bem formado, e a recusa certa é "não existe conversa", 422 —
    // não "forma inválida". Se um dia os dois derem a mesma coisa, um dos dois
    // está errado.
    const r = await POST(pedir(corpoLimpo({ acao: "responder", fio: `  ${FIO_A}  `, mensagem: "oi" })));
    expect(r.status).toBe(422);
    expect((await r.json()).motivo).toMatch(/não tem nenhum turno gravado/i);
  });

  it("o eco da recusa também tem teto — variante vizinha, do lado da SAÍDA", async () => {
    // Sem teto, um `modo` de 100.000 caracteres voltaria inteiro no motivo.
    const r = await POST(pedir(corpoLimpo({ modo: "p".repeat(100_000) })));
    expect(r.status).toBe(400);
    const motivo = String((await r.json()).motivo);
    expect(motivo).toMatch(/cortado, 100002 caracteres/);
    expect(motivo.length).toBeLessThan(MAX_ECO + 1_000);
  });

  it("mensagem e assunto acima do teto são RECUSA, nunca corte silencioso", async () => {
    const grande = await POST(pedir(corpoLimpo({ mensagem: "m".repeat(MAX_MENSAGEM + 1) })));
    expect(grande.status).toBe(400);
    expect((await grande.json()).motivo).toMatch(/mensagem grande demais/i);

    const assunto = await POST(
      pedir({
        modo: "homologacao",
        sintetico: true,
        acao: "iniciar",
        de: DIRETOR_GERAL,
        para: GERENTE_DO_PRODUTO,
        assunto: "a".repeat(MAX_ASSUNTO + 1),
      }),
    );
    expect(assunto.status).toBe(400);
    expect((await assunto.json()).motivo).toMatch(/assunto grande demais/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it("⭐ A OUTRA METADE — o fio que a porta cunhou volta e é aceito; e o teto EXATO passa", async () => {
    const aberta = await POST(
      pedir({
        modo: "homologacao",
        sintetico: true,
        acao: "iniciar",
        de: DIRETOR_GERAL,
        para: GERENTE_DO_PRODUTO,
        assunto: "Rodada de homologação",
        cenarios: 2,
      }),
    );
    const abertura = await aberta.json();
    expect(abertura.estado, JSON.stringify(abertura)).toBe("executado");
    expect(abertura.fio.length).toBeLessThanOrEqual(MAX_TAMANHO_DO_FIO);

    const continuada = await POST(
      pedir(
        corpoLimpo({
          acao: "responder",
          fio: abertura.fio,
          mensagem: "m".repeat(MAX_MENSAGEM), // exatamente no teto: passa
          cenarios: 2,
        }),
      ),
    );
    const corpo = await continuada.json();
    expect(continuada.status, JSON.stringify(corpo)).toBe(200);
    expect(corpo.turno).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B-6 — erro de leitura do fio não vira "histórico vazio"
// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ B-6 · fio que não pôde ser lido não é fio vazio", () => {
  it("⭐⭐ em `receber`, a leitura do fio falha → `nao_verificavel`, e não turnos_anteriores: 0", async () => {
    memoria.leituraDoFioCortada.valor = true;
    const r = await POST(pedir(corpoLimpo()));

    expect(r.status).toBe(502);
    const corpo = await r.json();
    expect(corpo.estado).toBe("nao_verificavel");
    expect(corpo.motivo).toMatch(/a leitura do fio .* falhou/i);
    expect(corpo.motivo).toMatch(/não vira "histórico vazio"/i);
    expect(corpo.artefato).toBeUndefined();
    expect(memoria.runs).toHaveLength(0);
  });

  it("⭐ a variante vizinha: em `iniciar` também — o verbo sem histórico não é exceção", async () => {
    memoria.leituraDoFioCortada.valor = true;
    const r = await POST(
      pedir({
        modo: "homologacao",
        sintetico: true,
        acao: "iniciar",
        de: DIRETOR_GERAL,
        para: GERENTE_DO_PRODUTO,
        assunto: "Rodada de homologação",
      }),
    );
    expect(r.status).toBe(502);
    expect((await r.json()).estado).toBe("nao_verificavel");
    expect(memoria.runs).toHaveLength(0);
  });

  it("A OUTRA METADE — com a leitura funcionando, o artefato traz a contagem de verdade", async () => {
    const primeira = await POST(pedir(corpoLimpo({ cenarios: 2 })));
    const abertura = await primeira.json();
    expect(abertura.estado, JSON.stringify(abertura)).toBe("executado");
    expect(JSON.parse(abertura.artefato).fio_anterior.turnos_anteriores).toBe(0);

    const segunda = await POST(
      pedir(corpoLimpo({ acao: "responder", fio: abertura.fio, mensagem: "e agora?", cenarios: 2 })),
    );
    const corpo = await segunda.json();
    expect(corpo.estado, JSON.stringify(corpo)).toBe("executado");
    const artefato = JSON.parse(corpo.artefato);
    expect(artefato.fio_anterior.turnos_anteriores).toBe(1);
    expect(artefato.fio_anterior.rodadas).toEqual([abertura.rodadaId]);
  });
});
