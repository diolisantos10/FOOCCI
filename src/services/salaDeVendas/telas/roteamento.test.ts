/**
 * O MOTOR DE DECISÃO — e o zero que tranquiliza.
 *
 * ── O DEFEITO QUE ESTES CASOS EXISTEM PARA IMPEDIR ──────────────────────────
 *
 * Um painel de roteamento mente de dois jeitos, e os dois são bonitos na tela:
 *
 *  · **desenha regra que não roda.** O desenho lista onze critérios; seis não
 *    existem. Pintá-los todos de verde ensina o gerente a contar com um
 *    roteamento por idioma que nunca existiu — e o erro só aparece num cliente
 *    perdido, sem rastro.
 *  · **mostra "0 SLAs estourados" com o relógio desligado.** É exatamente a
 *    tela que uma operação saudável mostraria, e as duas situações são opostas.
 */

import { describe, it, expect, vi } from "vitest";
import {
  panoramaDoRoteamento,
  REGRAS_QUE_EXISTEM,
  PREVISTAS_NAO_CONSTRUIDAS,
  MODO_PADRAO,
} from "./roteamento";

const AGORA = new Date("2026-09-17T12:00:00Z");

function pessoa(over: Record<string, unknown> = {}) {
  return {
    id: "u1",
    nome: "Ana",
    disponibilidade: {
      estado: "DISPONIVEL",
      capacidade: 10,
      especialidades: [],
      regioes: [],
      pausadoAte: null,
    },
    ...over,
  };
}

function banco(resp: {
  distribuicao?: string | null;
  pessoas?: ReturnType<typeof pessoa>[];
  cargas?: { atendenteUserId: string; _count: { _all: number } }[];
  ultimos?: { atendenteUserId: string; _max: { atendenteDesde: Date | null } }[];
  semResponsavel?: number;
  comPrazo?: number;
  estourados?: { id: string; slaVenceEm: Date }[];
}) {
  const counts = [resp.semResponsavel ?? 0, resp.comPrazo ?? 0];
  const countWheres: unknown[] = [];

  return {
    countWheres,
    sdrIaConfig: {
      findUnique: vi.fn(async () =>
        resp.distribuicao === null || resp.distribuicao === undefined
          ? null
          : { distribuicao: resp.distribuicao },
      ),
    },
    internalUser: { findMany: vi.fn(async () => resp.pessoas ?? []) },
    siteLead: {
      count: vi.fn(async (args: { where: unknown }) => {
        countWheres.push(args.where);
        return counts.shift() ?? 0;
      }),
      groupBy: vi.fn(async (args: { by: string[]; _max?: unknown }) =>
        args._max ? (resp.ultimos ?? []) : (resp.cargas ?? []),
      ),
      findMany: vi.fn(async () => resp.estourados ?? []),
    },
  };
}

describe("⭐ as duas listas nunca se confundem", () => {
  it("nenhum critério aparece como construído E como previsto", () => {
    // O caso que carrega o arquivo. No dia em que alguém construir "VIP", tem
    // que TIRAR da lista de previstos — senão a tela diz as duas coisas.
    const existem = new Set(REGRAS_QUE_EXISTEM.map((r) => r.criterio.toLowerCase()));
    for (const p of PREVISTAS_NAO_CONSTRUIDAS) {
      expect(existem.has(p.criterio.toLowerCase()), `"${p.criterio}" está nas duas listas`).toBe(
        false,
      );
    }
  });

  it("toda regra que existe aponta o arquivo e a função que a executam", () => {
    // Regra de tela que ninguém consegue localizar no código é promessa, não
    // mecanismo. O endereço é o que permite conferir sem acreditar.
    for (const r of REGRAS_QUE_EXISTEM) {
      expect(r.ondeMora, `"${r.criterio}" não diz onde mora`).toMatch(/\.ts · \w/);
    }
  });

  it("toda regra prevista diz o que falta para ela existir", () => {
    for (const p of PREVISTAS_NAO_CONSTRUIDAS) {
      expect(p.oQueFalta.trim().length, `"${p.criterio}" não explica o que falta`).toBeGreaterThan(
        20,
      );
    }
  });

  it("os critérios do desenho que não existem estão TODOS declarados", () => {
    const previstos = PREVISTAS_NAO_CONSTRUIDAS.map((p) => p.criterio.toLowerCase()).join(" ");
    for (const criterio of ["produto", "idioma", "valor", "carteira", "vip", "fallback", "sla"]) {
      expect(previstos, `o desenho pede "${criterio}" e a tela não diz que ele falta`).toContain(
        criterio,
      );
    }
  });
});

describe("⭐ o SLA não mostra zero com o relógio desligado", () => {
  it("sem nenhum lead com prazo, `estourados` é null e o motivo é escrito", async () => {
    const db = banco({ comPrazo: 0 });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.sla.estourados, "zero aqui é indistinguível de 'tudo em dia'").toBeNull();
    expect(p.sla.naoMedido).toContain("slaVenceEm");
    expect(p.naoMedido.join(" ")).toContain("slaVenceEm");
    // E nem gastou uma consulta para contar estouro de um relógio parado.
    expect(db.siteLead.findMany).not.toHaveBeenCalled();
  });

  it("havendo prazo gravado, conta o estouro de verdade", async () => {
    const db = banco({
      comPrazo: 4,
      estourados: [
        { id: "l1", slaVenceEm: new Date("2026-09-17T11:00:00Z") },
        { id: "l2", slaVenceEm: new Date("2026-09-17T10:00:00Z") },
      ],
    });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.sla.comPrazo).toBe(4);
    expect(p.sla.estourados).toBe(2);
    expect(p.sla.naoMedido).toBeNull();
  });
});

describe("⭐ o modo e a aptidão vêm do banco", () => {
  it("sem configuração gravada, o modo é o padrão — e a tela diz que é padrão", async () => {
    const db = banco({ distribuicao: null });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.modo).toBe(MODO_PADRAO);
    expect(p.modoEhPadrao).toBe(true);
    expect(p.naoMedido.join(" ")).toContain("MANUAL");
  });

  it("com configuração gravada, é ela que vale", async () => {
    const db = banco({ distribuicao: "RODIZIO" });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.modo).toBe("RODIZIO");
    expect(p.modoEhPadrao).toBe(false);
  });

  it("a aptidão é a MESMA que a distribuição usaria — offline não é apto", async () => {
    const db = banco({
      pessoas: [
        pessoa(),
        pessoa({
          id: "u2",
          nome: "Bruno",
          disponibilidade: {
            estado: "OFFLINE",
            capacidade: 10,
            especialidades: [],
            regioes: [],
            pausadoAte: null,
          },
        }),
      ],
      cargas: [{ atendenteUserId: "u1", _count: { _all: 2 } }],
    });

    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.aptos).toBe(1);
    const bruno = p.atendentes.find((a) => a.userId === "u2")!;
    expect(bruno.apto).toBe(false);
    expect(bruno.motivo).toBe("offline");
    // A carga é a contada agora, não um contador guardado na linha do SDR.
    expect(p.atendentes.find((a) => a.userId === "u1")!.carga).toBe(2);
  });

  it("quem está no limite sai da roda, e o painel diz por quê", async () => {
    const db = banco({
      pessoas: [
        pessoa({
          disponibilidade: {
            estado: "DISPONIVEL",
            capacidade: 3,
            especialidades: [],
            regioes: [],
            pausadoAte: null,
          },
        }),
      ],
      cargas: [{ atendenteUserId: "u1", _count: { _all: 3 } }],
    });

    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.aptos).toBe(0);
    expect(p.porQueNinguemEstaApto).toContain("no limite");
  });

  it("time vazio não é 'todo mundo ocupado' — é motor sem para quem distribuir", async () => {
    const db = banco({ pessoas: [] });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.atendentes).toEqual([]);
    expect(p.naoMedido.join(" ")).toContain("Nenhum atendente com disponibilidade");
  });

  it("a fila sem responsável só conta lead em aberto", async () => {
    const db = banco({ semResponsavel: 7 });
    const p = await panoramaDoRoteamento(db as never, { agora: AGORA });

    expect(p.semResponsavel).toBe(7);
    const w = JSON.stringify(db.countWheres[0]);
    expect(w).toContain("NINGUEM");
    expect(w).toContain("GANHO");
  });
});
