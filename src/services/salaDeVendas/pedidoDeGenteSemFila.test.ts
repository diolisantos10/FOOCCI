/**
 * ⭐ D-0E4 — O CLIENTE PEDIU GENTE E NÃO HÁ GENTE. A IA NÃO ABANDONA.
 *
 * ── O PIOR CASO QUE ESTE ARQUIVO IMPEDE ─────────────────────────────────────
 *
 * Até 18/09/2026, `passarParaGente` trocava o dono para `AGUARDANDO_HUMANO` sem
 * NUNCA perguntar se existia humano. Onde não há humano isso não é handoff: é
 * abandono com formulário. O lead saía da mão da IA, o gate 2 do TA passava a
 * calá-la, e a pessoa que acabou de escrever *"quero falar com alguém"* ficava
 * em silêncio — o estado exato do lead que o CEO viu parado 24 h em "esperando
 * gente", e a origem dos 6.273 largados.
 *
 * ⚠️ E o que este arquivo NÃO afrouxa: a Supervisora continua podendo tirar a
 * IA de cena mesmo sem fila (`seNaoHouverGente: "passarMesmoAssim"`). Trava é
 * trava; o que mudou é o ATENDIMENTO.
 */

import { describe, it, expect, vi } from "vitest";
import { passarParaGente } from "./handoff";

const AGORA = new Date("2026-09-18T13:00:00Z");

const DOSSIE = { resumo: 'O cliente escreveu: "quero falar com uma pessoa"' };

/**
 * `time` descreve o time comercial de verdade: `disponibilidade` é o que
 * `lerCandidatos` lê, e `podeReceber` decide a partir dela. Nada aqui é um
 * "sempre disponível" — o duplo implementa o que o Prisma devolveria.
 */
function banco(time: Array<{ estado: string; capacidade: number; carga: number }>) {
  const escritas: Array<Record<string, unknown>> = [];
  return {
    escritas,
    db: {
      siteLead: {
        findUnique: vi.fn(async () => ({ atendidoPor: "IA", score: 40, stage: "EM_QUALIFICACAO" })),
        updateMany: vi.fn(async (args: { data: Record<string, unknown> }) => {
          escritas.push(args.data);
          return { count: 1 };
        }),
        groupBy: vi.fn(async (args: { by: string[] }) =>
          args.by.includes("atendenteUserId") && "_count" in args
            ? time.map((t, i) => ({ atendenteUserId: `u${i}`, _count: { _all: t.carga } }))
            : time.map((_, i) => ({ atendenteUserId: `u${i}`, _max: { atendenteDesde: null } })),
        ),
      },
      internalUser: {
        findMany: vi.fn(async () =>
          time.map((t, i) => ({
            id: `u${i}`,
            nome: `Pessoa ${i}`,
            disponibilidade: {
              estado: t.estado,
              capacidade: t.capacidade,
              especialidades: [],
              regioes: [],
              pausadoAte: null,
            },
          })),
        ),
      },
      siteLeadInteraction: { create: vi.fn(async () => ({})) },
      leadHandoff: { create: vi.fn(async () => ({ id: "h1" })) },
    } as never,
  };
}

describe("⛔ nunca entregar um lead a uma fila vazia", () => {
  it("⭐ time VAZIO: o handoff recusa, o lead NÃO sai da IA, e o motivo vem nomeado", async () => {
    const { db, escritas } = banco([]);

    const r = await passarParaGente(db, {
      leadId: "L1",
      motivoEscrito: "o cliente pediu falar com uma pessoa",
      motivoExplicito: "PEDIU_HUMANO",
      dossie: DOSSIE,
      seNaoHouverGente: "manterComIA",
      agora: AGORA,
    });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.causa).toBe("semGenteDisponivel");
    expect(!r.ok && r.causa === "semGenteDisponivel" && r.detalhe).toContain("0 disponíveis");
    // ⛔ O ponto: NADA foi escrito. O dono não trocou.
    expect(escritas).toHaveLength(0);
  });

  it("⭐ todo mundo OFFLINE: mesma coisa — 'existe time' não é 'tem gente agora'", async () => {
    const { db, escritas } = banco([
      { estado: "OFFLINE", capacidade: 10, carga: 0 },
      { estado: "OFFLINE", capacidade: 10, carga: 0 },
    ]);

    const r = await passarParaGente(db, {
      leadId: "L1",
      motivoEscrito: "o cliente pediu falar com uma pessoa",
      motivoExplicito: "PEDIU_HUMANO",
      dossie: DOSSIE,
      seNaoHouverGente: "manterComIA",
      agora: AGORA,
    });

    expect(!r.ok && r.causa).toBe("semGenteDisponivel");
    expect(escritas).toHaveLength(0);
  });

  it("⭐ todo mundo NO LIMITE de carga também é fila vazia", async () => {
    const { db } = banco([{ estado: "DISPONIVEL", capacidade: 3, carga: 3 }]);

    const r = await passarParaGente(db, {
      leadId: "L1",
      motivoEscrito: "o cliente pediu falar com uma pessoa",
      motivoExplicito: "PEDIU_HUMANO",
      dossie: DOSSIE,
      seNaoHouverGente: "manterComIA",
      agora: AGORA,
    });

    expect(!r.ok && r.causa).toBe("semGenteDisponivel");
  });

  it("✅ e quando HÁ gente, o handoff acontece normalmente — a metade que passa", async () => {
    const { db, escritas } = banco([{ estado: "DISPONIVEL", capacidade: 10, carga: 1 }]);

    const r = await passarParaGente(db, {
      leadId: "L1",
      motivoEscrito: "o cliente pediu falar com uma pessoa",
      motivoExplicito: "PEDIU_HUMANO",
      dossie: DOSSIE,
      seNaoHouverGente: "manterComIA",
      agora: AGORA,
    });

    expect(r.ok).toBe(true);
    expect(escritas.length).toBeGreaterThan(0);
  });
});

describe("⛔ a trava continua sendo trava", () => {
  it("a Supervisora tira a IA de cena MESMO sem ninguém disponível", async () => {
    const { db, escritas } = banco([]);

    const r = await passarParaGente(db, {
      leadId: "L1",
      motivoEscrito: "risco detectado pela Supervisora",
      motivoExplicito: "RISCO",
      dossie: { resumo: "conversa retida por risco" },
      // É o que `supervisora/revisao.ts` passa. Parar a IA é o ponto.
      seNaoHouverGente: "passarMesmoAssim",
      agora: AGORA,
    });

    expect(r.ok).toBe(true);
    expect(escritas.length).toBeGreaterThan(0);
  });
});

describe("o texto que o cliente ouve quando não há ninguém", () => {
  it("diz a verdade, não promete prazo e mantém a conversa aberta", async () => {
    const { AVISO_DE_QUE_VOU_CHAMAR_ALGUEM } = await import("./ta/atender");

    expect(AVISO_DE_QUE_VOU_CHAMAR_ALGUEM).toContain("vou chamar");
    expect(AVISO_DE_QUE_VOU_CHAMAR_ALGUEM).toContain("sigo aqui com você");
    // ⛔ Nada de prazo inventado, nada de "já encaminhei".
    expect(AVISO_DE_QUE_VOU_CHAMAR_ALGUEM).not.toMatch(/minutos?|horas?|já (passei|encaminhei)/i);
  });
});
