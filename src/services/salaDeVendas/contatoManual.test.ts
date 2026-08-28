/**
 * O CONTATO REGISTRADO À MÃO — e os quatro jeitos de ele mentir em silêncio.
 *
 * ── O QUE ESTES CASOS GUARDAM ───────────────────────────────────────────────
 *
 *  · **registro sem autor** — dois vendedores discordam sobre quem falou com o
 *    cliente, e a linha do tempo não desempata. O autor vem da sessão, e a
 *    função recusa sem ele;
 *  · **registro sem data** — carimbar a hora da digitação embaralha a linha do
 *    tempo (a ligação aparece depois da mensagem que ela provocou) e estraga
 *    toda medida de tempo de resposta;
 *  · **data no futuro** — um ano digitado errado empurra `lastContactedAt` para
 *    frente, e o lead some da fila de "sem resposta" PARA SEMPRE. Some sem erro
 *    e sem alarme, que é o pior jeito de sumir;
 *  · **carimbo andando para trás** — o lançamento atrasado (a ligação de terça,
 *    lançada na sexta) reescreveria "último contato" com uma data mais VELHA, e
 *    um lead atendido hoje reapareceria como abandonado há três dias.
 *
 * Cada regra nas duas metades: prova que barra E prova que o caso legítimo passa.
 */

import { describe, it, expect, vi } from "vitest";
import { registrarContatoManual, listarContatosManuais } from "./contatoManual";

const ONTEM = new Date("2026-08-27T14:00:00.000Z");
const AGORA = new Date("2026-08-28T10:00:00.000Z");

/**
 * Um banco falso que guarda o que foi escrito.
 *
 * A metade importante dos casos não olha o retorno: olha SE houve escrita e com
 * que valores — que é onde os defeitos desta função moram.
 */
function banco(lead: { lastContactedAt: Date | null; lastInteractionAt: Date | null } | null) {
  const criadas: Array<Record<string, unknown>> = [];
  const atualizacoes: Array<Record<string, unknown>> = [];

  const tx = {
    siteLeadInteraction: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        criadas.push(args.data);
        return { id: `i${criadas.length}` };
      }),
    },
    siteLead: {
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        atualizacoes.push(args.data);
        return {};
      }),
    },
  };

  return {
    criadas,
    atualizacoes,
    siteLead: {
      findUnique: vi.fn(async () => (lead ? { id: "l1", ...lead } : null)),
      update: tx.siteLead.update,
    },
    siteLeadInteraction: tx.siteLeadInteraction,
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<string>) => fn(tx)),
  };
}

const LEAD_NOVO = { lastContactedAt: null, lastInteractionAt: null };

const BASE = {
  leadId: "l1",
  tipo: "LIGACAO" as const,
  quemUserId: "u-sdr",
  quando: ONTEM,
  agora: AGORA,
};

describe("⭐ o registro exige QUEM", () => {
  it("sem autor, recusa e NÃO escreve nada", async () => {
    const db = banco(LEAD_NOVO);

    const r = await registrarContatoManual(db as never, { ...BASE, quemUserId: "  " });

    expect(r).toEqual({ ok: false, causa: "semQuem" });
    expect(db.siteLeadInteraction.create).not.toHaveBeenCalled();
  });

  it("a metade que passa: com autor, grava — e o autor gravado é o da sessão", async () => {
    // Sem este caso, uma função que recusasse TODO registro passaria no de cima.
    const db = banco(LEAD_NOVO);

    const r = await registrarContatoManual(db as never, BASE);

    expect(r.ok).toBe(true);
    expect(db.criadas[0]!.actor).toBe("u-sdr");
  });
});

describe("⭐ o registro exige QUANDO", () => {
  it("data ilegível recusa e NÃO escreve nada", async () => {
    const db = banco(LEAD_NOVO);

    const r = await registrarContatoManual(db as never, {
      ...BASE,
      quando: new Date("isto não é data"),
    });

    expect(r).toEqual({ ok: false, causa: "semQuando" });
    expect(db.siteLeadInteraction.create).not.toHaveBeenCalled();
  });

  it("a metade que passa: a data informada vira o carimbo da interação", async () => {
    const db = banco(LEAD_NOVO);

    await registrarContatoManual(db as never, BASE);

    // É a hora do FATO, e não a da digitação. É por ela que a linha do tempo
    // ordena, e é ela que separa "liguei ontem" de "anotei hoje".
    expect(db.criadas[0]!.createdAt).toEqual(ONTEM);
  });

  it("⭐ data no FUTURO é recusada — senão o lead some da fila para sempre", async () => {
    const db = banco(LEAD_NOVO);

    const r = await registrarContatoManual(db as never, {
      ...BASE,
      quando: new Date("2027-08-28T10:00:00.000Z"),
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.causa).toBe("quandoNoFuturo");
    expect(db.siteLeadInteraction.create).not.toHaveBeenCalled();
  });

  it("'acabei de falar com ele' passa mesmo com o relógio do navegador adiantado", async () => {
    // A metade oposta da regra acima. Sem a folga, o registro MAIS COMUM de
    // todos seria recusado em qualquer máquina com o relógio dois minutos à
    // frente — e ninguém entenderia por quê.
    const db = banco(LEAD_NOVO);

    const r = await registrarContatoManual(db as never, {
      ...BASE,
      quando: new Date(AGORA.getTime() + 90_000),
    });

    expect(r.ok).toBe(true);
  });
});

describe("⭐ o que conta como abordagem, e o que não conta", () => {
  it("ligação tira o lead da fila de quem falta abordar", async () => {
    const db = banco(LEAD_NOVO);

    const r = await registrarContatoManual(db as never, BASE);

    expect(r.ok && r.contouComoAbordagem).toBe(true);
    expect(db.atualizacoes[0]).toMatchObject({ lastContactedAt: ONTEM });
  });

  it("anotação NÃO tira — senão o SDR perde quem nunca recebeu mensagem nenhuma", async () => {
    const db = banco(LEAD_NOVO);

    const r = await registrarContatoManual(db as never, {
      ...BASE,
      tipo: "NOTA",
      nota: "cliente pediu para chamar em setembro",
    });

    expect(r.ok && r.contouComoAbordagem).toBe(false);
    expect(db.atualizacoes[0]).not.toHaveProperty("lastContactedAt");
    // Mas a interação continua movendo — houve movimento no lead.
    expect(db.atualizacoes[0]).toMatchObject({ lastInteractionAt: ONTEM });
  });

  it("anotação vazia é recusada: uma linha que não conta nada não é registro", async () => {
    const db = banco(LEAD_NOVO);

    const r = await registrarContatoManual(db as never, { ...BASE, tipo: "NOTA", nota: "   " });

    expect(r).toEqual({ ok: false, causa: "anotacaoSemTexto" });
    expect(db.siteLeadInteraction.create).not.toHaveBeenCalled();
  });
});

describe("⭐ o carimbo de último contato só anda para FRENTE", () => {
  it("lançamento atrasado não reescreve um contato mais recente", async () => {
    // O lead foi atendido hoje; o vendedor lança agora a ligação de terça.
    // Escrever a data antiga faria o lead reaparecer como abandonado.
    const db = banco({
      lastContactedAt: new Date("2026-08-28T09:00:00.000Z"),
      lastInteractionAt: new Date("2026-08-28T09:00:00.000Z"),
    });

    const r = await registrarContatoManual(db as never, BASE);

    expect(r.ok).toBe(true);
    // A interação foi gravada — o fato aconteceu e entra na linha do tempo.
    expect(db.criadas).toHaveLength(1);
    // O espelho não andou para trás.
    expect(db.siteLead.update).not.toHaveBeenCalled();
    expect(r.ok && r.contouComoAbordagem).toBe(false);
  });

  it("a metade que passa: contato MAIS NOVO que o gravado avança o carimbo", async () => {
    const db = banco({
      lastContactedAt: new Date("2026-08-20T09:00:00.000Z"),
      lastInteractionAt: new Date("2026-08-20T09:00:00.000Z"),
    });

    const r = await registrarContatoManual(db as never, BASE);

    expect(r.ok && r.contouComoAbordagem).toBe(true);
    expect(db.atualizacoes[0]).toMatchObject({
      lastContactedAt: ONTEM,
      lastInteractionAt: ONTEM,
    });
  });
});

describe("o que a função se recusa a aceitar", () => {
  it("tipo fora da lista não vira interação", async () => {
    const db = banco(LEAD_NOVO);

    const r = await registrarContatoManual(db as never, {
      ...BASE,
      tipo: "MUDANCA_ETAPA" as never,
    });

    expect(r).toEqual({ ok: false, causa: "tipoInvalido" });
    expect(db.siteLeadInteraction.create).not.toHaveBeenCalled();
  });

  it("lead que não existe devolve causa própria, e não um sucesso mudo", async () => {
    const db = banco(null);

    const r = await registrarContatoManual(db as never, BASE);

    expect(r).toEqual({ ok: false, causa: "leadNaoExiste" });
    expect(db.siteLeadInteraction.create).not.toHaveBeenCalled();
  });
});

describe("⭐ a lista traduz o autor em NOME", () => {
  function bancoDeLeitura(
    linhas: Array<{ id: string; tipo: string; actor: string; nota: string | null; createdAt: Date }>,
    pessoas: Array<{ id: string; nome: string }>,
  ) {
    return {
      siteLeadInteraction: { findMany: vi.fn(async () => linhas) },
      internalUser: { findMany: vi.fn(async () => pessoas) },
    };
  }

  it("o id da sessão vira o nome de quem registrou", async () => {
    const db = bancoDeLeitura(
      [{ id: "i1", tipo: "LIGACAO", actor: "u-sdr", nota: "atendeu", createdAt: ONTEM }],
      [{ id: "u-sdr", nome: "Marina" }],
    );

    const r = await listarContatosManuais(db as never, { leadId: "l1" });

    expect(r[0]!.quem).toBe("Marina");
    expect(r[0]!.rotulo).toBe("Ligação");
  });

  it("ator antigo da tela velha continua aparecendo — apagá-lo esconderia metade do histórico", async () => {
    // "admin", "sistema" e "sdr-agent" não são id de ninguém. Um `?? "—"` aqui
    // apagaria todo registro anterior à identidade interna.
    const db = bancoDeLeitura(
      [{ id: "i1", tipo: "REUNIAO", actor: "admin", nota: null, createdAt: ONTEM }],
      [],
    );

    const r = await listarContatosManuais(db as never, { leadId: "l1" });

    expect(r[0]!.quem).toBe("admin");
  });

  it("nota interna nunca entra nesta lista — é outra coisa e tem outra tela", async () => {
    const db = bancoDeLeitura([], []);

    await listarContatosManuais(db as never, { leadId: "l1" });

    const args = db.siteLeadInteraction.findMany.mock.calls[0]![0] as {
      where: { interna: boolean; tipo: { in: string[] } };
    };
    expect(args.where.interna).toBe(false);
    expect(args.where.tipo.in).not.toContain("NOTA_INTERNA");
    expect(args.where.tipo.in).not.toContain("MUDANCA_ETAPA");
  });

  it("sem registro nenhum, não pergunta por pessoa alguma", async () => {
    const db = bancoDeLeitura([], []);

    const r = await listarContatosManuais(db as never, { leadId: "l1" });

    expect(r).toEqual([]);
    expect(db.internalUser.findMany).not.toHaveBeenCalled();
  });
});
