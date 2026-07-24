import { describe, it, expect } from "vitest";
import {
  planRemediation,
  findAction,
  REMEDIATION_CATALOG,
  currentMode,
} from "./SupportRemediationLadder";
import { runSupportBrainDiagnostic } from "./SupportBrainDiagnostic";

describe("SupportRemediationLadder — o freio de mão", () => {
  it("Fase 0: começa em SOMBRA", () => {
    expect(currentMode()).toBe("SHADOW_ONLY");
  });

  it("em SOMBRA nenhuma ação do catálogo executa (mas propõe + escala)", () => {
    for (const a of REMEDIATION_CATALOG) {
      const p = planRemediation(a.key, "SHADOW_ONLY");
      expect(p.canExecuteNow).toBe(false);
      expect(p.escalate).toBe(true);
      expect(p.action?.key).toBe(a.key); // a proposta é registrada
    }
  });

  it("ação fora do catálogo nunca é reconhecida (não inventa ação)", () => {
    expect(findAction("delete_all_orders")).toBeNull();
    expect(findAction("rm -rf /")).toBeNull();
    const p = planRemediation("delete_all_orders", "RESTAURANT_WIDE");
    expect(p.action).toBeNull();
    expect(p.canExecuteNow).toBe(false);
    expect(p.escalate).toBe(true);
  });

  it("sem ação candidata → escala", () => {
    const p = planRemediation(null, "RESTAURANT_WIDE");
    expect(p.canExecuteNow).toBe(false);
    expect(p.escalate).toBe(true);
  });

  it("toda ação do catálogo é reversível/idempotente e começa desabilitada", () => {
    for (const a of REMEDIATION_CATALOG) {
      expect(a.reversible).toBe(true);
      expect(a.idempotent).toBe(true);
      expect(a.enabled).toBe(false);
      expect(a.maxAttempts).toBeGreaterThanOrEqual(1);
    }
  });

  it("mesmo acima de SOMBRA, ação desabilitada não executa", () => {
    for (const a of REMEDIATION_CATALOG) {
      const p = planRemediation(a.key, "ALLOWLIST");
      expect(p.canExecuteNow).toBe(false); // enabled=false na Fase 0
      expect(p.escalate).toBe(true);
    }
  });
});

describe("SupportBrainDiagnostic — piso de segurança P0=0", () => {
  it("todas as propriedades de segurança sustentam (PASS, p0=0)", () => {
    const r = runSupportBrainDiagnostic();
    expect(r.status).toBe("PASS");
    expect(r.p0).toBe(0);
    expect(r.passed).toBe(r.total);
    expect(r.runtimeTouched).toBe(false);
  });
});
