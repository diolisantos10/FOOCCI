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
  PROMOTE_CRM_ALLOWLIST_CONFIRM,
  PROMOTE_CRM_WIDE_CONFIRM,
  ROLLBACK_CRM_CONFIRM,
} from "./crmAgentGovernance";

beforeEach(() => {
  vi.clearAllMocks();
  db.crmAgentPilotConfig.findUnique.mockResolvedValue(null); // default SHADOW_ONLY
  db.crmAgentPilotConfig.upsert.mockResolvedValue({});
  gate.runGateForBrain.mockResolvedValue({ passed: true, p0Count: 0, reason: "PASS", ranAt: "" });
  shadow.getShadowStats.mockResolvedValue({ samples: 40, llmSamples: 40, coherencePassRate: 0.9, avgConfidence: 0.8, escalationRate: 0, sinceDays: 7 });
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
    shadow.getShadowStats.mockResolvedValue({ samples: 5, llmSamples: 5, coherencePassRate: 0.5, avgConfidence: 0.5, escalationRate: 0, sinceDays: 7 });
    const r = await promoteCrmAgentToAllowlist({ restaurantId: "r1", phones: ["5511999999999"], confirm: PROMOTE_CRM_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.gates?.shadowEvidence).toBe(false);
  });

  it("ALLOWLIST promove com gates PASS + confirm + telefones", async () => {
    const r = await promoteCrmAgentToAllowlist({ restaurantId: "r1", phones: ["5511999999999"], abTestPercent: 50, confirm: PROMOTE_CRM_ALLOWLIST_CONFIRM });
    expect(r.success).toBe(true);
    expect(r.newMode).toBe("ALLOWLIST");
    expect(r.runtimeTouched).toBe(false);
    // lê a evidência SÓ do agente crm
    expect(shadow.getShadowStats).toHaveBeenCalledWith("r1", { agentId: "crm" });
  });

  it("WIDE exige reconhecimento explícito de clientes reais", async () => {
    db.crmAgentPilotConfig.findUnique.mockResolvedValue({ mode: "ALLOWLIST", allowlistedPhones: ["x"], paused: false, minConfidence: 0.6, abTestPercent: 100, notes: null });
    const r = await promoteCrmAgentToWide({ restaurantId: "r1", confirm: PROMOTE_CRM_WIDE_CONFIRM });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/acknowledgeRealCustomers/);
  });

  it("WIDE promove de ALLOWLIST com gates do degrau WIDE + acknowledge", async () => {
    db.crmAgentPilotConfig.findUnique.mockResolvedValue({ mode: "ALLOWLIST", allowlistedPhones: ["x"], paused: false, minConfidence: 0.6, abTestPercent: 100, notes: null });
    shadow.getShadowStats.mockResolvedValue({ samples: 150, llmSamples: 150, coherencePassRate: 0.9, avgConfidence: 0.85, escalationRate: 0, sinceDays: 7 });
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
