/**
 * Priority 1.3 verification — deterministic command classifier (no LLM).
 *
 * Covers the spec examples + the safety floors (sensitive areas never LOW,
 * destructive data/production language is CRITICAL, audit-only lowers intent
 * without hiding the area's risk).
 */

import { describe, it, expect } from "vitest";
import {
  classifyBuildCommandText,
  detectTaskType,
  detectExecutionIntent,
  detectTargetArea,
  detectRiskLevel,
} from "./BuildCommandClassifier";

describe("Example 1 — RAIO-X do checkout Pix, não implemente", () => {
  const c = classifyBuildCommandText("Faz um RAIO-X do checkout Pix. Não implemente nada ainda.");
  it("taskType AUDIT", () => expect(c.taskType).toBe("AUDIT"));
  it("executionIntent AUDIT_ONLY", () => expect(c.executionIntent).toBe("AUDIT_ONLY"));
  it("targetArea payment (Pix wins as most sensitive)", () =>
    expect(c.targetArea).toBe("payment"));
  it("risk HIGH (audit-only does not hide the sensitive area)", () =>
    expect(c.riskLevel).toBe("HIGH"));
  it("requires human confirmation", () => expect(c.requiresHumanConfirmation).toBe(true));
});

describe("Example 2 — Corrigir bug no WhatsApp webhook", () => {
  const c = classifyBuildCommandText("Corrigir bug no WhatsApp webhook");
  it("taskType FIX", () => expect(c.taskType).toBe("FIX"));
  it("executionIntent FIX", () => expect(c.executionIntent).toBe("FIX"));
  it("targetArea whatsapp", () => expect(c.targetArea).toBe("whatsapp"));
  it("risk HIGH", () => expect(c.riskLevel).toBe("HIGH"));
});

describe("Example 3 — Criar botão novo na tela admin", () => {
  const c = classifyBuildCommandText("Criar botão novo na tela admin");
  it("taskType FEATURE or UI_UX", () =>
    expect(["FEATURE", "UI_UX"]).toContain(c.taskType));
  it("targetArea admin or ui", () =>
    expect(["admin", "ui"]).toContain(c.targetArea));
  it("risk MEDIUM", () => expect(c.riskLevel).toBe("MEDIUM"));
});

describe("Example 4 — Ajustar texto do card de campanha", () => {
  const c = classifyBuildCommandText("Ajustar texto do card de campanha");
  it("taskType UI_UX or FEATURE", () =>
    expect(["UI_UX", "FEATURE", "UNKNOWN"]).toContain(c.taskType));
  it("risk LOW or MEDIUM", () =>
    expect(["LOW", "MEDIUM"]).toContain(c.riskLevel));
});

describe("Example 5 — Apagar banco de produção", () => {
  const c = classifyBuildCommandText("Apagar banco de produção");
  it("risk CRITICAL", () => expect(c.riskLevel).toBe("CRITICAL"));
  it("requires human confirmation", () => expect(c.requiresHumanConfirmation).toBe(true));
});

describe("Safety floors", () => {
  it("auditing Pix is still HIGH but AUDIT_ONLY", () => {
    const c = classifyBuildCommandText("apenas analisar o fluxo de pagamento Pix");
    expect(c.executionIntent).toBe("AUDIT_ONLY");
    expect(c.riskLevel).toBe("HIGH");
  });

  it("auth + token is at least HIGH", () => {
    const c = classifyBuildCommandText("revisar o admin secret e os tokens de login");
    expect(["HIGH", "CRITICAL"]).toContain(c.riskLevel);
  });

  it("destructive language on data/production is CRITICAL", () => {
    expect(detectRiskLevel("limpar tabela de pedidos", "FIX", "database", "FIX")).toBe("CRITICAL");
    // "resetar produção" hits production → CRITICAL per spec.
    expect(detectRiskLevel("resetar produção agora", "UNKNOWN", "unknown", "UNKNOWN")).toBe("CRITICAL");
  });

  it("non-data destructive language alone is at least HIGH", () => {
    expect(detectRiskLevel("remover tudo da tela", "UI_UX", "ui", "IMPLEMENT")).toBe("HIGH");
  });

  it("cosmetic copy in a non-sensitive area can be LOW", () => {
    const c = classifyBuildCommandText("trocar o label do ícone de ajuda");
    expect(["LOW", "MEDIUM"]).toContain(c.riskLevel);
  });

  it("waiter/order runtime area is never below HIGH", () => {
    expect(detectTargetArea("mexer no waiter do /pedido")).toBe("waiter");
    const c = classifyBuildCommandText("melhorar copy do waiter no /pedido");
    expect(c.riskLevel).toBe("HIGH");
  });
});

describe("primitive detectors", () => {
  it("detectExecutionIntent honors explicit no-implement", () => {
    expect(detectExecutionIntent("criar feature, mas não implemente ainda")).toBe("AUDIT_ONLY");
  });
  it("detectTaskType audit beats feature when both present", () => {
    expect(detectTaskType("auditar antes de criar a feature")).toBe("AUDIT");
  });
  it("buildos area resolves", () => {
    expect(detectTargetArea("melhorar o Build OS / Prompt Relay")).toBe("buildos");
  });
});
