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
