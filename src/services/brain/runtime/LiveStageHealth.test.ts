/**
 * A régua do topo: reprova quando tem que reprovar, e NÃO reprova por falta de
 * amostra. As duas metades importam igual — uma régua que só sabe reprovar
 * derruba restaurante pequeno por ruído; uma que nunca reprova é enfeite aceso.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  avaliarTopo,
  PISO_COERENCIA_AO_VIVO,
  JANELA_AMOSTRAS_AO_VIVO,
  MINIMO_AMOSTRAS_AO_VIVO,
} from "./LiveStageHealth";

/** n amostras, das quais `acertos` com PASS. Mais recentes primeiro. */
const amostras = (n: number, acertos: number) =>
  Array.from({ length: n }, (_, i) => ({ coherence: i < acertos ? "PASS" : "FAIL" }));

describe("a régua reprova quando tem que reprovar", () => {
  it("50 amostras com 89% ⇒ DEGRADADO, derruba", () => {
    const r = avaliarTopo(amostras(50, 44)); // 88%
    expect(r.saude).toBe("DEGRADADO");
    expect(r.derruba).toBe(true);
    expect(r.motivo).toContain("TOPO DEGRADADO");
  });

  it("exatamente no piso (90%) NÃO derruba — o piso é o mínimo aceitável, não o proibido", () => {
    const r = avaliarTopo(amostras(50, 45)); // 90,0%
    expect(r.taxa).toBe(PISO_COERENCIA_AO_VIVO);
    expect(r.saude).toBe("SAUDAVEL");
    expect(r.derruba).toBe(false);
  });

  it("um passo abaixo do piso derruba", () => {
    const r = avaliarTopo(amostras(50, 44));
    expect(r.taxa).toBeLessThan(PISO_COERENCIA_AO_VIVO);
    expect(r.derruba).toBe(true);
  });

  it("no mínimo de amostra a régua já vale (30 amostras, 80%)", () => {
    const r = avaliarTopo(amostras(30, 24));
    expect(r.amostras).toBe(30);
    expect(r.derruba).toBe(true);
  });

  it("colapso total derruba", () => {
    expect(avaliarTopo(amostras(50, 0)).derruba).toBe(true);
  });
});

describe("a régua NÃO reprova por falta de amostra", () => {
  const casos: [string, number, number][] = [
    ["restaurante sem nenhum atendimento ao vivo", 0, 0],
    ["1 atendimento, e foi ruim (100% de falha)", 1, 0],
    ["10 atendimentos, 5 ruins (50% — reprovaria se houvesse amostra)", 10, 5],
    ["29 atendimentos, todos ruins — um a menos que o piso", 29, 0],
  ];

  it.each(casos)("%s ⇒ SEM_AMOSTRA e NÃO derruba", (_nome, n, acertos) => {
    const r = avaliarTopo(amostras(n, acertos));
    expect(r.saude).toBe("SEM_AMOSTRA");
    expect(r.derruba).toBe(false);
  });

  it("SEM_AMOSTRA não é 'ok': o motivo diz por escrito que não há medição", () => {
    const r = avaliarTopo(amostras(5, 5)); // 100%, mas só 5 amostras
    expect(r.saude).toBe("SEM_AMOSTRA");
    expect(r.motivo).toContain("sem amostra suficiente");
    expect(r.motivo).toContain('NÃO quer dizer "ok"');
    expect(r.motivo).not.toMatch(/\bsaudável\b/i);
  });

  it("no exato mínimo a medição PASSA a valer", () => {
    expect(avaliarTopo(amostras(29, 29)).saude).toBe("SEM_AMOSTRA");
    expect(avaliarTopo(amostras(30, 30)).saude).toBe("SAUDAVEL");
  });
});

describe("a janela", () => {
  it("usa só as mais recentes — histórico velho não dilui piora de hoje", () => {
    // 50 recentes ruins + 200 antigas boas: a régua tem que enxergar a piora.
    const r = avaliarTopo([...amostras(50, 10), ...amostras(200, 200)]);
    expect(r.amostras).toBe(JANELA_AMOSTRAS_AO_VIVO);
    expect(r.derruba).toBe(true);
  });

  it("uma resposta ruim isolada não derruba ninguém (foi por isso que a janela é 50)", () => {
    const r = avaliarTopo(amostras(50, 49)); // 98%
    expect(r.derruba).toBe(false);
  });
});

// ── A trava de verdade, no caminho real ──────────────────────────────────────

const db = vi.hoisted(() => ({
  brainFreeFormConfig: { findUnique: vi.fn() },
  brainShadowLog: { findMany: vi.fn() },
  qualityAuditRun: {
    findFirst: async () => ({ id: "run_verde", finishedAt: new Date(), findings: [{ severity: "P2", status: "PASS" }] }),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { resolveFreeFormAccess } from "./BrainFreeFormConfigService";
import { __clearVerdictCache } from "./LiveStageGuard";

beforeEach(() => {
  __clearVerdictCache();
  db.brainFreeFormConfig.findUnique.mockResolvedValue({
    restaurantId: "r1", mode: "RESTAURANT_WIDE", allowlistedPhones: [], paused: false, minConfidence: 0.6, notes: null,
  });
  db.brainShadowLog.findMany.mockResolvedValue([]);
});

describe("no caminho real: portão verde + topo medido", () => {
  it("topo degradado derruba o RESTAURANT_WIDE mesmo com o portão VERDE", async () => {
    db.brainShadowLog.findMany.mockResolvedValue(amostras(50, 40)); // 80%
    const a = await resolveFreeFormAccess("r1", "5511999998888");
    expect(a.allowed).toBe(false);
    expect(a.mode).toBe("SHADOW_ONLY");
    expect(a.reason).toContain("TOPO DEGRADADO");
  });

  it("topo saudável mantém o degrau", async () => {
    db.brainShadowLog.findMany.mockResolvedValue(amostras(50, 48));
    const a = await resolveFreeFormAccess("r1", "5511999998888");
    expect(a.allowed).toBe(true);
    expect(a.topo?.saude).toBe("SAUDAVEL");
  });

  it("restaurante pequeno (sem amostra) NÃO cai — e a tela recebe o estado, não um 'ok'", async () => {
    db.brainShadowLog.findMany.mockResolvedValue(amostras(4, 0)); // 4 amostras, todas ruins
    const a = await resolveFreeFormAccess("r1", "5511999998888");
    expect(a.allowed).toBe(true);
    expect(a.topo?.saude).toBe("SEM_AMOSTRA");
    expect(a.topo?.derruba).toBe(false);
  });

  it("a leitura do topo pede SÓ amostras do topo (senão mediria a sombra)", async () => {
    await resolveFreeFormAccess("r1", "5511999998888");
    const chamada = db.brainShadowLog.findMany.mock.calls.at(-1)?.[0];
    expect(chamada?.where?.stage).toBe("LIVE");
    expect(chamada?.orderBy).toEqual({ createdAt: "desc" });
  });
});

describe("a ESTREIA: no dia em que a régua liga, ninguém pode cair em cascata", () => {
  it("banco só com histórico antigo (stage nulo) ⇒ nenhuma amostra do topo ⇒ ninguém cai", async () => {
    // Este é o estado exato da produção no instante do deploy: a coluna `stage`
    // acabou de nascer, todas as linhas anteriores estão NULAS, e nenhum turno
    // ao vivo foi gravado ainda. A leitura do topo exige stage='LIVE' ESTRITO,
    // e NULL não casa — então a régua começa em SEM_AMOSTRA para todo mundo.
    //
    // O zero da estreia é por construção, não por qualidade medida: a régua só
    // passa a ter efeito quando cada restaurante acumular 30 atendimentos ao
    // vivo. Este teste existe para que ninguém confunda as duas coisas depois.
    const linhasAntigas = Array.from({ length: 500 }, () => ({ coherence: "FAIL", stage: null }));
    db.brainShadowLog.findMany.mockImplementation((args: { where?: { stage?: string } } = {}) =>
      Promise.resolve(args?.where?.stage === "LIVE" ? linhasAntigas.filter((l) => l.stage === "LIVE") : linhasAntigas),
    );

    const a = await resolveFreeFormAccess("r1", "5511999998888");
    expect(a.allowed).toBe(true);           // permanece no degrau
    expect(a.topo?.amostras).toBe(0);
    expect(a.topo?.saude).toBe("SEM_AMOSTRA");
    expect(a.topo?.derruba).toBe(false);
  });

  it("500 linhas antigas TODAS ruins não derrubam ninguém — histórico de sombra não é medição do topo", async () => {
    const so_sombra = Array.from({ length: 500 }, () => ({ coherence: "FAIL", stage: "SHADOW" }));
    db.brainShadowLog.findMany.mockImplementation((args: { where?: { stage?: string } } = {}) =>
      Promise.resolve(args?.where?.stage === "LIVE" ? [] : so_sombra),
    );
    const a = await resolveFreeFormAccess("r1", "5511999998888");
    expect(a.allowed).toBe(true);
    expect(a.topo?.saude).toBe("SEM_AMOSTRA");
  });
});
