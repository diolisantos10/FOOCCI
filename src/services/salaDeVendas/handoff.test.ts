/**
 * Os gatilhos do handoff e o dossiê que vai junto.
 *
 * O teste que carrega mais peso aqui é o da ORDEM: o motivo gravado é o primeiro
 * da lista, e é a primeira coisa que quem pega o lead lê. "Pediu desconto"
 * explica a conversa; "score atingiu limite" não explica nada.
 */

import { describe, it, expect, vi } from "vitest";
import {
  gatilhosQueDispararam,
  validarDossie,
  registrarHandoff,
  aceitarHandoff,
  esperaPorGente,
  passarParaGente,
  devolverParaIAComDossie,
  fecharHandoffAbertoDoLead,
  REGRA_PADRAO,
} from "./handoff";

const AGORA = new Date("2026-08-25T12:00:00Z");

describe("quando a IA larga", () => {
  it("conversa tranquila NÃO dispara nada", () => {
    // A metade que passa. Sem ela, um gatilho que disparasse sempre passaria em
    // todos os testes abaixo.
    expect(gatilhosQueDispararam({})).toEqual([]);
  });

  it("pedido explícito de humano dispara", () => {
    expect(gatilhosQueDispararam({ pediuHumano: true })).toContain("PEDIU_HUMANO");
  });

  it("desconto SEMPRE sai da mão da IA", () => {
    // Negociar é fora da alçada dela, por decisão e não por capacidade.
    expect(gatilhosQueDispararam({ pediuDesconto: true })).toContain("PEDIU_DESCONTO");
  });

  it("baixa confiança do próprio modelo dispara", () => {
    expect(gatilhosQueDispararam({ confiancaDaIA: 0.3 })).toContain("IA_INSEGURA");
  });

  it("confiança alta não dispara", () => {
    expect(gatilhosQueDispararam({ confiancaDaIA: 0.9 })).not.toContain("IA_INSEGURA");
  });

  it("score no limite dispara", () => {
    expect(gatilhosQueDispararam({ score: 85 })).toContain("SCORE_ATINGIU_LIMITE");
  });

  it("score abaixo do limite não dispara", () => {
    expect(gatilhosQueDispararam({ score: 40 })).not.toContain("SCORE_ATINGIU_LIMITE");
  });

  it("informação não confirmada dispara — a IA não inventa", () => {
    expect(gatilhosQueDispararam({ informacaoNaoConfirmada: true }))
      .toContain("INFORMACAO_NAO_CONFIRMADA");
  });
});

describe("a ordem dos motivos é o que quem pega o lead vai ler primeiro", () => {
  it("o que o LEAD pediu vem antes do que nós calculamos", () => {
    const r = gatilhosQueDispararam({ score: 90, pediuDesconto: true });
    expect(r[0]).toBe("PEDIU_DESCONTO");
  });

  it("pedido de humano vence tudo", () => {
    const r = gatilhosQueDispararam({
      pediuHumano: true, pediuDesconto: true, risco: true, score: 95,
    });
    expect(r[0]).toBe("PEDIU_HUMANO");
  });

  it("risco vem antes dos limites técnicos da IA", () => {
    const r = gatilhosQueDispararam({ risco: true, confiancaDaIA: 0.1 });
    expect(r.indexOf("RISCO")).toBeLessThan(r.indexOf("IA_INSEGURA"));
  });
});

describe("gatilho desligado não dispara", () => {
  it("com a lista vazia, a IA nunca larga sozinha", () => {
    const r = gatilhosQueDispararam(
      { pediuHumano: true, risco: true, score: 99 },
      { ...REGRA_PADRAO, ligados: [] },
    );
    expect(r).toEqual([]);
  });

  it("e liga um por um", () => {
    const r = gatilhosQueDispararam(
      { pediuHumano: true, risco: true },
      { ...REGRA_PADRAO, ligados: ["RISCO"] },
    );
    expect(r).toEqual(["RISCO"]);
  });
});

describe("o dossiê", () => {
  it("IA → humano COM resumo passa", () => {
    const r = validarDossie({
      de: "IA", para: "HUMANO", motivo: "PEDIU_HUMANO",
      dossie: { resumo: "quer preço para 3 unidades" },
    });
    expect(r).toEqual([]);
  });

  it("IA → humano SEM resumo é recusado", () => {
    // Sem resumo, quem pega relê a conversa inteira — e no dia movimentado não
    // relê: pergunta de novo tudo que a pessoa já respondeu.
    const r = validarDossie({
      de: "IA", para: "HUMANO", motivo: "PEDIU_HUMANO", dossie: {},
    });
    expect(r.map((x) => x.campo)).toContain("resumo");
  });

  it("humano → IA SEM objetivo é recusado", () => {
    const r = validarDossie({
      de: "HUMANO", para: "IA", motivo: "DEVOLUCAO_PARA_IA", dossie: {},
    });
    expect(r.map((x) => x.campo)).toContain("objetivo");
  });

  it("humano → IA COM objetivo passa", () => {
    const r = validarDossie({
      de: "HUMANO", para: "IA", motivo: "DEVOLUCAO_PARA_IA",
      dossie: { objetivo: "confirmar a reunião de quinta" },
    });
    expect(r).toEqual([]);
  });

  it("distribuição operacional não exige nada — não houve conversa para resumir", () => {
    const r = validarDossie({
      de: "NINGUEM", para: "HUMANO", motivo: "DISTRIBUICAO", dossie: {},
    });
    expect(r).toEqual([]);
  });

  it("humano → humano não exige resumo: quem entrega não é a IA", () => {
    const r = validarDossie({
      de: "HUMANO", para: "HUMANO", motivo: "PEDIU_HUMANO", dossie: {},
    });
    expect(r).toEqual([]);
  });
});

describe("registrar a passagem", () => {
  const db = () => ({ leadHandoff: { create: vi.fn().mockResolvedValue({ id: "h1" }) } });

  it("dossiê inválido não chega ao banco", async () => {
    const banco = db();
    const r = await registrarHandoff(banco as never, {
      leadId: "l1", de: "IA", para: "AGUARDANDO_HUMANO",
      motivo: "PEDIU_HUMANO", dossie: {},
    });

    expect(r.ok).toBe(false);
    expect(banco.leadHandoff.create).not.toHaveBeenCalled();
  });

  it("o dossiê é CONGELADO no registro, não recalculado depois", async () => {
    // Recalcular mostraria o que se sabe hoje, e não o que a pessoa tinha em
    // mãos. Auditoria que julga com informação futura não é auditoria.
    const banco = db();
    await registrarHandoff(banco as never, {
      leadId: "l1", de: "IA", para: "AGUARDANDO_HUMANO", motivo: "PEDIU_PROPOSTA",
      dossie: { resumo: "quer proposta", scoreNoMomento: 72, etapaNoMomento: "QUALIFICADO" },
    });

    const data = banco.leadHandoff.create.mock.calls[0]![0].data;
    expect(data.scoreNoMomento).toBe(72);
    expect(data.etapaNoMomento).toBe("QUALIFICADO");
  });

  it("sem destinatário nomeado, o handoff nasce ESPERANDO", async () => {
    const banco = db();
    await registrarHandoff(banco as never, {
      leadId: "l1", de: "IA", para: "AGUARDANDO_HUMANO", motivo: "PEDIU_HUMANO",
      dossie: { resumo: "x" }, agora: AGORA,
    });
    expect(banco.leadHandoff.create.mock.calls[0]![0].data.aceitoEm).toBeNull();
  });

  it("com destinatário nomeado, já nasce aceito — não houve espera", async () => {
    const banco = db();
    await registrarHandoff(banco as never, {
      leadId: "l1", de: "HUMANO", para: "HUMANO", motivo: "DISTRIBUICAO",
      dossie: {}, paraUserId: "u2", agora: AGORA,
    });
    expect(banco.leadHandoff.create.mock.calls[0]![0].data.aceitoEm).toEqual(AGORA);
  });
});

describe("aceitar um handoff", () => {
  function banco(over: Record<string, unknown> = {}) {
    return {
      leadHandoff: {
        findUnique: vi.fn().mockResolvedValue({
          id: "h1", leadId: "l1", aceitoEm: null, paraUserId: null, ...over,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      siteLead: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
      },
      siteLeadInteraction: { create: vi.fn().mockResolvedValue({}) },
    };
  }

  it("quem chega primeiro leva", async () => {
    const db = banco();
    const r = await aceitarHandoff(db as never, { handoffId: "h1", userId: "u1", agora: AGORA });
    expect(r).toEqual({ ok: true, handoffId: "h1", leadId: "l1" });
  });

  it("o lead troca de dono ANTES de o handoff ser marcado", async () => {
    // A ordem é o desenho: marcar o handoff primeiro criaria o estado mais
    // confuso possível — o registro diz que Fulano pegou, e o lead está com
    // outra pessoa.
    const db = banco();
    await aceitarHandoff(db as never, { handoffId: "h1", userId: "u1", agora: AGORA });

    const ordemDono = db.siteLead.updateMany.mock.invocationCallOrder[0]!;
    const ordemHandoff = db.leadHandoff.updateMany.mock.invocationCallOrder[0]!;
    expect(ordemDono).toBeLessThan(ordemHandoff);
  });

  it("se o lead já tem dono, o handoff NÃO é marcado", async () => {
    const db = banco();
    db.siteLead.updateMany.mockResolvedValueOnce({ count: 0 });
    db.siteLead.findUnique.mockResolvedValueOnce({
      atendidoPor: "HUMANO", atendenteUserId: "outro",
    });

    const r = await aceitarHandoff(db as never, { handoffId: "h1", userId: "u1" });

    expect(r).toEqual({ ok: false, causa: "leadJaTemDono" });
    expect(db.leadHandoff.updateMany).not.toHaveBeenCalled();
  });

  it("handoff já aceito não é aceito de novo", async () => {
    const db = banco({ aceitoEm: AGORA, paraUserId: "u9" });
    const r = await aceitarHandoff(db as never, { handoffId: "h1", userId: "u1" });

    expect(r).toEqual({ ok: false, causa: "jaAceito", porUserId: "u9" });
    expect(db.siteLead.updateMany).not.toHaveBeenCalled();
  });
});

describe("a espera por gente", () => {
  const db = (datas: Date[]) => ({
    leadHandoff: {
      findMany: vi.fn().mockResolvedValue(datas.map((createdAt) => ({ createdAt }))),
    },
  });

  it("fila vazia NÃO é zero minutos de espera", async () => {
    // Zero afirma "estamos atendendo na hora". Sem fila é outra coisa. O dia
    // parado e o dia perfeito não podem virar o mesmo número verde.
    const r = await esperaPorGente(db([]) as never, AGORA);
    expect(r).toEqual({ medido: false, motivo: "nenhumAberto" });
  });

  it("com fila, mede pelo mais antigo", async () => {
    const r = await esperaPorGente(
      db([
        new Date("2026-08-25T11:30:00Z"),
        new Date("2026-08-25T11:50:00Z"),
      ]) as never,
      AGORA,
    );

    expect(r).toEqual({ medido: true, handoffsAbertos: 2, maiorEsperaMin: 30 });
  });
});

/**
 * ── AS TRÊS QUE JUNTAM AS DUAS METADES ──────────────────────────────────────
 *
 * Antes destas funções a rota chamava só `responsavel.ts`: o dono do lead
 * trocava e `lead_handoffs` nunca recebia uma linha. Nada dava erro — os
 * indicadores de "taxa e motivo de handoff" simplesmente respondiam sobre uma
 * tabela vazia, e uma tabela vazia parece um dia calmo.
 *
 * Por isso os testes abaixo insistem tanto na ORDEM e nos casos de recusa: o
 * defeito que eles guardam não é uma exceção, é um silêncio.
 */
describe("passar o lead para gente, com dossiê e gatilho", () => {
  function banco(over: Record<string, unknown> = {}) {
    return {
      siteLead: {
        findUnique: vi.fn().mockResolvedValue({
          atendidoPor: "IA", score: 72, stage: "EM_QUALIFICACAO", ...over,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      siteLeadInteraction: { create: vi.fn().mockResolvedValue({}) },
      leadHandoff: { create: vi.fn().mockResolvedValue({ id: "h1" }) },
    };
  }

  const DOSSIE = { resumo: "pizzaria, 2 unidades, quer parar de pagar comissão" };

  it("passa, troca o dono e GRAVA o registro", async () => {
    const db = banco();
    const r = await passarParaGente(db as never, {
      leadId: "l1",
      motivoEscrito: "pediu para falar com uma pessoa",
      dossie: DOSSIE,
      motivoExplicito: "PEDIU_HUMANO",
      agora: AGORA,
    });

    expect(r).toEqual({ ok: true, leadId: "l1", handoffId: "h1", motivo: "PEDIU_HUMANO" });
    expect(db.leadHandoff.create).toHaveBeenCalledTimes(1);
  });

  it("sem resumo, NÃO troca o dono — a recusa vem antes da escrita", async () => {
    // O teste mais importante deste bloco. Recusar depois de já ter trocado
    // deixaria o lead esperando gente sem nenhum registro do porquê — que é
    // exatamente o estado que esta seção existe para impedir.
    const db = banco();
    const r = await passarParaGente(db as never, {
      leadId: "l1",
      motivoEscrito: "pediu gente",
      dossie: {},
      motivoExplicito: "PEDIU_HUMANO",
    });

    expect(r.ok).toBe(false);
    if (!r.ok && r.causa === "dossieIncompleto") {
      expect(r.recusas.map((x) => x.campo)).toContain("resumo");
    }
    expect(db.siteLead.updateMany).not.toHaveBeenCalled();
    expect(db.leadHandoff.create).not.toHaveBeenCalled();
  });

  it("o dono troca ANTES de o registro ser gravado", async () => {
    const db = banco();
    await passarParaGente(db as never, {
      leadId: "l1",
      motivoEscrito: "pediu gente",
      dossie: DOSSIE,
      motivoExplicito: "PEDIU_HUMANO",
    });

    expect(db.siteLead.updateMany.mock.invocationCallOrder[0]!).toBeLessThan(
      db.leadHandoff.create.mock.invocationCallOrder[0]!,
    );
  });

  it("o dossiê congela o score e a etapa DAQUELE momento", async () => {
    // Sem isso a auditoria julgaria a decisão de quem pegou o lead com
    // informação que ele não tinha.
    const db = banco();
    await passarParaGente(db as never, {
      leadId: "l1",
      motivoEscrito: "pediu gente",
      dossie: DOSSIE,
      motivoExplicito: "PEDIU_HUMANO",
    });

    const data = db.leadHandoff.create.mock.calls[0]![0].data;
    expect(data.scoreNoMomento).toBe(72);
    expect(data.etapaNoMomento).toBe("EM_QUALIFICACAO");
  });

  it("sem gatilho e sem motivo explícito, recusa", async () => {
    const db = banco();
    const r = await passarParaGente(db as never, {
      leadId: "l1",
      motivoEscrito: "sei lá",
      dossie: DOSSIE,
      sinais: {}, // conversa tranquila: nada dispara
    });

    expect(r).toEqual({ ok: false, causa: "semGatilho" });
    expect(db.siteLead.updateMany).not.toHaveBeenCalled();
  });

  it("os sinais escolhem o gatilho, e o primeiro da ordem vence", async () => {
    const db = banco();
    const r = await passarParaGente(db as never, {
      leadId: "l1",
      motivoEscrito: "quer desconto",
      dossie: DOSSIE,
      // Os dois disparam; "pediu desconto" explica a conversa, "score" não.
      sinais: { pediuDesconto: true, score: 90 },
    });

    expect(r.ok && r.motivo).toBe("PEDIU_DESCONTO");
  });

  it("se o lead já não era da IA, nada é gravado", async () => {
    const db = banco();
    db.siteLead.updateMany.mockResolvedValueOnce({ count: 0 });
    db.siteLead.findUnique.mockResolvedValueOnce({
      atendidoPor: "IA", score: 10, stage: "NOVO",
    });
    db.siteLead.findUnique.mockResolvedValueOnce({ atendidoPor: "HUMANO" });

    const r = await passarParaGente(db as never, {
      leadId: "l1",
      motivoEscrito: "pediu gente",
      dossie: DOSSIE,
      motivoExplicito: "PEDIU_HUMANO",
    });

    expect(r.ok).toBe(false);
    expect(db.leadHandoff.create).not.toHaveBeenCalled();
  });
});

describe("devolver para a IA também vira registro", () => {
  function banco() {
    return {
      siteLead: {
        findUnique: vi.fn().mockResolvedValue({ score: 55, stage: "QUALIFICADO" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      siteLeadInteraction: { create: vi.fn().mockResolvedValue({}) },
      leadHandoff: { create: vi.fn().mockResolvedValue({ id: "h2" }) },
    };
  }

  it("grava com motivo DEVOLUCAO_PARA_IA", async () => {
    // Sem esta linha, `lead_handoffs` contaria só as saídas da IA — e a razão
    // entre "quantas vezes largou" e "quantas voltaram" ficaria sem denominador.
    const db = banco();
    const r = await devolverParaIAComDossie(db as never, {
      leadId: "l1",
      userId: "u1",
      objetivo: "confirmar o horário da demonstração",
      agora: AGORA,
    });

    expect(r).toEqual({ ok: true, leadId: "l1", handoffId: "h2" });
    const data = db.leadHandoff.create.mock.calls[0]![0].data;
    expect(data.motivo).toBe("DEVOLUCAO_PARA_IA");
    expect(data.de).toBe("HUMANO");
    expect(data.para).toBe("IA");
  });

  it("sem objetivo, não devolve nem grava", async () => {
    const db = banco();
    const r = await devolverParaIAComDossie(db as never, {
      leadId: "l1",
      userId: "u1",
      objetivo: "   ",
    });

    expect(r.ok).toBe(false);
    expect(db.siteLead.updateMany).not.toHaveBeenCalled();
    expect(db.leadHandoff.create).not.toHaveBeenCalled();
  });
});

describe("fechar o handoff de quem foi assumido pela fila", () => {
  function banco(aberto: unknown) {
    return {
      leadHandoff: {
        findFirst: vi.fn().mockResolvedValue(aberto),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  it("fecha o mais antigo e devolve quanto tempo esperou", async () => {
    const db = banco({ id: "h1", createdAt: new Date("2026-08-25T11:15:00Z") });
    const r = await fecharHandoffAbertoDoLead(db as never, {
      leadId: "l1", userId: "u1", agora: AGORA,
    });

    expect(r).toEqual({ fechou: true, handoffId: "h1", esperaMin: 45 });
    // O mais ANTIGO: fechar o mais novo deixaria o veterano aberto para sempre,
    // inflando a espera do painel com um registro que já foi atendido.
    expect(db.leadHandoff.findFirst.mock.calls[0]![0].orderBy).toEqual({ createdAt: "asc" });
  });

  it("lead sem handoff aberto NÃO é erro", async () => {
    // É o caminho mais comum de todos: lead em `NINGUEM`, que nunca passou pela
    // IA. Tratar como falha faria a tela mostrar erro no clique normal.
    const db = banco(null);
    const r = await fecharHandoffAbertoDoLead(db as never, { leadId: "l1", userId: "u1" });

    expect(r).toEqual({ fechou: false, handoffId: null, esperaMin: null });
    expect(db.leadHandoff.updateMany).not.toHaveBeenCalled();
  });

  it("perder a corrida do fechamento não inventa espera", async () => {
    const db = banco({ id: "h1", createdAt: new Date("2026-08-25T11:15:00Z") });
    db.leadHandoff.updateMany.mockResolvedValueOnce({ count: 0 });

    const r = await fecharHandoffAbertoDoLead(db as never, {
      leadId: "l1", userId: "u1", agora: AGORA,
    });

    expect(r).toEqual({ fechou: false, handoffId: "h1", esperaMin: null });
  });
});
