import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
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
  db.brainShadowLog.findMany.mockResolvedValue(shadowRows(120)); // evidência farta
});

/** n amostras de sombra LLM com a coerência dada. */
function shadowRows(n: number, coherence = "PASS") {
  return Array.from({ length: n }, () => ({
    reasoningMode: "LLM", coherence, confidence: 0.9, wouldEscalate: false,
  }));
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
    db.brainShadowLog.findMany.mockResolvedValue(shadowRows(5)); // só 5 amostras
    const r = await promoteFreeFormToAllowlist({ restaurantId: "r1", phones: ["5511999"], confirm: PROMOTE_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/evidência de sombra insuficiente/i);
  });

  it("coerência baixa na sombra também bloqueia, mesmo com muitas amostras", async () => {
    db.brainShadowLog.findMany.mockResolvedValue([...shadowRows(15), ...shadowRows(15, "NEEDS_REVIEW")]); // 50% PASS
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

  it("acesso por telefone: ALLOWLIST só libera quem está na lista", async () => {
    db.brainFreeFormConfig.findUnique.mockResolvedValue({
      restaurantId: "r1", mode: "ALLOWLIST", allowlistedPhones: ["5511999"], paused: false, minConfidence: 0.6, notes: null,
    });
    expect((await resolveFreeFormAccess("r1", "5511999")).allowed).toBe(true);
    expect((await resolveFreeFormAccess("r1", "5522888")).allowed).toBe(false);
  });
});
