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

// ═══════════════════════════════════════════════════════════════════════════
// A JANELA DE TEMPO, E O SEM_AMOSTRA QUE NÃO PODE SER SILENCIOSO (25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════

import {
  JANELA_DIAS_AO_VIVO,
  MINIMO_DIAS_OBSERVACAO,
  AMOSTRA_DO_TOPO_EXISTE_DESDE,
} from "./LiveStageHealth";

const DIA = 86_400_000;
/** Bem depois do nascimento da marca LIVE, para os testes de ritmo. */
const AGORA = Date.UTC(2026, 9, 1);

describe("a janela de tempo foi escolhida pelo volume MEDIDO", () => {
  /**
   * O ritmo medido em produção (25/08/2026): 273 respostas do Brain ao vivo em
   * 64 dias corridos no restaurante de maior movimento da carteira. Este teste
   * guarda o motivo junto do número: se alguém encolher a janela, ele quebra
   * dizendo por quê.
   */
  const RITMO_MEDIDO_POR_DIA = 273 / 64; // ≈ 4,27

  it("a janela antiga (7 dias) EMPATAVA com o piso — não era margem, era sorteio", () => {
    expect(RITMO_MEDIDO_POR_DIA * 7).toBeLessThan(MINIMO_AMOSTRAS_AO_VIVO * 1.05);
  });

  it("a janela nova entrega folga de sobra sobre o piso, ao ritmo medido", () => {
    expect(RITMO_MEDIDO_POR_DIA * JANELA_DIAS_AO_VIVO).toBeGreaterThanOrEqual(MINIMO_AMOSTRAS_AO_VIVO * 3);
  });

  it("a janela é múltiplo de 7 — o movimento medido é semanal (sexta 3x quarta)", () => {
    expect(JANELA_DIAS_AO_VIVO % 7).toBe(0);
  });

  it("o piso de amostra NÃO foi afrouxado para a régua conseguir decidir", () => {
    expect(MINIMO_AMOSTRAS_AO_VIVO).toBe(30);
  });
});

describe("estar no topo sem conseguir ser medido é um risco DECLARADO", () => {
  it("ritmo que nunca alcança o piso ⇒ risco declarado, com motivo e próxima ação", () => {
    // 10 amostras numa janela cheia de observação: ~0,36/dia. Nesse ritmo a
    // janela inteira entrega 10 — um terço do piso. Nunca vai fechar.
    const r = avaliarTopo(amostras(10, 10), { noTopoDesde: AGORA - 30 * DIA, agora: AGORA });
    expect(r.mensuravel).toBe("NAO");
    expect(r.riscoDeclarado).toBe(true);
    expect(r.alerta).toContain("TOPO SEM MEDIÇÃO POSSÍVEL");
    expect(r.proximaAcao).toMatch(/DESCER/);
    expect(r.motivo).toContain("TOPO SEM MEDIÇÃO POSSÍVEL");
  });

  it("MAS a régua continua NÃO derrubando — o piso segue protegendo o pequeno", () => {
    const r = avaliarTopo(amostras(10, 0), { noTopoDesde: AGORA - 30 * DIA, agora: AGORA });
    expect(r.riscoDeclarado).toBe(true);
    expect(r.derruba).toBe(false);          // ← a proibição segue inteira
    expect(r.saude).toBe("SEM_AMOSTRA");    // ← e nunca vira verde
  });

  it("zero amostra em janela cheia de observação também grita", () => {
    const r = avaliarTopo([], { noTopoDesde: AGORA - 40 * DIA, agora: AGORA });
    expect(r.riscoDeclarado).toBe(true);
    expect(r.derruba).toBe(false);
  });

  it("ritmo que ALCANÇA o piso não grita, mesmo com poucas amostras ainda", () => {
    // 20 amostras em 14 dias ≈ 1,43/dia ⇒ 40 numa janela cheia. Vai fechar.
    const r = avaliarTopo(amostras(20, 20), { noTopoDesde: AGORA - 14 * DIA, agora: AGORA });
    expect(r.mensuravel).toBe("SIM");
    expect(r.riscoDeclarado).toBe(false);
    expect(r.alerta).toBeNull();
  });
});

describe("o alarme não acusa ninguém antes de ter olhado tempo bastante", () => {
  it(`abaixo de ${MINIMO_DIAS_OBSERVACAO} dias de observação o veredito é AINDA_NAO_SEI`, () => {
    const r = avaliarTopo(amostras(1, 0), { noTopoDesde: AGORA - 5 * DIA, agora: AGORA });
    expect(r.mensuravel).toBe("AINDA_NAO_SEI");
    expect(r.riscoDeclarado).toBe(false);
    expect(r.alerta).toBeNull();
  });

  it("sem saber desde quando está no topo, não se conclui nada (o silêncio não é prova)", () => {
    const r = avaliarTopo(amostras(1, 0), { agora: AGORA });
    expect(r.mensuravel).toBe("AINDA_NAO_SEI");
    expect(r.coberturaDias).toBeNull();
    expect(r.riscoDeclarado).toBe(false);
  });

  /**
   * O CASO REAL DO SUSHI CAZZA, 25/08/2026. Ele está no degrau alto desde
   * 12/07, mas a marca `stage='LIVE'` só nasceu em 24/08 — nenhum turno antes
   * disso foi gravado como amostra do topo porque o código não gravava. Contar
   * esse tempo como "tempo sem juntar amostra" acusaria o agente de um silêncio
   * que era do instrumento. Este teste é o que impede o alarme falso sobre um
   * cliente faturando no dia em que a régua nova sobe.
   */
  it("tempo anterior ao nascimento da marca LIVE não conta contra ninguém", () => {
    const hoje = AMOSTRA_DO_TOPO_EXISTE_DESDE + 1 * DIA;
    const r = avaliarTopo(amostras(1, 0), { noTopoDesde: Date.UTC(2026, 6, 12), agora: hoje });
    expect(r.coberturaDias).toBeLessThanOrEqual(1.01);
    expect(r.mensuravel).toBe("AINDA_NAO_SEI");
    expect(r.riscoDeclarado).toBe(false);
    expect(r.derruba).toBe(false);
  });
});

describe("no caminho que ATENDE O CLIENTE, e não num irmão pouco usado", () => {
  it("a leitura do topo usa a janela de tempo nova", async () => {
    await resolveFreeFormAccess("r1", "5511999998888");
    const chamada = db.brainShadowLog.findMany.mock.calls.at(-1)?.[0];
    const desde = chamada?.where?.createdAt?.gte as Date;
    const dias = (Date.now() - desde.getTime()) / DIA;
    expect(Math.round(dias)).toBe(JANELA_DIAS_AO_VIVO);
  });

  it("risco declarado NÃO fecha a porta: o cliente segue sendo atendido no degrau", async () => {
    // Relógio adiantado de propósito: a cobertura é limitada pelo nascimento da
    // marca LIVE (24/08/2026), então só depois dela há tempo observado bastante
    // para a régua se pronunciar sobre mensurabilidade.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 1)));
    __clearVerdictCache();
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "r1", mode: "RESTAURANT_WIDE", allowlistedPhones: [], paused: false,
      minConfidence: 0.6, notes: null,
      updatedAt: new Date(Date.now() - 40 * DIA),
    });
    db.brainShadowLog.findMany.mockResolvedValue(amostras(3, 3)); // ~0,1/dia
    const a = await resolveFreeFormAccess("r1", "5511999998888");
    expect(a.topo?.riscoDeclarado).toBe(true);
    expect(a.topo?.derruba).toBe(false);
    expect(a.allowed).toBe(true);            // ← nada piora para quem está lá
    expect(a.mode).toBe("RESTAURANT_WIDE");
    vi.useRealTimers();
  });

  it("degradado de verdade continua derrubando — o risco novo não afrouxou a queda", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "r1", mode: "RESTAURANT_WIDE", allowlistedPhones: [], paused: false,
      minConfidence: 0.6, notes: null,
      updatedAt: new Date(Date.now() - 40 * DIA),
    });
    db.brainShadowLog.findMany.mockResolvedValue(amostras(50, 40)); // 80%
    const a = await resolveFreeFormAccess("r1", "5511999998888");
    expect(a.allowed).toBe(false);
    expect(a.mode).toBe("SHADOW_ONLY");
    expect(a.reason).toContain("TOPO DEGRADADO");
  });
});

/**
 * A TELA NÃO PODE MOSTRAR UM AGENTE E MEDIR OUTRO.
 *
 * O painel do recepcionista exibia as amostras mais recentes SEM filtro por
 * agente — e o que aparecia era a esteira de treino do CRM (`engine:
 * crm-agent`, intents `treino:*`), enquanto as estatísticas e a régua ao lado
 * filtravam certo. A régua estava correta; a tela é que enganava. Régua verde
 * sobre o componente errado é pior que régua nenhuma.
 */
describe("as amostras que a tela mostra são do MESMO agente que a régua mede", () => {
  it("a listagem do painel pede só o recepcionista (e as linhas antigas dele)", async () => {
    const { listRecentShadowSamples } = await import("./BrainShadowEvidenceService");
    db.brainShadowLog.findMany.mockResolvedValue([]);
    await listRecentShadowSamples("r1", 10, { agentId: "whatsapp" });
    const chamada = db.brainShadowLog.findMany.mock.calls.at(-1)?.[0];
    expect(chamada?.where?.OR).toEqual([{ agentId: "whatsapp" }, { agentId: null }]);
  });

  it("a listagem traz o degrau de cada linha — sombra e topo não são a mesma medição", async () => {
    const { listRecentShadowSamples } = await import("./BrainShadowEvidenceService");
    db.brainShadowLog.findMany.mockResolvedValue([]);
    await listRecentShadowSamples("r1", 10, { agentId: "whatsapp" });
    const chamada = db.brainShadowLog.findMany.mock.calls.at(-1)?.[0];
    expect(chamada?.select?.stage).toBe(true);
    expect(chamada?.select?.agentId).toBe(true);
  });
});
