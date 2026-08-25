import { describe, it, expect, vi } from "vitest";
import {
  iaPodeEnviar,
  deQuemE,
  podeSerAssumidoPorHumano,
  assumirComoHumano,
  devolverParaIA,
  pedirHumano,
  esperaPorGente,
} from "./responsavel";

function bancoFalso(contagem: number, atual: unknown = null) {
  return {
    siteLead: {
      updateMany: vi.fn().mockResolvedValue({ count: contagem }),
      findUnique: vi.fn().mockResolvedValue(atual),
    },
    siteLeadInteraction: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("a IA só envia quando o lead é dela", () => {
  it("com a IA responsável, pode enviar", () => {
    expect(iaPodeEnviar("IA")).toBe(true);
  });

  it("com humano responsável, NÃO envia", () => {
    // É a metade que impede a mensagem fantasma: a IA começou a redigir quando o
    // lead era dela e terminou quando já não era.
    expect(iaPodeEnviar("HUMANO")).toBe(false);
  });

  it("sem dono, também NÃO envia", () => {
    // `NINGUEM` não é permissão. Um lead sem dono não autoriza ninguém a falar
    // em nome da empresa — inclusive a IA.
    expect(iaPodeEnviar("NINGUEM")).toBe(false);
  });

  it("esperando gente, NÃO envia", () => {
    expect(iaPodeEnviar("AGUARDANDO_HUMANO")).toBe(false);
  });
});

describe("de quem é o lead, em português", () => {
  it.each([
    ["NINGUEM", "ninguém"],
    ["IA", "IA"],
    ["HUMANO", "humano"],
    ["AGUARDANDO_HUMANO", "aguardando gente"],
  ] as const)("%s → %s", (estado, esperado) => {
    expect(deQuemE(estado)).toBe(esperado);
  });
});

describe("quem pode ser assumido", () => {
  it.each(["NINGUEM", "IA", "AGUARDANDO_HUMANO"] as const)("%s pode", (estado) => {
    expect(podeSerAssumidoPorHumano(estado)).toBe(true);
  });

  it("lead que já tem dono humano NÃO é assumido por outro", () => {
    // Roubar conversa de colega em silêncio produz exatamente o defeito que a
    // atomicidade existe para evitar: dois donos, duas respostas.
    expect(podeSerAssumidoPorHumano("HUMANO")).toBe(false);
  });
});

describe("assumir é escrita condicional, não leitura seguida de escrita", () => {
  it("a condição de estado vai DENTRO do where do update", async () => {
    // Este é o teste que protege a propriedade inteira. Se alguém trocar por
    // `findUnique` + `if` + `update`, a janela de corrida volta e nada mais
    // reclama.
    const db = bancoFalso(1);
    await assumirComoHumano(db as never, { leadId: "l1", userId: "u1" });

    const where = db.siteLead.updateMany.mock.calls[0]![0].where;
    expect(where.id).toBe("l1");
    expect(where.atendidoPor).toEqual({ in: ["NINGUEM", "IA", "AGUARDANDO_HUMANO"] });
  });

  it("quem ganha vira responsável e o histórico registra", async () => {
    const db = bancoFalso(1);
    const r = await assumirComoHumano(db as never, { leadId: "l1", userId: "u1" });

    expect(r).toEqual({ ok: true, leadId: "l1" });
    const dados = db.siteLead.updateMany.mock.calls[0]![0].data;
    expect(dados.atendidoPor).toBe("HUMANO");
    expect(dados.atendenteUserId).toBe("u1");
    expect(db.siteLeadInteraction.create).toHaveBeenCalledOnce();
    expect(db.siteLeadInteraction.create.mock.calls[0]![0].data.tipo).toBe("ASSUMIU_HUMANO");
  });

  it("o registro de quem assumiu é INTERNO — o lead não vê", async () => {
    const db = bancoFalso(1);
    await assumirComoHumano(db as never, { leadId: "l1", userId: "u1" });
    expect(db.siteLeadInteraction.create.mock.calls[0]![0].data.interna).toBe(true);
  });

  it("assumir limpa o motivo do pedido — a fila não fica com resto", async () => {
    const db = bancoFalso(1);
    await assumirComoHumano(db as never, { leadId: "l1", userId: "u1" });
    expect(db.siteLead.updateMany.mock.calls[0]![0].data.motivoDoPedido).toBeNull();
  });

  it("quem perde recebe recusa explicada, não sucesso falso", async () => {
    const db = bancoFalso(0, { atendidoPor: "HUMANO", atendenteUserId: "outro" });
    const r = await assumirComoHumano(db as never, { leadId: "l1", userId: "u1" });

    expect(r).toEqual({
      ok: false,
      causa: "jaTemDono",
      atendidoPor: "HUMANO",
      atendenteUserId: "outro",
    });
  });

  it("quem perde NÃO gera evento no histórico", async () => {
    // Senão a linha do tempo mostraria dois "assumiu" para a mesma conversa.
    const db = bancoFalso(0, { atendidoPor: "HUMANO", atendenteUserId: "outro" });
    await assumirComoHumano(db as never, { leadId: "l1", userId: "u1" });
    expect(db.siteLeadInteraction.create).not.toHaveBeenCalled();
  });

  it("lead inexistente é distinguido de lead já tomado", async () => {
    // Os dois produzem `count: 0`. A tela precisa saber a diferença: uma é
    // "chegou tarde", a outra é "esse link está quebrado".
    const db = bancoFalso(0, null);
    expect(await assumirComoHumano(db as never, { leadId: "l1", userId: "u1" })).toEqual({
      ok: false,
      causa: "naoExiste",
    });
  });

  it("no caminho feliz não se lê nada antes de escrever", async () => {
    const db = bancoFalso(1);
    await assumirComoHumano(db as never, { leadId: "l1", userId: "u1" });
    expect(db.siteLead.findUnique).not.toHaveBeenCalled();
  });
});

describe("devolver para a IA exige objetivo escrito", () => {
  it("sem objetivo não passa, e não toca no banco", async () => {
    // Sem objetivo a IA retoma sem saber o que se espera dela, e a chance de
    // contradizer o que o humano prometeu é alta.
    const db = bancoFalso(1);
    const r = await devolverParaIA(db as never, { leadId: "l1", userId: "u1", objetivo: "  " });

    expect(r).toEqual({ ok: false, causa: "semObjetivo" });
    expect(db.siteLead.updateMany).not.toHaveBeenCalled();
  });

  it("só devolve quem estava atendendo", async () => {
    // Sem esta condição, um SDR devolveria o lead de outro sem o dono saber.
    const db = bancoFalso(1);
    await devolverParaIA(db as never, { leadId: "l1", userId: "u1", objetivo: "confirmar endereço" });

    expect(db.siteLead.updateMany.mock.calls[0]![0].where).toEqual({
      id: "l1",
      atendidoPor: "HUMANO",
      atendenteUserId: "u1",
    });
  });

  it("o objetivo viaja no histórico", async () => {
    const db = bancoFalso(1);
    await devolverParaIA(db as never, { leadId: "l1", userId: "u1", objetivo: "voltar a agendar" });

    const nota = db.siteLeadInteraction.create.mock.calls[0]![0].data.nota;
    expect(nota).toContain("voltar a agendar");
  });

  it("devolver o lead de outro é recusado, dizendo de quem é", async () => {
    const db = bancoFalso(0, { atendenteUserId: "outro" });
    const r = await devolverParaIA(db as never, { leadId: "l1", userId: "u1", objetivo: "x" });

    expect(r).toEqual({ ok: false, causa: "naoEraSeu", atendenteUserId: "outro" });
  });
});

describe("a IA pedindo gente", () => {
  it("sem motivo não passa", async () => {
    // Quem pegar a fila precisa saber por que a IA parou. Sem motivo, o SDR tem
    // que ler a conversa inteira — e em volume, isso é o mesmo que não avisar.
    const db = bancoFalso(1);
    expect(await pedirHumano(db as never, { leadId: "l1", motivo: "" })).toEqual({
      ok: false,
      causa: "semMotivo",
    });
  });

  it("com motivo, o lead vai para a fila de espera com o motivo junto", async () => {
    const db = bancoFalso(1);
    const r = await pedirHumano(db as never, { leadId: "l1", motivo: "quer negociar preço" });

    expect(r.ok).toBe(true);
    const dados = db.siteLead.updateMany.mock.calls[0]![0].data;
    expect(dados.atendidoPor).toBe("AGUARDANDO_HUMANO");
    expect(dados.motivoDoPedido).toBe("quer negociar preço");
  });

  it("a IA não tira lead que já está com humano", async () => {
    const db = bancoFalso(1);
    await pedirHumano(db as never, { leadId: "l1", motivo: "x" });
    expect(db.siteLead.updateMany.mock.calls[0]![0].where.atendidoPor).toEqual({
      in: ["IA", "NINGUEM"],
    });
  });

  it("o ator registrado é a IA, não uma pessoa", async () => {
    const db = bancoFalso(1);
    await pedirHumano(db as never, { leadId: "l1", motivo: "x" });
    expect(db.siteLeadInteraction.create.mock.calls[0]![0].data.actor).toBe("agente-sdr-ia");
  });
});

describe("há quanto tempo o lead espera por gente", () => {
  const entrou = new Date("2026-08-25T10:00:00Z");

  it("lead que não está na fila não tem espera", () => {
    expect(esperaPorGente({ atendidoPor: "IA", atendenteDesde: entrou }, entrou).estado).toBe(
      "naoSeAplica",
    );
  });

  it("na fila sem carimbo é 'não medido', NUNCA zero", () => {
    // Escrever 0 faria a fila parecer em dia. "Não sei há quanto tempo" é
    // diferente de "acabou de entrar".
    const r = esperaPorGente({ atendidoPor: "AGUARDANDO_HUMANO", atendenteDesde: null }, entrou);
    expect(r.estado).toBe("naoMedido");
    if (r.estado === "naoMedido") expect(r.motivo.length).toBeGreaterThan(0);
  });

  it("na fila com carimbo conta as horas", () => {
    const r = esperaPorGente(
      { atendidoPor: "AGUARDANDO_HUMANO", atendenteDesde: entrou },
      new Date("2026-08-25T13:30:00Z"),
    );
    expect(r).toEqual({ estado: "esperando", horas: 3.5 });
  });
});
