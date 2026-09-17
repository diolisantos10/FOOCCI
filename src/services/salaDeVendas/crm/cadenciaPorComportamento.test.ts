/**
 * A CADÊNCIA COM "SE" — ramificação, parada, idempotência e a trava.
 *
 * ── O QUE ESTE ARQUIVO PRECISA PROVAR, E POR QUÊ ────────────────────────────
 *
 * O banco falso aqui **guarda estado**, pela mesma razão do teste de B1: "rodar
 * duas vezes não duplica" e "o passo não avança quando a trava recusa" só são
 * demonstráveis contra algo que lembre da primeira vez. Um mock que aceita tudo
 * faria o teste da trava passar com o motor quebrado — régua verde no
 * componente errado.
 *
 * O envio é injetado (`enviar`) e **nunca** chama o canal de verdade: o que se
 * prova aqui é que a recusa da trava não avança o passo, não que a Meta aceita.
 */

import { describe, it, expect, vi } from "vitest";
import {
  PARADAS,
  CATALOGO_DE_CONDICOES,
  chaveDaCondicao,
  condicaoDoPasso,
  condicaoSatisfeita,
  conferirParada,
  ehPassoDeMaquina,
  executarPasso,
  rodarCadencias,
} from "./cadenciaPorComportamento";
import { classificarFollowUp, type FichaParaClassificar } from "./estadoDeFollowUp";
import type { ResultadoDaAbordagem } from "../abordar";

const AGORA = new Date("2026-09-17T12:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000);
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000);

function ficha(p: Partial<FichaParaClassificar> = {}): FichaParaClassificar {
  return {
    leadId: "lead-1",
    nome: "Sushi House",
    stage: "PRIMEIRO_CONTATO",
    temperatura: null,
    score: null,
    optOutAt: null,
    lastContactedAt: null,
    primeiraRespostaEm: null,
    ultimaEntradaEm: null,
    propostas: [],
    compromissos: [],
    temOportunidadeGanha: false,
    valorPotencialCents: null,
    ...p,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A PARADA
// ─────────────────────────────────────────────────────────────────────────────

describe("condição de parada — respondeu, comprou, pediu remoção", () => {
  it("as três paradas que o comando nomeia existem, com motivo escrito", () => {
    const motivos = PARADAS.map((p) => p.motivo);
    expect(motivos).toContain("respondeu");
    expect(motivos).toContain("comprou");
    expect(motivos).toContain("pediuRemocao");
    for (const p of PARADAS) expect(p.explicacao.length).toBeGreaterThan(20);
  });

  it("pedido de silêncio para, e é a PRIMEIRA parada — obrigação legal vem antes", () => {
    expect(PARADAS[0]!.motivo).toBe("pediuRemocao");
    const c = classificarFollowUp(ficha({ optOutAt: diasAtras(1) }), AGORA);
    expect(conferirParada(c)?.motivo).toBe("pediuRemocao");
  });

  it("quem respondeu e está decidindo para a cadência — automação não atropela conversa", () => {
    const c = classificarFollowUp(ficha({ primeiraRespostaEm: diasAtras(2), ultimaEntradaEm: diasAtras(1) }), AGORA);
    expect(c.estado).toBe("PENSANDO");
    expect(conferirParada(c)?.motivo).toBe("respondeu");
  });

  it("quem comprou para, e a saída fica CONCLUIDA, não cancelada", () => {
    const c = classificarFollowUp(ficha({ stage: "GANHO" }), AGORA);
    expect(conferirParada(c)?.motivo).toBe("comprou");
  });

  it("quem sumiu NÃO para — é exatamente quem a cadência existe para alcançar", () => {
    const c = classificarFollowUp(ficha({ primeiraRespostaEm: diasAtras(30), ultimaEntradaEm: diasAtras(20) }), AGORA);
    expect(c.estado).toBe("CLIENTE_SUMIU");
    expect(conferirParada(c)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A CONDIÇÃO
// ─────────────────────────────────────────────────────────────────────────────

describe("condição do passo — ramificar por comportamento", () => {
  it("passo sem condição declarada executa, como sempre executou", () => {
    expect(condicaoDoPasso("cadencia-que-nao-esta-no-catalogo", 0)).toBeNull();
    const c = classificarFollowUp(ficha({ lastContactedAt: diasAtras(3) }), AGORA);
    expect(condicaoSatisfeita(null, c, ficha())).toBe(true);
  });

  it("o segundo toque de 'retomada-sem-resposta' só vale para quem continua em silêncio", () => {
    const condicao = condicaoDoPasso("retomada-sem-resposta", 1)!;
    expect(condicao).toBeTruthy();

    const sumido = classificarFollowUp(ficha({ primeiraRespostaEm: diasAtras(30), ultimaEntradaEm: diasAtras(20) }), AGORA);
    expect(condicaoSatisfeita(condicao, sumido, ficha())).toBe(true);

    const abandonou = classificarFollowUp(
      ficha({
        propostas: [
          { situacao: "RASCUNHO", valorMensalCent: 1000, enviadaEm: null, respondidaEm: null, atualizadaEm: horasAtras(5) },
        ],
      }),
      AGORA,
    );
    expect(condicaoSatisfeita(condicao, abandonou, ficha())).toBe(false);
  });

  it("⭐ a condição extra ramifica além do estado: segunda cobrança exige valor estimado", () => {
    const condicao = condicaoDoPasso("proposta-sem-retorno", 1)!;
    const proposta = ficha({
      propostas: [
        { situacao: "ENVIADA", valorMensalCent: 1000, enviadaEm: diasAtras(5), respondidaEm: null, atualizadaEm: diasAtras(5) },
      ],
    });
    const c = classificarFollowUp(proposta, AGORA);
    expect(c.estado).toBe("PROPOSTA_PARADA");

    expect(condicaoSatisfeita(condicao, c, { ...proposta, valorPotencialCents: 120_000 })).toBe(true);
    expect(condicaoSatisfeita(condicao, c, { ...proposta, valorPotencialCents: null })).toBe(false);
  });

  it("toda chave do catálogo tem descrição legível e pelo menos um estado", () => {
    for (const [chave, cond] of Object.entries(CATALOGO_DE_CONDICOES)) {
      expect(chave).toMatch(/^[a-z-]+#\d+$/);
      expect(cond.descricao.length).toBeGreaterThan(10);
      expect(cond.estados.length).toBeGreaterThan(0);
    }
  });

  it("a chave é slug#ordem", () => {
    expect(chaveDaCondicao("retomada-sem-resposta", 2)).toBe("retomada-sem-resposta#2");
  });
});

describe("quem executa o passo", () => {
  it("passo de humano nunca vira mensagem automática", () => {
    expect(ehPassoDeMaquina("HUMANO", "MENSAGEM")).toBe(false);
    expect(ehPassoDeMaquina("HUMANO", "LIGACAO")).toBe(false);
  });

  it("ligação e reunião não são mensagem, nem quando o executor é a IA", () => {
    expect(ehPassoDeMaquina("IA", "LIGACAO")).toBe(false);
    expect(ehPassoDeMaquina("IA", "CONFIRMACAO_DE_REUNIAO")).toBe(false);
    expect(ehPassoDeMaquina("IA", "MENSAGEM")).toBe(true);
    expect(ehPassoDeMaquina("SISTEMA", "FOLLOW_UP")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O BANCO FALSO, COM AS RESTRIÇÕES QUE IMPORTAM
// ─────────────────────────────────────────────────────────────────────────────

type Linha = Record<string, any>;

function bancoFalso(opcoes: {
  lead: Partial<FichaParaClassificar> & { id?: string };
  passos: { ordem: number; esperaHoras: number; titulo?: string; tipo?: string; executor?: string }[];
  passoAtual?: number;
  slug?: string;
}) {
  const leadId = opcoes.lead.id ?? "lead-1";
  const f = ficha(opcoes.lead);

  const leads: Linha[] = [
    {
      id: leadId,
      nome: f.nome,
      stage: f.stage,
      temperatura: f.temperatura,
      score: f.score,
      optOutAt: f.optOutAt,
      lastContactedAt: f.lastContactedAt,
      primeiraRespostaEm: f.primeiraRespostaEm,
      ultimaMensagemEm: f.ultimaEntradaEm,
      ultimaMensagemDeQuem: f.ultimaEntradaEm ? "ENTRADA" : null,
      propostas: f.propostas.map((p) => ({ ...p, updatedAt: p.atualizadaEm })),
      compromissos: f.compromissos,
      oportunidades: f.temOportunidadeGanha
        ? [{ estagio: "GANHA", valorPotencialCents: f.valorPotencialCents }]
        : f.valorPotencialCents !== null
          ? [{ estagio: "NEGOCIACAO", valorPotencialCents: f.valorPotencialCents }]
          : [],
      proximaAcaoEm: null,
      proximaAcaoNota: null,
    },
  ];

  const inscricoes: Linha[] = [
    {
      id: "insc-1",
      leadId,
      cadenciaId: "cad-1",
      situacao: "ATIVA",
      passoAtual: opcoes.passoAtual ?? 0,
      proximoEm: horasAtras(1),
      motivoDaSaida: null,
    },
  ];

  // `passosVencidos()` lê título, tipo e executor do passo. O falso precisa
  // devolvê-los, senão a rodada testaria um passo sem identidade.
  const passos = opcoes.passos.map((p) => ({
    titulo: `passo ${p.ordem}`,
    tipo: "MENSAGEM",
    executor: "IA",
    templateNome: "reengajamento_v1",
    roteiro: null,
    ...p,
  }));

  const tarefas: Linha[] = [];
  const interacoes: Linha[] = [];
  let seq = 0;

  const db: any = {
    siteLead: {
      findUnique: async ({ where }: any) => leads.find((l) => l.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const l = leads.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return l;
      },
    },
    siteLeadInteraction: {
      create: async ({ data }: any) => {
        interacoes.push(data);
        return data;
      },
    },
    leadCadencia: {
      findUnique: async ({ where }: any) => {
        const i = inscricoes.find((x) => x.id === where.id);
        if (!i) return null;
        return { ...i, cadencia: { passos } };
      },
      findMany: async ({ where }: any) => {
        const ids: string[] | undefined = where?.id?.in;
        return inscricoes
          .filter((i) => (ids ? ids.includes(i.id as string) : i.situacao === "ATIVA"))
          .map((i) => ({
            ...i,
            cadencia: { slug: opcoes.slug ?? "retomada-sem-resposta", passos },
          }));
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const i of inscricoes) {
          if (where.id && i.id !== where.id) continue;
          if (where.leadId && i.leadId !== where.leadId) continue;
          if (where.situacao && i.situacao !== where.situacao) continue;
          if (where.passoAtual !== undefined && i.passoAtual !== where.passoAtual) continue;
          Object.assign(i, data);
          count += 1;
        }
        return { count };
      },
    },
    leadTarefa: {
      findFirst: async ({ where }: any) =>
        tarefas.find(
          (t) =>
            t.leadId === where.leadId &&
            (where.cadenciaId === undefined || t.cadenciaId === where.cadenciaId) &&
            (where.titulo === undefined || t.titulo === where.titulo) &&
            (where.situacao === undefined || t.situacao === where.situacao),
        ) ?? null,
      create: async ({ data }: any) => {
        const linha = { id: `tar-${++seq}`, situacao: "ABERTA", ...data };
        tarefas.push(linha);
        return linha;
      },
    },
    $transaction: async (fn: any) => fn(db),
  };

  return { db, leads, inscricoes, tarefas, interacoes };
}

const PASSO_DE_MENSAGEM = {
  leadCadenciaId: "insc-1",
  leadId: "lead-1",
  passo: 1,
  titulo: "segundo toque",
  tipo: "MENSAGEM" as const,
  executor: "IA" as const,
  templateNome: "reengajamento_v1",
  roteiro: null,
  cadenciaSlug: "retomada-sem-resposta",
};

const OPCOES = { agora: AGORA, autor: "SISTEMA" as const, autorUserId: "user-1" };

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTAR UM PASSO
// ─────────────────────────────────────────────────────────────────────────────

describe("executarPasso — a ordem é classificar, parar, condicionar, executar, avançar", () => {
  const passos = [
    { ordem: 0, esperaHoras: 2 },
    { ordem: 1, esperaHoras: 24 },
    { ordem: 2, esperaHoras: 72 },
  ];

  it("⭐ o contato respondeu: a cadência PARA e nada é enviado", async () => {
    const { db, inscricoes } = bancoFalso({
      lead: { primeiraRespostaEm: diasAtras(2), ultimaEntradaEm: diasAtras(1) },
      passos,
      passoAtual: 1,
    });
    const enviar = vi.fn();

    const r = await executarPasso(db, PASSO_DE_MENSAGEM, { ...OPCOES, enviar });

    expect(r).toMatchObject({ desfecho: "parou", motivo: "respondeu" });
    expect(enviar).not.toHaveBeenCalled();
    expect(inscricoes[0]!.situacao).toBe("CANCELADA");
    expect(inscricoes[0]!.motivoDaSaida).toContain("respondeu");
  });

  it("⭐ o contato comprou: para como CONCLUIDA, com o pós-venda nomeado no motivo", async () => {
    const { db, inscricoes } = bancoFalso({ lead: { stage: "GANHO" }, passos, passoAtual: 1 });
    const r = await executarPasso(db, PASSO_DE_MENSAGEM, { ...OPCOES, enviar: vi.fn() });

    expect(r).toMatchObject({ desfecho: "parou", motivo: "comprou" });
    expect(inscricoes[0]!.situacao).toBe("CONCLUIDA");
    expect(inscricoes[0]!.motivoDaSaida).toContain("pós-venda");
  });

  it("⭐ o contato pediu remoção: para, e o motivo fica auditável", async () => {
    const { db, inscricoes } = bancoFalso({ lead: { optOutAt: diasAtras(1) }, passos, passoAtual: 1 });
    const r = await executarPasso(db, PASSO_DE_MENSAGEM, { ...OPCOES, enviar: vi.fn() });

    expect(r).toMatchObject({ desfecho: "parou", motivo: "pediuRemocao" });
    expect(inscricoes[0]!.motivoDaSaida).toContain("pediuRemocao");
  });

  it("⭐ a condição não casa: o passo é PULADO, a cadência segue e o pulo fica escrito", async () => {
    // O passo 1 de "retomada-sem-resposta" exige silêncio. Este contato tem carrinho
    // abandonado — outro estado, outro tratamento.
    const { db, inscricoes, interacoes } = bancoFalso({
      lead: {
        propostas: [
          { situacao: "RASCUNHO", valorMensalCent: 29_900, enviadaEm: null, respondidaEm: null, atualizadaEm: horasAtras(5) },
        ],
      },
      passos,
      passoAtual: 1,
    });
    const enviar = vi.fn();

    const r = await executarPasso(db, PASSO_DE_MENSAGEM, { ...OPCOES, enviar });

    expect(r.desfecho).toBe("pulou");
    expect(enviar).not.toHaveBeenCalled();
    expect(inscricoes[0]!.passoAtual).toBe(2);
    expect(inscricoes[0]!.situacao).toBe("ATIVA");
    expect(interacoes[0]!.nota).toContain("CARRINHO_ABANDONADO");
    expect(interacoes[0]!.interna).toBe(true);
  });

  it("a condição casa: envia pelo motor de sempre e avança", async () => {
    const { db, inscricoes } = bancoFalso({
      lead: { primeiraRespostaEm: diasAtras(40), ultimaEntradaEm: diasAtras(30), lastContactedAt: diasAtras(30) },
      passos,
      passoAtual: 1,
    });
    const enviar = vi.fn(async (): Promise<ResultadoDaAbordagem> => ({ abordou: true, mensagemId: "msg-1" }));

    const r = await executarPasso(db, PASSO_DE_MENSAGEM, { ...OPCOES, enviar });

    expect(r).toMatchObject({ desfecho: "executou", comoFez: "mensagem", terminou: false });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect((enviar.mock.calls[0] as unknown[])[1]).toMatchObject({
      leadId: "lead-1",
      autor: "SISTEMA",
      autorUserId: "user-1",
    });
    expect(inscricoes[0]!.passoAtual).toBe(2);
  });

  it("⛔ A TRAVA RECUSOU: o passo NÃO avança e volta como pendência", async () => {
    const { db, inscricoes } = bancoFalso({
      lead: { primeiraRespostaEm: diasAtras(40), ultimaEntradaEm: diasAtras(30), lastContactedAt: diasAtras(30) },
      passos,
      passoAtual: 1,
    });
    const enviar = vi.fn(
      async (): Promise<ResultadoDaAbordagem> => ({
        abordou: false,
        motivo: "ritmo",
        detalhe: "teto diário de abordagens atingido",
      }),
    );

    const r = await executarPasso(db, PASSO_DE_MENSAGEM, { ...OPCOES, enviar });

    expect(r).toEqual({ desfecho: "pendente", motivo: "ritmo", detalhe: "teto diário de abordagens atingido" });
    // O passo continua onde estava: perder o toque E marcar como feito seria o
    // pior dos dois mundos.
    expect(inscricoes[0]!.passoAtual).toBe(1);
    expect(inscricoes[0]!.situacao).toBe("ATIVA");
  });

  it("recusa do portão do lead também deixa pendente, sem avançar", async () => {
    const { db, inscricoes } = bancoFalso({
      lead: { primeiraRespostaEm: diasAtras(40), ultimaEntradaEm: diasAtras(30), lastContactedAt: diasAtras(30) },
      passos,
      passoAtual: 1,
    });
    const enviar = vi.fn(
      async (): Promise<ResultadoDaAbordagem> => ({
        abordou: false,
        motivo: "portaoRecusou",
        detalhe: "fora da janela de horário",
      }),
    );

    const r = await executarPasso(db, PASSO_DE_MENSAGEM, { ...OPCOES, enviar });
    expect(r).toMatchObject({ desfecho: "pendente", motivo: "portaoRecusou" });
    expect(inscricoes[0]!.passoAtual).toBe(1);
  });

  it("passo de humano vira tarefa, e nada é enviado", async () => {
    const { db, tarefas } = bancoFalso({
      lead: { primeiraRespostaEm: diasAtras(40), ultimaEntradaEm: diasAtras(30), lastContactedAt: diasAtras(30) },
      passos,
      passoAtual: 1,
    });
    const enviar = vi.fn();

    const r = await executarPasso(
      db,
      { ...PASSO_DE_MENSAGEM, tipo: "LIGACAO", executor: "HUMANO", titulo: "ligar para o decisor" },
      { ...OPCOES, enviar },
    );

    expect(r).toMatchObject({ desfecho: "executou", comoFez: "tarefa" });
    expect(enviar).not.toHaveBeenCalled();
    expect(tarefas).toHaveLength(1);
    expect(tarefas[0]!.titulo).toBe("ligar para o decisor");
  });

  it("⭐ IDEMPOTÊNCIA: rodar o mesmo passo de humano duas vezes não cria duas tarefas", async () => {
    const { db, tarefas } = bancoFalso({
      lead: { primeiraRespostaEm: diasAtras(40), ultimaEntradaEm: diasAtras(30), lastContactedAt: diasAtras(30) },
      passos,
      passoAtual: 1,
    });
    const passoHumano = { ...PASSO_DE_MENSAGEM, tipo: "LIGACAO" as const, executor: "HUMANO" as const };

    await executarPasso(db, passoHumano, { ...OPCOES, enviar: vi.fn() });
    // Segunda passada: o passo já avançou, mas o dedupe da tarefa é o que se
    // prova aqui — a rodada duplicada não pode produzir duas ligações.
    await executarPasso(db, passoHumano, { ...OPCOES, enviar: vi.fn() });

    expect(tarefas).toHaveLength(1);
  });

  it("no último passo a cadência termina, em vez de virar inscrição zumbi", async () => {
    const { db, inscricoes } = bancoFalso({
      lead: { primeiraRespostaEm: diasAtras(40), ultimaEntradaEm: diasAtras(30), lastContactedAt: diasAtras(30) },
      passos: [{ ordem: 0, esperaHoras: 2 }, { ordem: 1, esperaHoras: 24 }],
      passoAtual: 1,
    });
    const enviar = vi.fn(async (): Promise<ResultadoDaAbordagem> => ({ abordou: true, mensagemId: "m" }));

    const r = await executarPasso(db, PASSO_DE_MENSAGEM, { ...OPCOES, enviar });

    expect(r).toMatchObject({ desfecho: "executou", terminou: true, proximoEm: null });
    expect(inscricoes[0]!.situacao).toBe("CONCLUIDA");
  });

  it("lead que sumiu da base não derruba a rodada", async () => {
    const { db } = bancoFalso({ lead: { id: "outro" }, passos, passoAtual: 1 });
    const r = await executarPasso(db, PASSO_DE_MENSAGEM, { ...OPCOES, enviar: vi.fn() });
    expect(r).toEqual({ desfecho: "leadSumiuDaBase" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A RODADA
// ─────────────────────────────────────────────────────────────────────────────

describe("rodarCadencias — a rodada conta o que fez e mostra o que a trava barrou", () => {
  it("contabiliza execução e deixa a pendência visível", async () => {
    const { db } = bancoFalso({
      lead: { primeiraRespostaEm: diasAtras(40), ultimaEntradaEm: diasAtras(30), lastContactedAt: diasAtras(30) },
      passos: [{ ordem: 0, esperaHoras: 2 }, { ordem: 1, esperaHoras: 24 }],
      passoAtual: 1,
      slug: "retomada-sem-resposta",
    });

    const barrado = await rodarCadencias(db, {
      ...OPCOES,
      enviar: async () => ({ abordou: false, motivo: "ritmo", detalhe: "teto diário" }),
    });

    expect(barrado.vistos).toBe(1);
    expect(barrado.executados).toBe(0);
    expect(barrado.pendentes).toHaveLength(1);
    expect(barrado.pendentes[0]).toMatchObject({ leadId: "lead-1", motivo: "ritmo" });
  });

  it("a rodada com envio liberado executa e não deixa pendência", async () => {
    const { db } = bancoFalso({
      lead: { primeiraRespostaEm: diasAtras(40), ultimaEntradaEm: diasAtras(30), lastContactedAt: diasAtras(30) },
      passos: [{ ordem: 0, esperaHoras: 2 }, { ordem: 1, esperaHoras: 24 }],
      passoAtual: 1,
      slug: "retomada-sem-resposta",
    });

    const r = await rodarCadencias(db, {
      ...OPCOES,
      enviar: async () => ({ abordou: true, mensagemId: "m" }),
    });

    expect(r).toMatchObject({ vistos: 1, executados: 1, pulados: 0, parados: 0 });
    expect(r.pendentes).toHaveLength(0);
  });

  it("quem respondeu entra na contagem de paradas, não na de executados", async () => {
    const { db } = bancoFalso({
      lead: { primeiraRespostaEm: diasAtras(2), ultimaEntradaEm: diasAtras(1) },
      passos: [{ ordem: 0, esperaHoras: 2 }, { ordem: 1, esperaHoras: 24 }],
      passoAtual: 1,
      slug: "retomada-sem-resposta",
    });

    const r = await rodarCadencias(db, { ...OPCOES, enviar: async () => ({ abordou: true, mensagemId: "m" }) });
    expect(r).toMatchObject({ vistos: 1, executados: 0, parados: 1 });
  });
});
