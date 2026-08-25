import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  // Portão de qualidade VERDE (LiveStageGuard): sem isto a trava da escada
  // derruba o degrau alto por falha fechada e estes casos nunca chegariam a
  // exercitar o que querem exercitar. O teste da TRAVA em si vive em
  // src/services/brain/runtime/escadaDeIa.class.test.ts.
  qualityAuditRun: {
    findFirst: async () => ({ id: "run_verde", finishedAt: new Date(), findings: [{ severity: "P2", status: "PASS" }] }),
  },
  brainFreeFormConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  brainChangeRequest: { create: vi.fn() },
  brainShadowLog: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

// Verdade do restaurante: mockada por teste (completa vs incompleta).
const knowledge = vi.hoisted(() => ({ getSnapshot: vi.fn() }));
vi.mock("../knowledge/RestaurantKnowledgeAdapter", () => ({
  restaurantKnowledgeAdapter: { businessType: "RESTAURANT", getSnapshot: knowledge.getSnapshot },
}));

import {
  promoteFreeFormToAllowlist,
  promoteFreeFormToWide,
  rollbackFreeForm,
  PROMOTE_ALLOWLIST_CONFIRM,
  PROMOTE_WIDE_CONFIRM,
  ROLLBACK_FREEFORM_CONFIRM,
} from "./freeFormGovernance";
import { resolveFreeFormAccess } from "./BrainFreeFormConfigService";

beforeEach(() => {
  vi.clearAllMocks();
  db.brainFreeFormConfig.findUnique.mockResolvedValue(null); // default: SHADOW_ONLY
  db.brainFreeFormConfig.upsert.mockResolvedValue({});
  db.brainChangeRequest.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "cr_test", status: "PENDING_APPROVAL", ...data }),
  );
  knowledge.getSnapshot.mockResolvedValue({ completenessScore: 1 }); // verdade completa
  darSombra(shadowRows(120)); // evidência farta, tudo de produção
});

type LinhaSombra = { reasoningMode: string; coherence: string; confidence: number; wouldEscalate: boolean; sampleOrigin: string | null };

/** n amostras de sombra LLM com a coerência e a ORIGEM dadas. */
function shadowRows(n: number, coherence = "PASS", sampleOrigin: string | null = "PRODUCTION"): LinhaSombra[] {
  return Array.from({ length: n }, () => ({
    reasoningMode: "LLM", coherence, confidence: 0.9, wouldEscalate: false, sampleOrigin,
  }));
}

/**
 * O mock HONRA o filtro de origem do `where`.
 *
 * Um `mockResolvedValue` cru devolveria tudo e o teste passaria mesmo se a
 * régua tivesse esquecido o filtro — exatamente o P0 que este arquivo passa a
 * travar. O banco de mentira precisa filtrar como o de verdade, ou o teste vira
 * carimbo. `{ in: [...] }` do Prisma NÃO casa NULL: origem desconhecida fica de
 * fora por construção, e é isso que o mock reproduz.
 */
function darSombra(linhas: LinhaSombra[]) {
  db.brainShadowLog.findMany.mockImplementation((args: { where?: { sampleOrigin?: { in?: string[] } } } = {}) => {
    const aceitas = args?.where?.sampleOrigin?.in;
    return Promise.resolve(aceitas ? linhas.filter((l) => l.sampleOrigin !== null && aceitas.includes(l.sampleOrigin)) : linhas);
  });
}

describe("Free-form ladder — a escada governada do raciocínio vivo", () => {
  it("default sem config = SHADOW_ONLY: nunca responde ao vivo", async () => {
    const access = await resolveFreeFormAccess("r1", "5511999");
    expect(access.allowed).toBe(false);
    expect(access.mode).toBe("SHADOW_ONLY");
  });

  it("promoção exige o confirm EXATO", async () => {
    const r = await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: ["5511999"], confirm: "sim" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Confirmação inválida/);
  });

  it("allowlist vazia reprova", async () => {
    const r = await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: [], confirm: PROMOTE_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Allowlist vazia/);
  });

  it("verdade incompleta BLOQUEIA a promoção (o gate que faltou no incidente rodízio)", async () => {
    knowledge.getSnapshot.mockResolvedValue({ completenessScore: 0.2 });
    const r = await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: ["5511999"], confirm: PROMOTE_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/verdade incompleta/i);
  });

  it("evidência de sombra insuficiente BLOQUEIA a promoção (números, não achismo)", async () => {
    darSombra(shadowRows(5)); // só 5 amostras
    const r = await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: ["5511999"], confirm: PROMOTE_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/evidência de sombra insuficiente/i);
  });

  it("coerência baixa na sombra também bloqueia, mesmo com muitas amostras", async () => {
    darSombra([...shadowRows(15), ...shadowRows(15, "NEEDS_REVIEW")]); // 50% PASS
    const r = await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: ["5511999"], confirm: PROMOTE_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/evidência de sombra insuficiente/i);
  });

  it("SHADOW_ONLY → ALLOWLIST com gates PASS grava a config", async () => {
    const r = await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: ["5511999"], confirm: PROMOTE_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(true);
    expect(r.newMode).toBe("ALLOWLIST");
    expect(db.brainFreeFormConfig.upsert).toHaveBeenCalledTimes(1);
  });

  it("a escada NÃO pula degrau: SHADOW_ONLY → WIDE direto é recusado", async () => {
    const r = await promoteFreeFormToWide({ restaurantId: "r1", confirm: PROMOTE_WIDE_CONFIRM, acknowledgeRealCustomers: true });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/valide a ALLOWLIST/i);
  });

  it("ALLOWLIST → WIDE exige acknowledge + registra ChangeRequest CRITICAL", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "r1", mode: "ALLOWLIST", allowlistedPhones: ["5511999"], paused: false, minConfidence: 0.6, notes: null,
    });
    const semAck = await promoteFreeFormToWide({ restaurantId: "r1", confirm: PROMOTE_WIDE_CONFIRM });
    expect(semAck.success).toBe(false);

    const r = await promoteFreeFormToWide({ restaurantId: "r1", confirm: PROMOTE_WIDE_CONFIRM, acknowledgeRealCustomers: true });
    expect(r.success).toBe(true);
    expect(r.newMode).toBe("RESTAURANT_WIDE");
    expect(r.changeRequestId).toBe("cr_test");
    const crData = db.brainChangeRequest.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(crData.riskLevel).toBe("CRITICAL");
    expect(crData.runtimeImpact).toBe("PRODUCTION");
  });

  it("rollback de 30s: qualquer modo → SHADOW_ONLY", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "r1", mode: "RESTAURANT_WIDE", allowlistedPhones: [], paused: false, minConfidence: 0.6, notes: null,
    });
    const r = await rollbackFreeForm({ restaurantId: "r1", confirm: ROLLBACK_FREEFORM_CONFIRM });
    expect(r.success).toBe(true);
    expect(r.newMode).toBe("SHADOW_ONLY");
  });

  /**
   * O P0 de 06/08/2026: a régua chamava getShadowStats SEM `origins`, e sem
   * filtro o contador soma TUDO — treino de esteira, replay e, pior, as linhas
   * gravadas antes de o campo existir (migração 20260805210000), cuja origem é
   * indeterminável. O degrau que abre o raciocínio livre estava contando
   * amostras que ninguém consegue atribuir a atendimento nenhum.
   */
  describe("a régua declara DE ONDE conta — prova falsificada por construção não passa", () => {
    it("ALLOWLIST conta produção + replay, e SÓ isso", async () => {
      await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: ["5511999"], confirm: PROMOTE_ALLOWLIST_CONFIRM });
      const where = db.brainShadowLog.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where.sampleOrigin).toEqual({ in: ["PRODUCTION", "REPLAY"] });
    });

    it("RESTAURANT_WIDE conta SÓ produção — replay não abre para cliente pagante", async () => {
      db.brainFreeFormConfig.findUnique.mockResolvedValue({
        restaurantId: "r1", mode: "ALLOWLIST", allowlistedPhones: ["5511999"], paused: false, minConfidence: 0.6, notes: null,
      });
      await promoteFreeFormToWide({ restaurantId: "r1", confirm: PROMOTE_WIDE_CONFIRM, acknowledgeRealCustomers: true });
      const where = db.brainShadowLog.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where.sampleOrigin).toEqual({ in: ["PRODUCTION"] });
    });

    it("100 amostras de TREINO não promovem nada — nem o primeiro degrau", async () => {
      darSombra(shadowRows(100, "PASS", "TRAINING"));
      const r = await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: ["5511999"], confirm: PROMOTE_ALLOWLIST_CONFIRM });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/evidência de sombra insuficiente/i);
      expect(r.gates?.shadowSamples).toBe(0);
    });

    it("100 linhas SEM origem (legado) não promovem nada — ausência não é informação", async () => {
      darSombra(shadowRows(100, "PASS", null));
      const r = await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: ["5511999"], confirm: PROMOTE_ALLOWLIST_CONFIRM });
      expect(r.success).toBe(false);
      expect(r.gates?.shadowSamples).toBe(0);
    });

    it("120 amostras de REPLAY (a esteira do recepcionista) promovem o PRIMEIRO degrau", async () => {
      // A outra metade: régua que só aceita produção travaria o degrau para
      // sempre — a sombra do recepcionista vive do replay noturno. O caso
      // legítimo TEM que passar, senão o portão vira muro.
      darSombra(shadowRows(120, "PASS", "REPLAY"));
      const r = await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: ["5511999"], confirm: PROMOTE_ALLOWLIST_CONFIRM });
      expect(r.success).toBe(true);
      expect(r.gates?.shadowSamples).toBe(120);
    });

    it("120 amostras de REPLAY NÃO abrem para o restaurante inteiro", async () => {
      db.brainFreeFormConfig.findUnique.mockResolvedValue({
        restaurantId: "r1", mode: "ALLOWLIST", allowlistedPhones: ["5511999"], paused: false, minConfidence: 0.6, notes: null,
      });
      darSombra(shadowRows(120, "PASS", "REPLAY"));
      const r = await promoteFreeFormToWide({ restaurantId: "r1", confirm: PROMOTE_WIDE_CONFIRM, acknowledgeRealCustomers: true });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/replay NÃO conta neste degrau/i);
    });

    it("o relatório SEMPRE diz a composição — promover sem saber quanto é replay é promover às cegas", async () => {
      darSombra([...shadowRows(60, "PASS", "PRODUCTION"), ...shadowRows(60, "PASS", "REPLAY")]);
      const r = await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: ["5511999"], confirm: PROMOTE_ALLOWLIST_CONFIRM });
      expect(r.gates?.notes.join(" ")).toMatch(/composição da amostra: produção 60, replay 60/);
      expect(r.gates?.shadowByOrigin.PRODUCTION.llmSamples).toBe(60);
      expect(r.gates?.shadowByOrigin.REPLAY.llmSamples).toBe(60);
    });
  });

  it("acesso por telefone: ALLOWLIST só libera quem está na lista", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "r1", mode: "ALLOWLIST", allowlistedPhones: ["5511999"], paused: false, minConfidence: 0.6, notes: null,
    });
    expect((await resolveFreeFormAccess("r1", "5511999")).allowed).toBe(true);
    expect((await resolveFreeFormAccess("r1", "5522888")).allowed).toBe(false);
  });
});
