/**
 * Priority 1.4 verification — deterministic prompt draft + reply parsing.
 *
 * Pure-logic tests (no DB, no LLM, no network). The DB-backed persistence and
 * the WhatsApp send paths are exercised via manual/integration testing; here we
 * lock down the security-critical, deterministic behavior.
 */

import { describe, it, expect } from "vitest";
import {
  generateTechnicalPromptDraft,
  buildPromptPreview,
  type PromptSourceCommand,
} from "./BuildPromptDraftService";
import { parseBuildReply } from "./BuildReplyHandler";

function makeCmd(overrides: Partial<PromptSourceCommand>): PromptSourceCommand {
  return {
    id: "cmd_test_000001",
    rawMessage: "",
    commandText: "",
    taskType: "UNKNOWN",
    riskLevel: "UNKNOWN",
    executionIntent: "UNKNOWN",
    targetArea: "unknown",
    requiresHumanConfirmation: true,
    classificationSummary: null,
    projectId: "proj_1",
    projectSlug: "foocci",
    projectName: "Foocci",
    ...overrides,
  };
}

describe("generateTechnicalPromptDraft — structure", () => {
  const prompt = generateTechnicalPromptDraft(makeCmd({ commandText: "do a thing" }));
  it("includes all required sections", () => {
    for (const section of [
      "## Context", "## Goal", "## Current Request", "## Project",
      "## Classified Metadata", "## Required Task", "## Guardrails",
      "## Files/Areas to Inspect", "## Acceptance Criteria",
      "## Verification", "## Final Report Format",
    ]) {
      expect(prompt).toContain(section);
    }
  });
  it("is in English and instructs not to expose secrets", () => {
    // The prompt is built only from command fields, so it cannot contain real
    // secret VALUES. It SHOULD, however, instruct the executor not to expose them.
    expect(prompt).toContain("Do NOT expose or print secrets");
    expect(prompt).toContain("# Technical Task Prompt");
  });
});

describe("Test 1 — AUDIT_ONLY Pix prompt", () => {
  const prompt = generateTechnicalPromptDraft(
    makeCmd({
      commandText: "Faz um RAIO-X do checkout Pix. Não implemente nada.",
      taskType: "AUDIT",
      executionIntent: "AUDIT_ONLY",
      targetArea: "payment",
      riskLevel: "HIGH",
    }),
  );
  it("says do not modify files (audit-only)", () => {
    expect(prompt).toContain("Do NOT modify");
    expect(prompt).toContain("Only inspect");
  });
  it("includes HIGH-risk guardrails", () => {
    expect(prompt).toContain("HIGH risk");
  });
  it("includes the protected-area guardrail for payment", () => {
    expect(prompt).toContain('target area is "payment"');
    expect(prompt).toContain("Do NOT change runtime behavior");
  });
});

describe("Test 2 — Feature/UI prompt", () => {
  const prompt = generateTechnicalPromptDraft(
    makeCmd({
      commandText: "Criar botão novo na tela admin",
      taskType: "FEATURE",
      executionIntent: "IMPLEMENT",
      targetArea: "admin",
      riskLevel: "MEDIUM",
    }),
  );
  it("has implementation-oriented acceptance criteria", () => {
    expect(prompt).toContain("additive");
    expect(prompt).toContain("type-check passes");
  });
  it("never mentions relaying to Claude/GitHub", () => {
    const lower = prompt.toLowerCase();
    expect(lower).not.toContain("send to claude");
    expect(lower).not.toContain("create a github issue");
  });
});

describe("CRITICAL risk prompt", () => {
  const prompt = generateTechnicalPromptDraft(
    makeCmd({ commandText: "apagar banco", targetArea: "database", riskLevel: "CRITICAL", taskType: "FIX", executionIntent: "FIX" }),
  );
  it("forbids destructive operations", () => {
    expect(prompt).toContain("CRITICAL");
    expect(prompt).toContain("Never run destructive operations");
  });
});

describe("Unresolved project", () => {
  const prompt = generateTechnicalPromptDraft(
    makeCmd({ projectId: null, projectSlug: null, projectName: null }),
  );
  it("flags project unresolved", () => {
    expect(prompt).toContain("Project unresolved");
  });
});

describe("UNKNOWN task type", () => {
  const prompt = generateTechnicalPromptDraft(makeCmd({ taskType: "UNKNOWN", executionIntent: "UNKNOWN" }));
  it("asks for clarification/audit, not implementation", () => {
    expect(prompt).toContain("do NOT implement");
  });
});

describe("buildPromptPreview", () => {
  it("returns full text when short", () => {
    expect(buildPromptPreview("short")).toBe("short");
  });
  it("truncates long text with a marker", () => {
    const long = "x".repeat(1000);
    const preview = buildPromptPreview(long, 100);
    expect(preview.length).toBeLessThan(200);
    expect(preview).toContain("painel admin");
  });
});

describe("parseBuildReply", () => {
  it("parses ENVIAR / APROVAR / CANCELAR / STATUS (case + accent tolerant)", () => {
    expect(parseBuildReply("ENVIAR")?.action).toBe("ENVIAR");
    expect(parseBuildReply("aprovar")?.action).toBe("APROVAR");
    expect(parseBuildReply("Cancelar")?.action).toBe("CANCELAR");
    expect(parseBuildReply("status")?.action).toBe("STATUS");
  });
  it("parses AJUSTAR with instruction", () => {
    const r = parseBuildReply("AJUSTAR: foca só no Pix");
    expect(r?.action).toBe("AJUSTAR");
    expect(r?.instruction).toBe("foca só no Pix");
  });
  it("parses AJUSTAR without colon", () => {
    expect(parseBuildReply("ajustar muda o texto")?.instruction).toBe("muda o texto");
  });
  it("returns null for non-reply text", () => {
    expect(parseBuildReply("quero ver o cardápio")).toBeNull();
    expect(parseBuildReply("/build nova feature")).toBeNull();
    expect(parseBuildReply("")).toBeNull();
  });
});
