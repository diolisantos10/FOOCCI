/**
 * A distribuição: quem PODE antes de quem é a VEZ.
 *
 * O defeito que estes testes existem para impedir não é "ninguém pegou o lead".
 * É pior: alguém pegou e não podia atender. A fila fica limpa, o lead esfria, e
 * nada na tela indica que houve problema.
 */

import { describe, it, expect, vi } from "vitest";
import {
  podeReceber,
  escolherResponsavel,
  descreverInaptidao,
  transferir,
  assuncaoDoGerente,
  type CandidatoADistribuicao,
} from "./distribuicao";

const AGORA = new Date("2026-08-25T12:00:00Z");

const sdr = (over: Partial<CandidatoADistribuicao> = {}): CandidatoADistribuicao => ({
  userId: "u1",
  nome: "Ana",
  estado: "DISPONIVEL",
  capacidade: 10,
  carga: 2,
  especialidades: [],
  regioes: [],
  pausadoAte: null,
  ultimoRecebimentoEm: new Date("2026-08-25T09:00:00Z"),
  ...over,
});

describe("quem pode receber", () => {
  it("disponível e com folga pode", () => {
    // A metade que PASSA. Sem ela, uma função que recusasse todo mundo passaria
    // em todos os testes abaixo.
    expect(podeReceber(sdr(), AGORA)).toEqual({ apto: true });
  });

  it("offline não pode", () => {
    expect(podeReceber(sdr({ estado: "OFFLINE" }), AGORA)).toEqual({
      apto: false, motivo: "offline",
    });
  });

  it("pausado não pode", () => {
    const r = podeReceber(
      sdr({ estado: "PAUSADO", pausadoAte: new Date("2026-08-25T13:00:00Z") }),
      AGORA,
    );
    expect(r).toEqual({ apto: false, motivo: "pausado" });
  });

  it("pausa VENCIDA não segura ninguém", () => {
    // O SDR voltou do almoço e esqueceu de despausar. Uma pausa eterna esvazia a
    // operação em silêncio.
    const r = podeReceber(
      sdr({ estado: "PAUSADO", pausadoAte: new Date("2026-08-25T11:00:00Z") }),
      AGORA,
    );
    expect(r).toEqual({ apto: true });
  });

  it("no limite de atendimentos não pode", () => {
    expect(podeReceber(sdr({ carga: 10, capacidade: 10 }), AGORA)).toEqual({
      apto: false, motivo: "noLimite",
    });
  });

  it("sem a especialidade exigida não pode", () => {
    const r = podeReceber(sdr({ especialidades: ["pizzaria"] }), AGORA, {
      especialidade: "japonês",
    });
    expect(r).toEqual({ apto: false, motivo: "semEspecialidade" });
  });

  it("com a especialidade, pode — e a comparação ignora caixa", () => {
    const r = podeReceber(sdr({ especialidades: ["Pizzaria"] }), AGORA, {
      especialidade: "pizzaria",
    });
    expect(r.apto).toBe(true);
  });

  it("o motivo vem junto, e não só o `false`", () => {
    // É o motivo que permite ao painel dizer "3 pausados, 2 no limite" em vez de
    // mostrar uma fila parada sem explicação.
    const r = podeReceber(sdr({ estado: "OFFLINE" }), AGORA);
    expect(r.motivo).toBeDefined();
  });
});

describe("escolher quem recebe", () => {
  it("modo MANUAL não escolhe ninguém — e é o padrão", () => {
    // A fila fica visível e é puxada por quem está livre. Distribuir automático
    // antes de existirem SDRs cadastrados empurra lead para caixa vazia — e lead
    // atribuído a ninguém é mais difícil de achar que lead na fila aberta.
    const r = escolherResponsavel("MANUAL", [sdr()], AGORA);
    expect(r).toEqual({ escolhido: false, motivo: "modoManual" });
  });

  it("DISPONIBILIDADE escolhe quem tem menos conversa aberta", () => {
    const r = escolherResponsavel("DISPONIBILIDADE", [
      sdr({ userId: "a", carga: 8 }),
      sdr({ userId: "b", carga: 1 }),
      sdr({ userId: "c", carga: 5 }),
    ], AGORA);

    expect(r.escolhido && r.userId).toBe("b");
  });

  it("RODIZIO escolhe quem recebeu há mais tempo", () => {
    const r = escolherResponsavel("RODIZIO", [
      sdr({ userId: "a", ultimoRecebimentoEm: new Date("2026-08-25T11:00:00Z") }),
      sdr({ userId: "b", ultimoRecebimentoEm: new Date("2026-08-25T08:00:00Z") }),
    ], AGORA);

    expect(r.escolhido && r.userId).toBe("b");
  });

  it("quem nunca recebeu vem primeiro no rodízio", () => {
    const r = escolherResponsavel("RODIZIO", [
      sdr({ userId: "a", ultimoRecebimentoEm: new Date("2026-08-25T08:00:00Z") }),
      sdr({ userId: "novo", ultimoRecebimentoEm: null }),
    ], AGORA);

    expect(r.escolhido && r.userId).toBe("novo");
    expect(r.escolhido && r.porque).toMatch(/ainda não recebeu/);
  });

  it("o rodízio pula quem não pode receber", () => {
    // É a vez do 'a', mas ele está pausado. O lead não pode ficar esperando ele
    // voltar do almoço.
    const r = escolherResponsavel("RODIZIO", [
      sdr({ userId: "a", ultimoRecebimentoEm: null, estado: "PAUSADO", pausadoAte: new Date("2026-08-25T14:00:00Z") }),
      sdr({ userId: "b", ultimoRecebimentoEm: new Date("2026-08-25T08:00:00Z") }),
    ], AGORA);

    expect(r.escolhido && r.userId).toBe("b");
  });

  it("ninguém apto devolve a CONTA dos motivos", () => {
    const r = escolherResponsavel("RODIZIO", [
      sdr({ userId: "a", estado: "OFFLINE" }),
      sdr({ userId: "b", estado: "OFFLINE" }),
      sdr({ userId: "c", carga: 10, capacidade: 10 }),
    ], AGORA);

    expect(r.escolhido).toBe(false);
    if (!r.escolhido && r.motivo === "ninguemApto") {
      expect(r.detalhe.offline).toBe(2);
      expect(r.detalhe.noLimite).toBe(1);
    }
  });

  it("time vazio não escolhe ninguém", () => {
    const r = escolherResponsavel("RODIZIO", [], AGORA);
    expect(r.escolhido).toBe(false);
  });

  it("ESPECIALIDADE faz rodízio DENTRO do grupo que atende à exigência", () => {
    const r = escolherResponsavel("ESPECIALIDADE", [
      sdr({ userId: "generalista", ultimoRecebimentoEm: null, especialidades: [] }),
      sdr({ userId: "japones", especialidades: ["japonês"], ultimoRecebimentoEm: new Date("2026-08-25T11:00:00Z") }),
    ], AGORA, { especialidade: "japonês" });

    expect(r.escolhido && r.userId).toBe("japones");
  });
});

describe("a explicação da fila parada", () => {
  it("descreve os motivos em português", () => {
    expect(descreverInaptidao({
      offline: 3, pausado: 2, noLimite: 1, semEspecialidade: 0, semRegiao: 0,
    })).toBe("ninguém disponível: 3 offline, 2 pausado(s), 1 no limite de atendimentos");
  });

  it("time inexistente tem texto próprio", () => {
    // "Ninguém disponível" com o time vazio mandaria o gerente procurar gente
    // que nunca foi cadastrada.
    expect(descreverInaptidao({
      offline: 0, pausado: 0, noLimite: 0, semEspecialidade: 0, semRegiao: 0,
    })).toBe("não há SDR cadastrado com disponibilidade");
  });
});

describe("transferir entre pessoas", () => {
  const db = (count = 1) => ({
    siteLead: { updateMany: vi.fn().mockResolvedValue({ count }) },
    siteLeadInteraction: { create: vi.fn().mockResolvedValue({}) },
  });

  it("com motivo, transfere", () => {
    return expect(
      transferir(db() as never, {
        leadId: "l1", deUserId: "u1", paraUserId: "u2", motivo: "vou sair de férias",
      }),
    ).resolves.toEqual({ ok: true, leadId: "l1" });
  });

  it("sem motivo NÃO transfere, e não toca no banco", async () => {
    const banco = db();
    const r = await transferir(banco as never, {
      leadId: "l1", deUserId: "u1", paraUserId: "u2", motivo: "  ",
    });

    expect(r).toEqual({ ok: false, causa: "semMotivo" });
    expect(banco.siteLead.updateMany).not.toHaveBeenCalled();
  });

  it("só o DONO transfere — a condição vai dentro da escrita", async () => {
    // Um SDR não move o lead de outro. Para isso existe a assunção do gerente,
    // que é outra função e fica gravada como tal.
    const banco = db();
    await transferir(banco as never, {
      leadId: "l1", deUserId: "u1", paraUserId: "u2", motivo: "x",
    });

    expect(banco.siteLead.updateMany.mock.calls[0]![0].where).toEqual({
      id: "l1", atendidoPor: "HUMANO", atendenteUserId: "u1",
    });
  });

  it("quem não é dono recebe recusa explicada", async () => {
    const r = await transferir(db(0) as never, {
      leadId: "l1", deUserId: "naoDono", paraUserId: "u2", motivo: "x",
    });
    expect(r).toEqual({ ok: false, causa: "naoEhSeu" });
  });

  it("transferir para si mesmo não é transferência", async () => {
    const banco = db();
    const r = await transferir(banco as never, {
      leadId: "l1", deUserId: "u1", paraUserId: "u1", motivo: "x",
    });

    expect(r).toEqual({ ok: false, causa: "mesmaPessoa" });
    expect(banco.siteLead.updateMany).not.toHaveBeenCalled();
  });
});

describe("a assunção do gerente", () => {
  const db = (count = 1) => ({
    siteLead: { updateMany: vi.fn().mockResolvedValue({ count }) },
    siteLeadInteraction: { create: vi.fn().mockResolvedValue({}) },
  });

  it("com motivo, tira o lead de quem estiver com ele", () => {
    return expect(
      assuncaoDoGerente(db() as never, {
        leadId: "l1", gerenteUserId: "g1", motivo: "cliente reclamou do atendimento",
      }),
    ).resolves.toEqual({ ok: true, leadId: "l1" });
  });

  it("SEM motivo não faz nada", async () => {
    // É a única função da casa que sobrescreve um dono humano. Sem motivo
    // obrigatório viraria o atalho para qualquer atrito de fila, e o histórico
    // não saberia dizer por que o lead mudou de mão três vezes numa tarde.
    const banco = db();
    const r = await assuncaoDoGerente(banco as never, {
      leadId: "l1", gerenteUserId: "g1", motivo: "",
    });

    expect(r).toEqual({ ok: false, causa: "semMotivo" });
    expect(banco.siteLead.updateMany).not.toHaveBeenCalled();
  });

  it("o motivo fica gravado com o nome de quem fez", async () => {
    const banco = db();
    await assuncaoDoGerente(banco as never, {
      leadId: "l1", gerenteUserId: "g1", motivo: "cliente reclamou",
    });

    const interacao = banco.siteLeadInteraction.create.mock.calls[0]![0].data;
    expect(interacao.actor).toBe("g1");
    expect(interacao.nota).toContain("cliente reclamou");
    expect(interacao.interna).toBe(true);
  });

  it("diferente de transferir, NÃO exige ser o dono atual", async () => {
    // É exatamente a diferença entre as duas funções.
    const banco = db();
    await assuncaoDoGerente(banco as never, {
      leadId: "l1", gerenteUserId: "g1", motivo: "x",
    });

    expect(banco.siteLead.updateMany.mock.calls[0]![0].where).toEqual({ id: "l1" });
  });
});
