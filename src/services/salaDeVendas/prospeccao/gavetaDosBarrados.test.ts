/**
 * A GAVETA DOS BARRADOS — e a trava que sobrevive à ordem de apagar.
 *
 * O fio deste arquivo: **apagar é o único ato que não tem volta.** Cada teste
 * aqui é uma forma de apagar o que não podia — principalmente quem pediu
 * silêncio, cuja exclusão não o protege: reabre a porta para abordá-lo de novo.
 */

import { describe, it, expect, vi } from "vitest";
import {
  raioXDaGaveta,
  arquivarBarradosTerminais,
  descartarSemWhatsappNemEmail,
  emailPlausivel,
  motivoEhTerminal,
} from "./gavetaDosBarrados";

/** Quarta-feira, 14h em São Paulo — dentro da janela, para não misturar causas. */
const AGORA = new Date("2026-09-02T17:00:00Z");

const LOTE = { id: "lote1", proveniencia: "Lista pública de restaurantes, 08/2026" };

function item(over: Record<string, unknown> = {}) {
  return {
    id: "i1",
    loteId: "lote1",
    leadId: null,
    nome: "Cantina do Zé",
    whatsapp: "11987654321",
    whatsappDigits: "5511987654321",
    email: null,
    situacao: "PENDENTE",
    lote: LOTE,
    ...over,
  };
}

/**
 * Um banco de mentira com uma página só. `leadPorTelefone` é o que decide se
 * aquele contato pertence a alguém que pediu silêncio.
 */
function banco(itens: any[], leadPorTelefone: any = null) {
  const apagados: string[] = [];
  const atualizados: any[] = [];
  let vivos = [...itens];

  return {
    apagados,
    atualizados,
    get vivos() {
      return vivos;
    },
    db: {
      prospeccaoConfig: { findUnique: vi.fn().mockResolvedValue({ horasEntreAbordagens: 72 }) },
      itemDeProspeccao: {
        count: vi.fn(async (args: any) =>
          args?.where?.situacao
            ? vivos.filter((i) => i.situacao === args.where.situacao).length
            : vivos.length,
        ),
        findMany: vi.fn(async (args: any) => {
          const filtrados = args?.where?.situacao
            ? vivos.filter((i) => i.situacao === args.where.situacao)
            : vivos;
          return filtrados.slice(args?.skip ?? 0, (args?.skip ?? 0) + (args?.take ?? 500));
        }),
        updateMany: vi.fn(async (args: any) => {
          const alvo = vivos.find(
            (i) => i.id === args.where.id && i.situacao === args.where.situacao,
          );
          if (!alvo) return { count: 0 };
          Object.assign(alvo, args.data);
          atualizados.push({ id: alvo.id, ...args.data });
          return { count: 1 };
        }),
        deleteMany: vi.fn(async (args: any) => {
          const ids: string[] = args.where.id.in;
          apagados.push(...ids);
          vivos = vivos.filter((i) => !ids.includes(i.id));
          return { count: ids.length };
        }),
      },
      siteLead: {
        findUnique: vi.fn().mockResolvedValue(leadPorTelefone),
        findFirst: vi.fn().mockResolvedValue(leadPorTelefone),
      },
    } as any,
  };
}

describe("o e-mail plausível", () => {
  it("aceita endereço de verdade e recusa o resto", () => {
    expect(emailPlausivel("contato@bimmisbar.com.br")).toBe(true);
    expect(emailPlausivel("   ")).toBe(false);
    expect(emailPlausivel(null)).toBe(false);
    expect(emailPlausivel("sem-arroba")).toBe(false);
    expect(emailPlausivel("a@b")).toBe(false);
  });
});

describe("o raio-x da gaveta", () => {
  it("conta os barrados POR MOTIVO, e não toca em nada", async () => {
    const { db, apagados, atualizados } = banco([
      item({ id: "ok", whatsapp: "11987654321" }),
      item({ id: "curto", whatsapp: "123" }),
      item({ id: "vazio", whatsapp: "" }),
    ]);

    const r = await raioXDaGaveta(db, { agora: AGORA });

    expect(r.avaliados).toBe(3);
    expect(r.liberados).toBe(1);
    expect(r.barrados).toBe(2);
    const motivos = Object.fromEntries(r.porMotivo.map((m) => [m.motivo, m.quantidade]));
    expect(motivos.LEAD_TELEFONE_INVALIDO).toBe(1);
    expect(motivos.LEAD_SEM_TELEFONE).toBe(1);
    // O rótulo é legível: é o que o CEO lê na tela.
    expect(r.porMotivo.every((m) => m.rotulo.length > 0)).toBe(true);
    // ⛔ Somente leitura — a lição de `selecao.ts`, repetida aqui.
    expect(apagados).toHaveLength(0);
    expect(atualizados).toHaveLength(0);
  });

  it("separa o bloqueio que passa sozinho do que é terminal", () => {
    expect(motivoEhTerminal("LEAD_OPT_OUT")).toBe(true);
    expect(motivoEhTerminal("LEAD_TELEFONE_INVALIDO")).toBe(true);
    // ⛔ Estes NUNCA podem arquivar: às 8h da manhã apagariam a base inteira.
    expect(motivoEhTerminal("FORA_DA_JANELA")).toBe(false);
    expect(motivoEhTerminal("CANAL_INDISPONIVEL")).toBe(false);
    expect(motivoEhTerminal("DESCANSO_ATIVO")).toBe(false);
    // Se resolve escrevendo a procedência do lote — não é o contato que acabou.
    expect(motivoEhTerminal("PROSPECCAO_SEM_BASE_LEGAL")).toBe(false);
  });
});

describe("arquivar os barrados terminais", () => {
  it("manda o telefone inválido para RECUSADO com o motivo legível", async () => {
    const { db, vivos } = banco([item({ id: "curto", whatsapp: "12" })]);

    const r = await arquivarBarradosTerminais(db, { agora: AGORA });

    expect(r.arquivados).toBe(1);
    expect(vivos[0].situacao).toBe("RECUSADO");
    expect(vivos[0].motivo).toContain("Telefone com formato improvável");
  });

  it("⛔ NÃO arquiva quem está barrado só pelo horário — isso apagaria a base às 8h", async () => {
    // Domingo, 10h de São Paulo: a janela fecha, e nada mais.
    const domingo = new Date("2026-09-06T13:00:00Z");
    const { db, vivos } = banco([item({ id: "bom" })]);

    const r = await arquivarBarradosTerminais(db, { agora: domingo });

    expect(r.arquivados).toBe(0);
    expect(vivos[0].situacao).toBe("PENDENTE");
  });
});

describe("o descarte definitivo", () => {
  const INUTIL = item({ id: "inutil", whatsapp: "12", email: null });

  it("sem confirmar, CONTA e não apaga nada", async () => {
    const { db, apagados } = banco([INUTIL, item({ id: "bom" })]);

    const r = await descartarSemWhatsappNemEmail(db);

    expect(r.apagaveis).toBe(1);
    expect(r.apagados).toBe(0);
    expect(r.confirmado).toBe(false);
    expect(r.antes).toBe(2);
    expect(r.depois).toBe(2);
    expect(apagados).toHaveLength(0);
  });

  it("com confirmar, apaga e devolve antes/depois", async () => {
    const { db, apagados } = banco([INUTIL, item({ id: "bom" })]);

    const r = await descartarSemWhatsappNemEmail(db, { confirmar: true });

    expect(r.apagados).toBe(1);
    expect(r.antes).toBe(2);
    expect(r.depois).toBe(1);
    expect(apagados).toEqual(["inutil"]);
  });

  it("não apaga quem tem e-mail, mesmo sem WhatsApp válido", async () => {
    const { db, apagados } = banco([
      item({ id: "so-email", whatsapp: "12", email: "contato@bistekao.com.br" }),
    ]);

    const r = await descartarSemWhatsappNemEmail(db, { confirmar: true });

    expect(r.apagaveis).toBe(0);
    expect(apagados).toHaveLength(0);
  });

  it("⛔⛔ QUEM PEDIU SILÊNCIO SOBREVIVE AO DESCARTE — sem telefone e sem e-mail", async () => {
    // O caso que esta trava protege: apagar o opt-out não protege ninguém. Ele
    // volta na próxima planilha como contato novo, é abordado de novo, e aí são
    // duas contas — a da LGPD e a do banimento na Meta.
    const { db, apagados, vivos } = banco(
      [item({ id: "calou", whatsapp: "12", email: null })],
      { id: "lead1", optOutAt: new Date("2026-05-01"), lastContactedAt: null },
    );

    const r = await descartarSemWhatsappNemEmail(db, { confirmar: true });

    expect(r.candidatos).toBe(1);
    expect(r.protegidosPorOptOut).toBe(1);
    expect(r.apagaveis).toBe(0);
    expect(r.apagados).toBe(0);
    expect(apagados).toHaveLength(0);
    expect(vivos).toHaveLength(1);
  });
});
