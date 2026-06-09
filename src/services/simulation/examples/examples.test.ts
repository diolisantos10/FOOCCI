import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  agentSimulationExample: { findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { sanitizeText, detectRiskFlags } from "../simulationSanitizer";
import { classifyIntent } from "./intentClassifier";
import { extractExamples, type RawConversation } from "./SimulationExampleExtractor";
import { WaiterSimulationAdapter } from "../waiter/WaiterSimulationAdapter";
import { WAITER_SCENARIO_TEMPLATES } from "../waiter/waiterScenarioTemplates";

// ── sanitizer (Part 3) ───────────────────────────────────────────────────────
describe("simulationSanitizer (strong PII/secret masking)", () => {
  it("(P3.1) masks BR phone", () => expect(sanitizeText("zap 11999998888")).not.toMatch(/\d{8,}/));
  it("(fix) 11-digit phone → [telefone] (not [cpf]); punctuated CPF → [cpf]", () => {
    expect(sanitizeText("zap 11999998888")).toContain("[telefone]");
    expect(sanitizeText("(11) 99999-8888")).toContain("[telefone]");
    expect(sanitizeText("cpf 123.456.789-09")).toContain("[cpf]");
    expect(sanitizeText("cpf 123.456.789-09")).not.toContain("[telefone]");
  });
  it("(P3.2) masks email", () => expect(sanitizeText("joao@teste.com")).toContain("[email]"));
  it("(P3.3) masks address", () => expect(sanitizeText("moro na Rua das Flores 123")).toContain("[endereco]"));
  it("(P3.4) masks CPF and CNPJ", () => {
    expect(sanitizeText("cpf 123.456.789-09")).toContain("[cpf]");
    expect(sanitizeText("cnpj 12.345.678/0001-99")).toContain("[cnpj]");
  });
  it("masks tokens/bearer and order numbers", () => {
    expect(sanitizeText("Bearer abcdef123456")).toContain("[secret]");
    expect(sanitizeText("pedido 4567")).toContain("[pedido]");
  });
  it("masks a name after a self-introduction cue", () => {
    const out = sanitizeText("oi, sou a Maria e quero pedir");
    expect(out).toContain("[nome]");
    expect(out).not.toMatch(/Maria/);
  });
  it("detectRiskFlags reports the categories present", () => {
    const flags = detectRiskFlags("sou a Maria, telefone 11999998888, email a@b.com");
    expect(flags).toEqual(expect.arrayContaining(["phone", "email", "name"]));
  });
});

// ── intent classifier ────────────────────────────────────────────────────────
describe("classifyIntent", () => {
  it("maps phrases to the right scenario types", () => {
    expect(classifyIntent("tem opção vegana?").scenarioType).toBe("DIETARY_RESTRICTION");
    expect(classifyIntent("quero algo barato").scenarioType).toBe("BUDGET_CUSTOMER");
    expect(classifyIntent("somos 4 pessoas").scenarioType).toBe("GROUP_CUSTOMER");
    expect(classifyIntent("blá blá").scenarioType).toBe("INDECISIVE_CUSTOMER");
  });
});

// ── extractor (Part 2) ───────────────────────────────────────────────────────
function conv(over: Partial<RawConversation> = {}): RawConversation {
  return {
    id: "c1", channel: "WHATSAPP", restaurantId: "r1",
    messages: [{ senderType: "CUSTOMER", direction: "INBOUND", content: "oi, sou a Maria, meu zap é 11999998888, tem opção vegana?" }],
    ...over,
  };
}

describe("SimulationExampleExtractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.agentSimulationExample.findMany.mockResolvedValue([]); // none seen yet
    db.agentSimulationExample.create.mockResolvedValue({ id: "e1" });
  });

  it("(P2/P3) creates a SANITIZED example, pending approval, classified", async () => {
    const res = await extractExamples({}, { fetch: async () => [conv()] });
    expect(res.created).toBe(1);
    const data = db.agentSimulationExample.create.mock.calls[0][0].data;
    expect(data.status).toBe("PENDING_REVIEW");
    expect(data.isApprovedForSimulation).toBe(false);
    expect(data.scenarioType).toBe("DIETARY_RESTRICTION");
    // transcript must be sanitized — no raw phone/name
    expect(data.sanitizedTranscript).not.toMatch(/11999998888/);
    expect(data.sanitizedTranscript).not.toMatch(/Maria/);
    // riskFlags record what was masked
    expect(data.riskFlags).toContain("phone");
  });

  it("(P12-ex.6) does not duplicate an already-extracted conversation", async () => {
    db.agentSimulationExample.findMany.mockResolvedValue([{ sourceId: "c1" }]);
    const res = await extractExamples({}, { fetch: async () => [conv({ id: "c1" })] });
    expect(res.created).toBe(0);
    expect(res.skipped).toBe(1);
    expect(db.agentSimulationExample.create).not.toHaveBeenCalled();
  });

  it("skips conversations with no customer message", async () => {
    const res = await extractExamples({}, { fetch: async () => [conv({ messages: [{ senderType: "AI", direction: "OUTBOUND", content: "olá!" }] })] });
    expect(res.created).toBe(0);
  });
});

// ── generator uses approved examples (variations, not literal copy) ───────────
describe("generator + approved examples", () => {
  const templateMessages = new Set(WAITER_SCENARIO_TEMPLATES.flatMap((t) => t.messages));

  it("(P12-ex.9/10) approved examples bias scenario types; phrasing stays template-based (no literal copy)", () => {
    const examples = [
      { exampleId: "e1", intent: "restrição", scenarioType: "DIETARY_RESTRICTION" },
      { exampleId: "e2", intent: "restrição", scenarioType: "DIETARY_RESTRICTION" },
    ];
    const scenarios = WaiterSimulationAdapter.generateScenarios({ seed: "ex", count: 12, examples });
    const inspired = scenarios.filter((s) => (s.customerConstraints as Record<string, unknown>).inspiredByExampleId);
    expect(inspired.length).toBeGreaterThan(0);
    // every generated message is a template variation — never an arbitrary/literal string
    for (const s of scenarios) expect(templateMessages.has(s.initialMessage)).toBe(true);
  });

  it("(P12-ex.8) with NO examples, generation still works and tags nothing as inspired", () => {
    const scenarios = WaiterSimulationAdapter.generateScenarios({ seed: "ex", count: 6 });
    const inspired = scenarios.filter((s) => (s.customerConstraints as Record<string, unknown>).inspiredByExampleId);
    expect(inspired.length).toBe(0);
  });
});
