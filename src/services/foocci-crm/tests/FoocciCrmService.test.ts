/**
 * A trava do registro: NENHUMA mudança de etapa sem autor e data.
 *
 * O pedido do CEO — "cada mudança registrada com data e quem mudou" — vira
 * código aqui. Se alguém, um dia, "simplificar" o serviço para dar um update
 * direto no `stage`, estes testes caem.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  siteLead: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  siteLeadInteraction: {
    create: vi.fn(),
  },
  // A transação é a garantia de atomicidade: aqui ela só devolve as operações
  // recebidas, e os testes inspecionam o que foi mandado para dentro dela.
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  moverEtapa, registrarInteracao, excluirContato, maisAvancadaAlcancada,
} from "../FoocciCrmService";

beforeEach(() => {
  vi.clearAllMocks();
  db.siteLead.findUnique.mockResolvedValue({ id: "l1", stage: "NOVO" });
  db.siteLead.update.mockReturnValue({ __op: "update" });
  db.siteLead.delete.mockResolvedValue({});
  db.siteLeadInteraction.create.mockReturnValue({ __op: "interaction" });
  db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("moverEtapa — o registro é obrigatório, não opcional", () => {
  it("grava a interação com quem mudou, de onde para onde e quando", async () => {
    const antes = Date.now();
    const r = await moverEtapa({ leadId: "l1", para: "PRIMEIRO_CONTATO", actor: "admin", nota: "mandei o primeiro oi" });
    const depois = Date.now();

    expect(r.ok).toBe(true);
    expect(r.de).toBe("NOVO");
    expect(r.para).toBe("PRIMEIRO_CONTATO");

    const interacao = db.siteLeadInteraction.create.mock.calls[0]![0].data;
    expect(interacao.tipo).toBe("MUDANCA_ETAPA");
    expect(interacao.fromStage).toBe("NOVO");
    expect(interacao.toStage).toBe("PRIMEIRO_CONTATO");
    expect(interacao.actor).toBe("admin");           // ← QUEM mudou
    expect(interacao.nota).toBe("mandei o primeiro oi");
    expect(interacao.createdAt).toBeInstanceOf(Date); // ← QUANDO mudou
    expect(interacao.createdAt.getTime()).toBeGreaterThanOrEqual(antes);
    expect(interacao.createdAt.getTime()).toBeLessThanOrEqual(depois);
  });

  it("o estado e o histórico vão na MESMA transação", async () => {
    await moverEtapa({ leadId: "l1", para: "QUALIFICADO", actor: "admin" });

    expect(db.$transaction).toHaveBeenCalledOnce();
    const ops = db.$transaction.mock.calls[0]![0] as unknown[];
    expect(ops).toHaveLength(2);
    // Se o update passasse e a interação falhasse, o funil mostraria um contato
    // numa etapa que ninguém moveu.
    expect(db.siteLead.update).toHaveBeenCalledOnce();
    expect(db.siteLeadInteraction.create).toHaveBeenCalledOnce();
  });

  it("o contato guarda o autor e a data da etapa atual", async () => {
    await moverEtapa({ leadId: "l1", para: "PROPOSTA_ENVIADA", actor: "sdr-agent" });

    const dados = db.siteLead.update.mock.calls[0]![0].data;
    expect(dados.stage).toBe("PROPOSTA_ENVIADA");
    expect(dados.stageChangedBy).toBe("sdr-agent");
    expect(dados.stageChangedAt).toBeInstanceOf(Date);
  });

  it("a data do contato e a da interação são a MESMA", async () => {
    await moverEtapa({ leadId: "l1", para: "GANHO", actor: "admin" });

    const noContato = db.siteLead.update.mock.calls[0]![0].data.stageChangedAt as Date;
    const naInteracao = db.siteLeadInteraction.create.mock.calls[0]![0].data.createdAt as Date;
    // Duas datas geradas separadamente divergem por milissegundos e, um dia,
    // por uma virada de dia — e aí o histórico contradiz o contato.
    expect(noContato.getTime()).toBe(naInteracao.getTime());
  });

  it("recusa mover para a etapa em que já está — sem escrever nada", async () => {
    db.siteLead.findUnique.mockResolvedValue({ id: "l1", stage: "PROPOSTA_ENVIADA" });

    const r = await moverEtapa({ leadId: "l1", para: "PROPOSTA_ENVIADA", actor: "admin" });

    expect(r.ok).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.siteLeadInteraction.create).not.toHaveBeenCalled();
  });

  it("recusa etapa inexistente", async () => {
    const r = await moverEtapa({ leadId: "l1", para: "QUASE" as never, actor: "admin" });
    expect(r.ok).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("contato inexistente não vira registro fantasma", async () => {
    db.siteLead.findUnique.mockResolvedValue(null);
    const r = await moverEtapa({ leadId: "sumiu", para: "PRIMEIRO_CONTATO", actor: "admin" });
    expect(r.ok).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("aceita pular etapas — e o pulo fica registrado", async () => {
    const r = await moverEtapa({ leadId: "l1", para: "GANHO", actor: "admin" });
    expect(r.ok).toBe(true);
    const i = db.siteLeadInteraction.create.mock.calls[0]![0].data;
    expect(i.fromStage).toBe("NOVO");
    expect(i.toStage).toBe("GANHO");
  });
});

describe("registrarInteracao — o que move a fila do SDR e o que não move", () => {
  it("mensagem enviada marca o contato como abordado", async () => {
    await registrarInteracao({ leadId: "l1", tipo: "MENSAGEM_ENVIADA", actor: "admin" });

    const dados = db.siteLead.update.mock.calls[0]![0].data;
    expect(dados.lastContactedAt).toBeInstanceOf(Date);
  });

  it("anotação interna NÃO marca o contato como abordado", async () => {
    // Senão o contato sai da fila de "ainda não abordados" sem ninguém ter
    // falado com ele — e o SDR perde gente por causa de um lembrete.
    await registrarInteracao({ leadId: "l1", tipo: "NOTA", actor: "admin", nota: "ligar depois" });

    const dados = db.siteLead.update.mock.calls[0]![0].data;
    expect(dados.lastContactedAt).toBeUndefined();
    expect(dados.lastInteractionAt).toBeInstanceOf(Date);
  });

  it("resposta do contato também não conta como abordagem nossa", async () => {
    await registrarInteracao({ leadId: "l1", tipo: "RESPOSTA_RECEBIDA", actor: "admin" });
    expect(db.siteLead.update.mock.calls[0]![0].data.lastContactedAt).toBeUndefined();
  });

  it("toda interação carrega autor e data", async () => {
    await registrarInteracao({ leadId: "l1", tipo: "LIGACAO", actor: "sdr-agent", nota: "não atendeu" });
    const i = db.siteLeadInteraction.create.mock.calls[0]![0].data;
    expect(i.actor).toBe("sdr-agent");
    expect(i.nota).toBe("não atendeu");
    expect(i.createdAt).toBeInstanceOf(Date);
  });

  it("nota em branco vira null, não string vazia", async () => {
    await registrarInteracao({ leadId: "l1", tipo: "NOTA", actor: "admin", nota: "   " });
    expect(db.siteLeadInteraction.create.mock.calls[0]![0].data.nota).toBeNull();
  });
});

describe("excluirContato", () => {
  it("apaga de verdade — direito de eliminação, não arquivamento", async () => {
    const r = await excluirContato("l1");
    expect(r.ok).toBe(true);
    expect(db.siteLead.delete).toHaveBeenCalledWith({ where: { id: "l1" } });
  });

  it("contato inexistente devolve erro em vez de estourar", async () => {
    db.siteLead.delete.mockRejectedValue(new Error("not found"));
    const r = await excluirContato("sumiu");
    expect(r.ok).toBe(false);
  });
});

describe("maisAvancadaAlcancada", () => {
  it("usa o histórico, não o estado atual", () => {
    expect(maisAvancadaAlcancada("PERDIDO", ["PRIMEIRO_CONTATO", "QUALIFICADO", "PROPOSTA_ENVIADA", "PERDIDO"]))
      .toBe("PROPOSTA_ENVIADA");
  });

  it("sem histórico, é a etapa atual", () => {
    expect(maisAvancadaAlcancada("PRIMEIRO_CONTATO", [])).toBe("PRIMEIRO_CONTATO");
  });

  it("um contato só perdido, sem histórico, ainda alcançou NOVO", () => {
    expect(maisAvancadaAlcancada("PERDIDO", [])).toBe("NOVO");
  });

  it("voltar de etapa não apaga o topo alcançado", () => {
    expect(maisAvancadaAlcancada("PRIMEIRO_CONTATO", ["PROPOSTA_ENVIADA", "PRIMEIRO_CONTATO"])).toBe("PROPOSTA_ENVIADA");
  });
});
