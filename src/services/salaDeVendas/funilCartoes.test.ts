/**
 * OS CARTÕES DO QUADRO — o escopo, a ordem, e o que fica de fora.
 *
 * ── POR QUE OS CARTÕES SÃO DELICADOS ────────────────────────────────────────
 *
 * A contagem do funil já respeitava o escopo de quem pergunta. Os cartões são a
 * mesma informação em outra forma — e é aí que o erro entra: um quadro que
 * mostrasse cartões fora do escopo entregaria ao vendedor um lead que ele não
 * pode abrir, e ele descobriria isso ao clicar, com um 403.
 *
 * O segundo caso que carrega este arquivo é a ORDEM. Numa coluna de funil, o
 * cartão que mais precisa de atenção é o mais parado — e "nunca falaram com ele"
 * é mais urgente que "falaram há um mês". Um `null` jogado para o fim da lista
 * esconde exatamente o lead mais abandonado do quadro.
 */

import { describe, it, expect, vi } from "vitest";
import { cartoesDoKanban, CARTOES_POR_COLUNA } from "./funil";

function banco(porEtapa: Record<string, unknown[]> = {}) {
  return {
    siteLead: {
      findMany: vi.fn().mockImplementation(async ({ where }: { where: { stage: string } }) =>
        porEtapa[where.stage] ?? [],
      ),
    },
  };
}

const UM_LEAD = {
  id: "l1",
  nome: "Marina Duarte",
  restaurante: "Pizzaria do Centro",
  lastInteractionAt: new Date("2026-08-20T10:00:00Z"),
  score: 62,
  atendidoPor: "IA",
};

describe("⭐ o escopo dos cartões é o MESMO da contagem", () => {
  it("o escopo entra no where de TODA coluna", async () => {
    // Sem isto o quadro mostraria ao vendedor leads de outra pessoa — e o 403 na
    // hora de abrir ensinaria que o sistema é imprevisível.
    const db = banco();
    const escopo = { atendenteUserId: "u9" };

    await cartoesDoKanban(db as never, escopo as never);

    expect(db.siteLead.findMany.mock.calls.length).toBeGreaterThan(5);
    for (const [args] of db.siteLead.findMany.mock.calls) {
      expect(args.where, "coluna consultada sem o escopo").toMatchObject(escopo);
      expect(args.where.stage, "coluna consultada sem etapa").toBeTruthy();
    }
  });

  it("uma coluna vazia devolve lista vazia, e não some do resultado", async () => {
    // A tela lê por etapa. Uma chave faltando viraria `undefined` e a coluna
    // desapareceria do quadro — quando na verdade ela só está vazia.
    const r = await cartoesDoKanban(banco() as never, {} as never);
    expect(Object.keys(r).length).toBeGreaterThan(5);
    for (const lista of Object.values(r)) expect(Array.isArray(lista)).toBe(true);
  });
});

describe("⭐ a ordem: o mais parado primeiro, e quem nunca foi atendido antes de todos", () => {
  it("ordena por última interação, com os nulos NA FRENTE", async () => {
    // `nulls: "first"` é o ponto. Ausência de contato é mais urgente que contato
    // velho — e um nulo no fim esconde o lead mais abandonado do quadro.
    const db = banco();
    await cartoesDoKanban(db as never, {} as never);

    const [args] = db.siteLead.findMany.mock.calls[0]!;
    expect(args.orderBy).toEqual({ lastInteractionAt: { sort: "asc", nulls: "first" } });
  });

  it("o teto por coluna é declarado, e não infinito", async () => {
    // Uma coluna com trezentos cartões não é um quadro que alguém trabalha — é
    // uma lista, e lista tem tela própria.
    const db = banco();
    await cartoesDoKanban(db as never, {} as never);

    const [args] = db.siteLead.findMany.mock.calls[0]!;
    expect(args.take).toBe(CARTOES_POR_COLUNA);
  });

  it("o teto é ajustável por quem chama", async () => {
    const db = banco();
    await cartoesDoKanban(db as never, {} as never, 3);
    expect(db.siteLead.findMany.mock.calls[0]![0].take).toBe(3);
  });
});

describe("o cartão carrega só o que a tela mostra", () => {
  it("traz nome, restaurante, quem atende e quando falaram", async () => {
    const r = await cartoesDoKanban(banco({ NOVO: [UM_LEAD] }) as never, {} as never);

    expect(r.NOVO).toEqual([
      {
        id: "l1",
        nome: "Marina Duarte",
        restaurante: "Pizzaria do Centro",
        ultimaInteracaoEm: UM_LEAD.lastInteractionAt,
        score: 62,
        atendidoPor: "IA",
      },
    ]);
  });

  it("⭐ não traz telefone nem e-mail — o quadro é uma visão, não um mailing", async () => {
    // Um quadro que carrega contato vira lista de exportação. O dado do contato
    // vive na conversa, onde há trilha de quem abriu.
    const db = banco();
    await cartoesDoKanban(db as never, {} as never);

    const campos = Object.keys(db.siteLead.findMany.mock.calls[0]![0].select);
    for (const proibido of ["whatsapp", "email", "whatsappDigits", "telefone"]) {
      expect(campos, `o cartão carrega ${proibido}`).not.toContain(proibido);
    }
  });

  it("score nulo continua nulo — zero seria uma nota que ninguém deu", async () => {
    // Guardrail 1 na forma numérica: ausência de pontuação não é pontuação zero.
    const r = await cartoesDoKanban(
      banco({ NOVO: [{ ...UM_LEAD, score: null }] }) as never,
      {} as never,
    );
    expect(r.NOVO![0]!.score).toBeNull();
  });
});
