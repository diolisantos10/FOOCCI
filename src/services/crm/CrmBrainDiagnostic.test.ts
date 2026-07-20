import { describe, it, expect } from "vitest";
import { runCrmBrainDiagnostic } from "./CrmBrainDiagnostic";
import { runGateForBrain } from "@/services/brain/quality/BrainQualityGate";

describe("CrmBrainDiagnostic — o piso de segurança do Agente de CRM", () => {
  it("passa 100% e P0=0: barra oferta inventada, spam e repetição; deixa passar o seguro", () => {
    const r = runCrmBrainDiagnostic();
    expect(r.status).toBe("PASS");
    expect(r.p0).toBe(0);
    expect(r.passed).toBe(r.total);
    expect(r.noSend).toBe(true);
    expect(r.runtimeTouched).toBe(false);
    // casos perigosos foram barrados
    const byName = Object.fromEntries(r.cases.map((c) => [c.name, c]));
    expect(byName["desconto sem cupom"].blocked).toBe(true);
    expect(byName["spam imperdível"].blocked).toBe(true);
    expect(byName["repete a anterior"].blocked).toBe(true);
    // casos legítimos passaram
    expect(byName["desconto com cupom real"].blocked).toBe(false);
    expect(byName["mensagem segura"].blocked).toBe(false);
  });

  it("o agente crm está registrado no quality-gate do Brain (mesmo pé dos outros)", async () => {
    const gate = await runGateForBrain("crm");
    expect(gate.passed).toBe(true);
    expect(gate.p0Count).toBe(0);
  });
});
