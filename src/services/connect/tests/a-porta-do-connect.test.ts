/**
 * A PORTA DO DIOLI CONNECT — o que ela BARRA, medido na própria rota HTTP.
 *
 * Trava vale pelo que recusa, e recusa só é recusa se for medida no lugar onde
 * ela acontece. Aqui a rota é a de verdade (`app/api/connect/despacho/route.ts`),
 * com `NextRequest` montado à mão, e o agente que roda é o agente de verdade
 * (`runWaiterSimulation`, determinístico e sem chave de IA). Só o banco é de
 * mentira — e ele é de mentira de um jeito que também prova alguma coisa:
 *
 * ⛔ **O banco falso só tem as TRÊS tabelas do laboratório de simulação.** Não
 * existe `order`, `client`, `conversation`, `payment` nem nada do domínio
 * operacional. Se qualquer linha desta obra tentasse tocar uma tabela de
 * negócio, o teste explodiria com "cannot read properties of undefined" em vez
 * de passar. A ausência aqui é asserção.
 *
 * As duas metades da regra da casa estão distribuídas assim:
 *   • aqui: o problema plantado é BARRADO, e o caso limpo NÃO é barrado por engano;
 *   • em `acionamento-cortado.test.ts`: o acionamento é cortado de propósito e
 *     tem que virar `nao_verificavel`, nunca sucesso.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── O banco de mentira: SÓ o laboratório de simulação. ─────────────────────
const memoria = vi.hoisted(() => ({
  runs: [] as Record<string, unknown>[],
  cenarios: [] as Record<string, unknown>[],
  oportunidades: [] as Record<string, unknown>[],
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
    findMany: vi.fn(async ({ where }: { where: { agentSlug: string; seed: { startsWith: string } } }) =>
      memoria.runs.filter(
        (r) => r.agentSlug === where.agentSlug && String(r.seed ?? "").startsWith(where.seed.startsWith),
      ),
    ),
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
import { GET as CADASTRO } from "@/app/api/connect/cadastro/route";
import {
  AGENTE_DO_PILOTO,
  DIRETOR_DO_PRODUTO,
  DIRETOR_GERAL,
  GERENTE_DO_PRODUTO,
} from "@/services/connect/cadastro";
import { CABECALHO_DO_SEGREDO } from "@/services/connect/porta";

const SEGREDO = "segredo-do-dioli-connect-no-foocci";
/** O segredo de OUTRA finalidade. Existe no ambiente — e não abre nada. */
const SEGREDO_DO_ADMIN = "senha-antiga-do-painel-inteiro-da-empresa";
/** Um fio com a forma que a porta cunha (achado B-5) e que não existe no banco. */
const FIO_BEM_FORMADO = "connect:foocci:99999999-8888-4777-8666-555555555555";

function pedir(corpo: unknown, cabecalhos: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/connect/despacho", {
    method: "POST",
    headers: { "content-type": "application/json", ...cabecalhos },
    body: JSON.stringify(corpo),
  });
}

/** Um corpo bem formado — cada teste estraga UM campo dele. */
function corpoLimpo(extra: Record<string, unknown> = {}) {
  return {
    modo: "homologacao",
    sintetico: true,
    acao: "receber",
    de: DIRETOR_GERAL,
    para: GERENTE_DO_PRODUTO,
    mensagem: "Como está o agente de atendimento do produto?",
    cenarios: 3,
    ...extra,
  };
}

const autorizado = { [CABECALHO_DO_SEGREDO]: SEGREDO };

beforeEach(() => {
  memoria.runs.length = 0;
  memoria.cenarios.length = 0;
  memoria.oportunidades.length = 0;
  vi.stubEnv("DIOLI_CONNECT_SECRET", SEGREDO);
  // ⚠️ O ADMIN_SECRET fica LIGADO na maioria dos casos de propósito: é assim que
  // se prova que ele não faz diferença nenhuma nesta porta (ADR-003).
  vi.stubEnv("ADMIN_SECRET", SEGREDO_DO_ADMIN);
  // E nenhuma chave de IA, em nenhum teste: o acionamento é grátis por trava.
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GOOGLE_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ───────────────────────────────────────────────────────────────────────────
describe("trava 1 — o segredo desta porta, e só ele", () => {
  it("⭐ com ADMIN_SECRET configurado e DIOLI_CONNECT_SECRET ausente, a porta PERMANECE FECHADA", async () => {
    vi.stubEnv("DIOLI_CONNECT_SECRET", "");
    vi.stubEnv("ADMIN_SECRET", SEGREDO_DO_ADMIN);

    const r = await POST(pedir(corpoLimpo(), { [CABECALHO_DO_SEGREDO]: SEGREDO_DO_ADMIN }));

    expect(r.status).toBe(503);
    const corpo = await r.json();
    expect(corpo.estado).toBe("recusado");
    expect(corpo.motivo).toMatch(/DIOLI_CONNECT_SECRET não está configurado/i);
    expect(corpo.motivo).toMatch(/ADR-003/);
    expect(corpo.motivo).toMatch(/segredo de outra finalidade não abre porta corporativa/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it("sem segredo nenhum configurado a porta NÃO abre: 503, e não 401", async () => {
    vi.stubEnv("DIOLI_CONNECT_SECRET", "");
    vi.stubEnv("ADMIN_SECRET", "");
    const r = await POST(pedir(corpoLimpo(), autorizado));
    expect(r.status).toBe(503);
    expect(memoria.runs).toHaveLength(0);
  });

  it("segredo curto demais é porta DESLIGADA, não segredo fraco: 503", async () => {
    vi.stubEnv("DIOLI_CONNECT_SECRET", "curto");
    const r = await POST(pedir(corpoLimpo(), { [CABECALHO_DO_SEGREDO]: "curto" }));
    expect(r.status).toBe(503);
    expect((await r.json()).motivo).toMatch(/menos de 16 caracteres/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it("com o segredo certo configurado, apresentar o ADMIN_SECRET é 401", async () => {
    const r = await POST(pedir(corpoLimpo(), { [CABECALHO_DO_SEGREDO]: SEGREDO_DO_ADMIN }));
    expect(r.status).toBe(401);
    expect(memoria.runs).toHaveLength(0);
  });

  it("cabeçalho errado: 401. Sem cabeçalho nenhum: 401", async () => {
    expect((await POST(pedir(corpoLimpo(), { [CABECALHO_DO_SEGREDO]: "chute" }))).status).toBe(401);
    expect((await POST(pedir(corpoLimpo()))).status).toBe(401);
    expect(memoria.runs).toHaveLength(0);
  });

  it("a outra metade — o segredo CERTO atravessa, com ADMIN_SECRET ligado ao lado", async () => {
    const r = await POST(pedir(corpoLimpo(), autorizado));
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("travas 2 e 3 — homologação com dado sintético, sem normalizar nada", () => {
  it('modo "producao" é recusado com o motivo, e nunca executa', async () => {
    const r = await POST(pedir(corpoLimpo({ modo: "producao" }), autorizado));
    expect(r.status).toBe(400);
    const corpo = await r.json();
    expect(corpo.estado).toBe("recusado");
    expect(corpo.motivo).toMatch(/modo inválido/i);
    expect(corpo.motivo).toMatch(/homologacao/);
    expect(memoria.runs).toHaveLength(0);
  });

  it("⭐ modo ausente NÃO ganha padrão — aqui não há normalizeMode", async () => {
    const sem = corpoLimpo();
    delete (sem as Record<string, unknown>).modo;
    const r = await POST(pedir(sem, autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/não há normalização/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it("sintetico: false é recusado", async () => {
    const r = await POST(pedir(corpoLimpo({ sintetico: false }), autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/sintetico inválido/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it('sintetico: "true" em TEXTO não passa por true', async () => {
    const r = await POST(pedir(corpoLimpo({ sintetico: "true" }), autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/"true" em texto não é true|sintetico inválido/i);
  });

  it("sintetico ausente é recusado — não existe padrão", async () => {
    const sem = corpoLimpo();
    delete (sem as Record<string, unknown>).sintetico;
    const r = await POST(pedir(sem, autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/sintetico inválido/i);
    expect(memoria.runs).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("⭐ o domínio operacional do produto não tem entrada nesta porta", () => {
  for (const campo of ["restaurantId", "orderId", "pedidoId", "telefone", "clienteId", "conversationId"]) {
    it(`"${campo}" no corpo é RECUSADO — não ignorado`, async () => {
      const r = await POST(pedir(corpoLimpo({ [campo]: "valor-que-existe-de-verdade" }), autorizado));
      expect(r.status).toBe(400);
      const corpo = await r.json();
      expect(corpo.estado).toBe("recusado");
      expect(corpo.motivo).toContain(campo);
      expect(corpo.motivo).toMatch(/não toca o domínio operacional/i);
      expect(memoria.runs).toHaveLength(0);
    });
  }

  it("a outra metade — sem esses campos o corpo atravessa e a rodada é sintética", async () => {
    const r = await POST(pedir(corpoLimpo(), autorizado));
    expect(r.status).toBe(200);
    // Nenhum restaurante real ficou grudado na linha gravada.
    expect(memoria.runs[0]!.restaurantId).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("trava — a autoridade, e quem recebe", () => {
  it("de ausente é recusado: falar sem se identificar não é falar", async () => {
    const sem = corpoLimpo();
    delete (sem as Record<string, unknown>).de;
    const r = await POST(pedir(sem, autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/autoridade recusada/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it("⭐ o próprio Agente Gerente NÃO pode despachar por esta porta", async () => {
    // Ele EXISTE no organograma — o ponto é justamente esse: não é ficha
    // inventada, é ficha que não tem esta autoridade.
    const r = await POST(pedir(corpoLimpo({ de: GERENTE_DO_PRODUTO }), autorizado));
    expect(r.status).toBe(400);
    const corpo = await r.json();
    expect(corpo.motivo).toContain(GERENTE_DO_PRODUTO);
    expect(corpo.motivo).toMatch(/nem com o segredo certo/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it("papel inventado é recusado", async () => {
    const r = await POST(pedir(corpoLimpo({ de: "estagiario-do-financeiro" }), autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toContain("estagiario-do-financeiro");
  });

  it("destinatário fora do cadastro é recusado", async () => {
    const r = await POST(pedir(corpoLimpo({ para: "agente-gerente-financeiro" }), autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/destinatário recusado/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it("a outra metade — os DOIS papéis autorizados atravessam", async () => {
    for (const papel of [DIRETOR_GERAL, DIRETOR_DO_PRODUTO]) {
      const r = await POST(pedir(corpoLimpo({ de: papel }), autorizado));
      const corpo = await r.json();
      expect(corpo.estado, `${papel}: ${JSON.stringify(corpo)}`).toBe("executado");
      expect(corpo.de).toBe(papel);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("trava — o agente é uma lista de um", () => {
  it("⭐ outro agente do produto é recusado COM O NOME PEDIDO no motivo", async () => {
    const r = await POST(pedir(corpoLimpo({ agente: "crm" }), autorizado));
    expect(r.status).toBe(400);
    const corpo = await r.json();
    expect(corpo.motivo).toContain("crm");
    expect(corpo.motivo).toContain(AGENTE_DO_PILOTO);
    expect(corpo.motivo).toMatch(/presa a/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it("agente que não é texto não cai em padrão — vira recusa", async () => {
    const r = await POST(pedir(corpoLimpo({ agente: 42 }), autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/agente 42 recusado/i);
  });

  it("a outra metade — a ausência vale pelo único, e ele executa", async () => {
    const r = await POST(pedir(corpoLimpo(), autorizado));
    const corpo = await r.json();
    expect(corpo.estado, JSON.stringify(corpo)).toBe("executado");
    expect(corpo.agente).toBe(AGENTE_DO_PILOTO);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("os três verbos — receber, responder e iniciar", () => {
  it("acao ausente é recusada: a porta não escolhe o verbo por você", async () => {
    const sem = corpoLimpo();
    delete (sem as Record<string, unknown>).acao;
    const r = await POST(pedir(sem, autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/acao null recusada|Não há padrão/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it("acao fora da lista de três é recusada", async () => {
    const r = await POST(pedir(corpoLimpo({ acao: "conversar" }), autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toContain("conversar");
  });

  it('"receber" sem mensagem é recusado', async () => {
    const sem = corpoLimpo();
    delete (sem as Record<string, unknown>).mensagem;
    const r = await POST(pedir(sem, autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/receber um silêncio não é receber/i);
  });

  it('"iniciar" recusa fio e recusa mensagem, e exige assunto', async () => {
    const base = { ...corpoLimpo(), acao: "iniciar", assunto: "Rodada de homologação" };
    delete (base as Record<string, unknown>).mensagem;

    const comFio = await POST(pedir({ ...base, fio: "connect:foocci:qualquer" }, autorizado));
    expect(comFio.status).toBe(400);
    expect((await comFio.json()).motivo).toMatch(/iniciar é ABRIR um fio/i);

    const comMensagem = await POST(pedir({ ...base, mensagem: "oi" }, autorizado));
    expect(comMensagem.status).toBe(400);
    expect((await comMensagem.json()).motivo).toMatch(/quem inicia não está respondendo ninguém/i);

    const semAssunto = { ...base };
    delete (semAssunto as Record<string, unknown>).assunto;
    const r = await POST(pedir(semAssunto, autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/exige "assunto"/i);

    expect(memoria.runs).toHaveLength(0);
  });

  it('"responder" sem fio é recusado no contrato', async () => {
    const r = await POST(pedir(corpoLimpo({ acao: "responder" }), autorizado));
    expect(r.status).toBe(400);
    expect((await r.json()).motivo).toMatch(/só se responde dentro de uma conversa que já existe/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it('⭐ "responder" num fio que não existe no banco é RECUSA, não conversa nova', async () => {
    // Um fio com a FORMA certa (ver B-5) e que simplesmente não existe: o ponto
    // aqui é o "não tem turno gravado", e não a forma.
    const r = await POST(
      pedir(corpoLimpo({ acao: "responder", fio: FIO_BEM_FORMADO }), autorizado),
    );
    expect(r.status).toBe(422);
    const corpo = await r.json();
    expect(corpo.estado).toBe("recusado");
    expect(corpo.motivo).toMatch(/não tem nenhum turno gravado/i);
    expect(memoria.runs).toHaveLength(0);
  });

  it("cenarios fora da faixa ou fora do tipo é recusa, nunca corte silencioso", async () => {
    for (const valor of [0, 99, "3", 2.5]) {
      const r = await POST(pedir(corpoLimpo({ cenarios: valor }), autorizado));
      expect(r.status, `cenarios=${JSON.stringify(valor)}`).toBe(400);
    }
    expect(memoria.runs).toHaveLength(0);
  });

  it("⭐ a outra metade — iniciar abre o fio, e responder continua NELE, no turno 2", async () => {
    const iniciada = await POST(
      pedir(
        {
          modo: "homologacao",
          sintetico: true,
          acao: "iniciar",
          de: DIRETOR_GERAL,
          para: GERENTE_DO_PRODUTO,
          assunto: "Rodada de homologação do agente de atendimento",
          cenarios: 2,
        },
        autorizado,
      ),
    );
    const abertura = await iniciada.json();
    expect(abertura.estado, JSON.stringify(abertura)).toBe("executado");
    expect(abertura.turno).toBe(1);
    expect(abertura.fio).toMatch(/^connect:foocci:/);

    const resposta = await POST(
      pedir(
        corpoLimpo({ acao: "responder", fio: abertura.fio, mensagem: "E o que reprovou?", cenarios: 2 }),
        autorizado,
      ),
    );
    const segundo = await resposta.json();
    expect(segundo.estado, JSON.stringify(segundo)).toBe("executado");
    expect(segundo.turno).toBe(2);
    expect(segundo.fio).toBe(abertura.fio);

    // O histórico foi PRESERVADO: o artefato do turno 2 conhece o turno 1.
    const artefato = JSON.parse(segundo.artefato);
    expect(artefato.fio_anterior.turnos_anteriores).toBe(1);
    expect(artefato.fio_anterior.rodadas).toEqual([abertura.rodadaId]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("⭐ a caixa postal — esta porta grava `entregue`, e nunca `acionado`", () => {
  it("a resposta declara o que foi gravado e o que NUNCA é gravado", async () => {
    const r = await POST(pedir(corpoLimpo(), autorizado));
    const corpo = await r.json();

    expect(corpo.estado).toBe("executado");
    expect(corpo.caixa.estado).toBe("entregue");
    expect(corpo.caixa.gravado).toBe(true);
    expect(corpo.caixa.nunca_grava).toBe("acionado");
    expect(corpo.caixa.porque).toMatch(/carimbo do lado de lá/i);
    expect(corpo.caixa.vocabulario).toEqual(["entregue", "acionado", "respondido", "nao_verificavel"]);
  });

  it("⭐ e o que ficou GRAVADO no banco diz `entregue` — a palavra `acionado` não aparece", async () => {
    await POST(pedir(corpoLimpo(), autorizado));
    const metadata = String(memoria.runs[0]!.metadata);
    const gravado = JSON.parse(metadata);

    expect(gravado.connect.estado).toBe("entregue");
    expect(metadata).not.toContain("acionado");
    // E a garantia do laboratório continua de pé, por cima do que a porta anexou.
    expect(gravado.runtimeTouched).toBe(false);
  });

  it("quando nada é executado, a caixa diz que NÃO gravou — em vez de omitir", async () => {
    const r = await POST(pedir(corpoLimpo({ modo: "producao" }), autorizado));
    const corpo = await r.json();
    expect(corpo.caixa.gravado).toBe(false);
    expect(corpo.caixa.estado).toBeNull();
    expect(corpo.caixa.nunca_grava).toBe("acionado");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("⭐ a prova é relida do banco, e o acionamento é grátis", () => {
  it("a resposta traz o identificador LIDO de volta, não um id deduzido", async () => {
    const r = await POST(pedir(corpoLimpo(), autorizado));
    const corpo = await r.json();

    expect(corpo.prova.tabela).toBe("agent_simulation_runs");
    expect(corpo.prova.relido_do_banco).toBe(true);
    expect(corpo.prova.rodadaId).toBe(memoria.runs[0]!.id);
    expect(corpo.rodadaId).toBe(memoria.runs[0]!.id);
    expect(db.agentSimulationRun.findUnique).toHaveBeenCalled();
    expect(corpo.prova.cenarios).toBeGreaterThan(0);
  });

  /**
   * ⭐⭐ O ACHADO B-2, VIRADO DO AVESSO.
   *
   * Estes dois campos eram literais escritos à mão DENTRO do bloco `prova`, que
   * se declara `relido_do_banco: true`. O que este teste cobra agora é a
   * separação: o que está em `prova` veio do banco, o que está em `medicao` foi
   * medido aqui e diz isso na cara.
   */
  it("⭐ o `runtime_tocado` da prova veio dos METADADOS DA LINHA relida, não da porta", async () => {
    const r = await POST(pedir(corpoLimpo(), autorizado));
    const corpo = await r.json();

    expect(corpo.prova.relido_do_banco).toBe(true);
    expect(corpo.prova.runtime_tocado).toBe(false);

    // E a prova de que veio de lá: é o mesmo valor que está gravado na linha, e
    // quem o escreveu foi o armazém do laboratório, não esta porta.
    const gravado = JSON.parse(String(memoria.runs[0]!.metadata));
    expect(gravado.runtimeTouched).toBe(false);
    expect(corpo.prova.runtime_tocado).toBe(gravado.runtimeTouched);

    // O que NÃO é relido não mora mais no bloco que diz "relido do banco".
    expect(corpo.prova.usou_ia).toBeUndefined();
  });

  it("⭐ o que foi MEDIDO mora em `medicao`, e o bloco declara que não é relido", async () => {
    const r = await POST(pedir(corpoLimpo(), autorizado));
    const corpo = await r.json();

    expect(corpo.medicao.relido_do_banco).toBe(false);
    expect(corpo.medicao.fonte).toMatch(/não lido do banco/i);
    expect(corpo.medicao.usou_ia).toBe(false);
    expect(corpo.medicao.cenarios_com_ia).toBe(0);
    expect(corpo.medicao.runtime_tocado_declarado).toBe(false);
  });

  it("⭐ e a rede foi CONTADA durante o acionamento: zero chamadas, com o canal medido", async () => {
    const r = await POST(pedir(corpoLimpo(), autorizado));
    const corpo = await r.json();

    expect(corpo.medicao.rede.chamadas).toBe(0);
    expect(corpo.medicao.rede.destinos).toEqual([]);
    // O canal por onde sairia a chamada de IA foi realmente instrumentado — sem
    // isto, "zero" seria só a ausência de medição.
    expect(corpo.medicao.rede.canais).toContain("fetch");
    expect(corpo.medicao.rede.fonte).toMatch(/medido no processo/i);
  });

  it("os cenários foram gravados junto — a rodada não é uma linha vazia", async () => {
    await POST(pedir(corpoLimpo({ cenarios: 3 }), autorizado));
    expect(memoria.cenarios.length).toBe(3);
    expect(memoria.runs[0]!.scenariosTotal).toBe(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("o selo de rascunho, nos dois lugares", () => {
  it("⭐ a resposta diz RASCUNHO sem que ninguém precise abrir o artefato", async () => {
    const r = await POST(pedir(corpoLimpo(), autorizado));
    const corpo = await r.json();

    expect(corpo.rascunho).toBe(true);
    expect(corpo.natureza).toBe("RASCUNHO");
    expect(corpo.aviso).toMatch(/não é a comunicação final/i);
    expect(corpo.aviso).toMatch(/sem provedor de IA/i);
  });

  it("e o TEXTO do artefato também abre se declarando rascunho", async () => {
    const r = await POST(pedir(corpoLimpo(), autorizado));
    const artefato = JSON.parse((await r.json()).artefato);

    expect(artefato.rascunho).toBe(true);
    expect(artefato.natureza).toBe("RASCUNHO");
    expect(String(artefato.aviso)).toMatch(/NÃO É A COMUNICAÇÃO FINAL DO GERENTE/);
    expect(String(artefato.origem)).toMatch(/determinístico/i);
    expect(artefato.entrega_para).toBe(GERENTE_DO_PRODUTO);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("o cadastro do produto — legível de fora, com a divergência declarada", () => {
  function pedirCadastro(cabecalhos: Record<string, string> = {}): NextRequest {
    return new NextRequest("http://localhost/api/connect/cadastro", { method: "GET", headers: cabecalhos });
  }

  it("sem segredo, o cadastro também está fechado", async () => {
    vi.stubEnv("DIOLI_CONNECT_SECRET", "");
    expect((await CADASTRO(pedirCadastro(autorizado))).status).toBe(503);
  });

  it("com segredo errado: 401", async () => {
    expect((await CADASTRO(pedirCadastro({ [CABECALHO_DO_SEGREDO]: "chute" }))).status).toBe(401);
  });

  it("⭐ o produto está cadastrado, com o Diretor lido do organograma canônico", async () => {
    const corpo = await (await CADASTRO(pedirCadastro(autorizado))).json();

    expect(corpo.estado).toBe("cadastrado");
    expect(corpo.produto).toBe("foocci");
    expect(corpo.diretor.slug).toBe(DIRETOR_DO_PRODUTO);
    expect(corpo.diretor.nivel).toBe("DIRETOR");
    expect(corpo.diretor.fonte).toBe("organograma-canonico");
    expect(corpo.gerente_do_agente.slug).toBe(GERENTE_DO_PRODUTO);
    expect(corpo.agentes_acionaveis).toEqual([AGENTE_DO_PILOTO]);
  });

  it("⭐ e declara que o Gerente Geral NÃO existe aqui, com o motivo — em vez de inventar o cargo", async () => {
    const corpo = await (await CADASTRO(pedirCadastro(autorizado))).json();

    expect(corpo.gerente_geral).toBeNull();
    expect(corpo.por_que_sem_gerente_geral).toMatch(/decisão do CEO em 25\/08\/2026/i);
    expect(corpo.por_que_sem_gerente_geral).toMatch(/segunda taxonomia/i);
    expect(corpo.por_que_sem_gerente_geral).toContain(GERENTE_DO_PRODUTO);
  });
});
