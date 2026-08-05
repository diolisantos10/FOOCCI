import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  crmAgentPilotConfig: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const gate = vi.hoisted(() => ({ runGateForBrain: vi.fn() }));
vi.mock("@/services/brain/quality/BrainQualityGate", () => gate);

const shadow = vi.hoisted(() => ({ getShadowStats: vi.fn() }));
vi.mock("@/services/brain/runtime/BrainShadowEvidenceService", () => shadow);

import {
  promoteCrmAgentToAllowlist,
  promoteCrmAgentToWide,
  rollbackCrmAgent,
  runCrmPilotGates,
  CRM_SHADOW_EVIDENCE,
  PROMOTE_CRM_ALLOWLIST_CONFIRM,
  PROMOTE_CRM_WIDE_CONFIRM,
  ROLLBACK_CRM_CONFIRM,
} from "./crmAgentGovernance";

/** Composição por origem — o gate passou a exigir que ela venha declarada. */
function origens(over: Partial<Record<"PRODUCTION" | "REPLAY" | "TRAINING" | "UNKNOWN", number>> = {}) {
  const um = (n = 0) => ({ samples: n, llmSamples: n, coherencePass: n });
  return {
    PRODUCTION: um(over.PRODUCTION),
    REPLAY: um(over.REPLAY),
    TRAINING: um(over.TRAINING),
    UNKNOWN: um(over.UNKNOWN),
  };
}

function stats(over: Record<string, unknown> = {}) {
  return {
    samples: 40, llmSamples: 40, coherencePassRate: 0.9, avgConfidence: 0.8, escalationRate: 0, sinceDays: 7,
    originsCounted: null, byOrigin: origens({ PRODUCTION: 40 }),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.crmAgentPilotConfig.findUnique.mockResolvedValue(null); // default SHADOW_ONLY
  db.crmAgentPilotConfig.upsert.mockResolvedValue({});
  gate.runGateForBrain.mockResolvedValue({ passed: true, p0Count: 0, reason: "PASS", ranAt: "" });
  shadow.getShadowStats.mockResolvedValue(stats());
});

describe("crmAgentGovernance — a escada do agente de CRM", () => {
  it("ALLOWLIST exige confirm exato", async () => {
    const r = await promoteCrmAgentToAllowlist({ restaurantId: "r1", phones: ["5511999999999"], confirm: "errado" });
    expect(r.success).toBe(false);
    expect(db.crmAgentPilotConfig.upsert).not.toHaveBeenCalled();
  });

  it("ALLOWLIST exige telefones", async () => {
    const r = await promoteCrmAgentToAllowlist({ restaurantId: "r1", phones: [], confirm: PROMOTE_CRM_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Allowlist vazia/);
  });

  it("ALLOWLIST bloqueia quando o gate reprova (piso/probes)", async () => {
    gate.runGateForBrain.mockResolvedValue({ passed: false, p0Count: 2, reason: "probes vazaram", ranAt: "" });
    const r = await promoteCrmAgentToAllowlist({ restaurantId: "r1", phones: ["5511999999999"], confirm: PROMOTE_CRM_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.gates?.allPass).toBe(false);
  });

  it("ALLOWLIST bloqueia com evidência de sombra insuficiente", async () => {
    shadow.getShadowStats.mockResolvedValue(stats({ samples: 5, llmSamples: 5, coherencePassRate: 0.5, byOrigin: origens({ TRAINING: 5 }) }));
    const r = await promoteCrmAgentToAllowlist({ restaurantId: "r1", phones: ["5511999999999"], confirm: PROMOTE_CRM_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.gates?.shadowEvidence).toBe(false);
  });

  it("ALLOWLIST promove com gates PASS + confirm + telefones", async () => {
    const r = await promoteCrmAgentToAllowlist({ restaurantId: "r1", phones: ["5511999999999"], abTestPercent: 50, confirm: PROMOTE_CRM_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(true);
    expect(r.newMode).toBe("ALLOWLIST");
    expect(r.runtimeTouched).toBe(false);
    // lê a evidência SÓ do agente crm, e só das origens que este degrau aceita
    expect(shadow.getShadowStats).toHaveBeenCalledWith("r1", {
      agentId: "crm",
      origins: CRM_SHADOW_EVIDENCE.ALLOWLIST.origins,
    });
  });

  it("WIDE exige reconhecimento explícito de clientes reais", async () => {
    db.crmAgentPilotConfig.findUnique.mockResolvedValue({ mode: "ALLOWLIST", allowlistedPhones: ["x"], paused: false, minConfidence: 0.6, abTestPercent: 100, notes: null });
    const r = await promoteCrmAgentToWide({ restaurantId: "r1", confirm: PROMOTE_CRM_WIDE_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/acknowledgeRealCustomers/);
  });

  it("WIDE promove de ALLOWLIST com gates do degrau WIDE + acknowledge", async () => {
    db.crmAgentPilotConfig.findUnique.mockResolvedValue({ mode: "ALLOWLIST", allowlistedPhones: ["x"], paused: false, minConfidence: 0.6, abTestPercent: 100, notes: null });
    shadow.getShadowStats.mockResolvedValue(stats({ samples: 150, llmSamples: 150, coherencePassRate: 0.9, byOrigin: origens({ PRODUCTION: 150 }) }));
    const r = await promoteCrmAgentToWide({ restaurantId: "r1", confirm: PROMOTE_CRM_WIDE_CONFIRM, acknowledgeRealCustomers: true });
    expect(r.success).toBe(true);
    expect(r.newMode).toBe("RESTAURANT_WIDE");
  });

  it("rollback volta pra SHADOW_ONLY com confirm", async () => {
    db.crmAgentPilotConfig.findUnique.mockResolvedValue({ mode: "RESTAURANT_WIDE", allowlistedPhones: [], paused: false, minConfidence: 0.6, abTestPercent: 100, notes: null });
    const r = await rollbackCrmAgent({ restaurantId: "r1", confirm: ROLLBACK_CRM_CONFIRM });
    expect(r.success).toBe(true);
    expect(r.newMode).toBe("SHADOW_ONLY");
  });
});

/**
 * A régua enxerga DE ONDE a amostra veio (05/08/2026).
 *
 * As duas metades: a esteira de treino destrava o PRIMEIRO degrau (era isso que
 * o degrau cancelado de "mensagem real para o time" deveria destravar) e NÃO
 * destrava o último — abrir para todos os clientes reais continua exigindo as
 * mesmas 100 amostras de vida real que exigia antes de a esteira existir.
 */
describe("crmAgentGovernance — origem da amostra por degrau", () => {
  it("ALLOWLIST conta produção E treino", () => {
    expect(CRM_SHADOW_EVIDENCE.ALLOWLIST.origins).toEqual(["PRODUCTION", "TRAINING"]);
  });

  it("RESTAURANT_WIDE conta SÓ produção — simulação não abre a porta dos clientes reais", () => {
    expect(CRM_SHADOW_EVIDENCE.RESTAURANT_WIDE.origins).toEqual(["PRODUCTION"]);
  });

  it("DEIXA PASSAR: 20 amostras de TREINO bastam para o gate do primeiro degrau", async () => {
    shadow.getShadowStats.mockResolvedValue(
      stats({ samples: 22, llmSamples: 22, coherencePassRate: 0.77, byOrigin: origens({ TRAINING: 22 }) }),
    );
    const gates = await runCrmPilotGates("r1", "ALLOWLIST");
    expect(gates.shadowEvidence).toBe(true);
    expect(gates.allPass).toBe(true);
  });

  it("BARRA: o gate do degrau WIDE pede à base só as amostras de PRODUÇÃO", async () => {
    await runCrmPilotGates("r1", "RESTAURANT_WIDE");
    expect(shadow.getShadowStats).toHaveBeenCalledWith("r1", { agentId: "crm", origins: ["PRODUCTION"] });
  });

  it("BARRA: sem amostra de produção, o degrau WIDE reprova e DIZ que treino não vale ali", async () => {
    shadow.getShadowStats.mockResolvedValue(
      stats({ samples: 0, llmSamples: 0, coherencePassRate: 0, byOrigin: origens() }),
    );
    const gates = await runCrmPilotGates("r1", "RESTAURANT_WIDE");
    expect(gates.shadowEvidence).toBe(false);
    expect(gates.notes.join(" ")).toMatch(/treino NÃO conta neste degrau/);
  });

  it("o relatório SEMPRE declara a composição da amostra", async () => {
    shadow.getShadowStats.mockResolvedValue(
      stats({ byOrigin: origens({ PRODUCTION: 12, TRAINING: 28 }) }),
    );
    const gates = await runCrmPilotGates("r1", "ALLOWLIST");
    expect(gates.notes.join(" ")).toContain("composição da amostra: produção 12, treino 28");
    expect(gates.shadowByOrigin.TRAINING.llmSamples).toBe(28);
  });
});
