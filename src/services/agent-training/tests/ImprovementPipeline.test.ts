/**
 * Agent Training Improvement Pipeline — focused tests
 *
 * A. processRunForProposals creates proposal per uncovered failure category
 * B. Category-based dedup skips covered categories but never blocks all
 * C. maxOpenProposals cap respected with visible skip reason
 * D. autoCreateProposals=false skips with visible reason
 * E. Proposal creation always uses PENDING_APPROVAL
 * F. backfillProposals evaluates missing + creates grouped proposals
 * G. Backfill respects dedup and queue cap
 * H. generateProposal error is captured as skip reason (no silent failure)
 *
 * No DB, no WhatsApp, no orders, no Pix — OpenAI and Prisma fully mocked.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  agentTrainingConfig:      { findUnique: vi.fn() },
  agentTrainingScenario:    { findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  agentImprovementProposal: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  agentTrainingEvaluation:  { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const openaiMock = vi.hoisted(() => ({
  chat: { completions: { create: vi.fn() } },
}));
vi.mock("@/lib/openai", () => ({ openai: openaiMock }));

import {
  processRunForProposals,
  backfillProposals,
  getCoveredFailureCategories,
} from "../AgentTrainingImprovementService";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GPT_PROPOSAL_JSON = JSON.stringify({
  title:              "Melhorar resposta para intenção desconhecida",
  problemSummary:     "Agente não classificou a mensagem do cliente.",
  rootCause:          "Falta regra de intent para o padrão capturado.",
  proposedChangeType: "ROUTING_RULE",
  proposedPatchText:  "Adicionar fallback seguro com handoff quando confiança baixa.",
  riskLevel:          "LOW",
  expectedImpact:     "Elimina respostas 'não entendi' repetidas.",
  beforeScore:        40,
  afterScoreEstimate: 80,
});

function mockGptProposal() {
  openaiMock.chat.completions.create.mockResolvedValue({
    choices: [{ message: { content: GPT_PROPOSAL_JSON } }],
  });
}

function warnScenario(id: string, goal: string) {
  return {
    id,
    runId:          "run-1",
    restaurantId:   "rest-1",
    title:          `Cenário ${id}`,
    goal,
    failureSummary: "Bot não respondeu adequadamente",
    transcriptJson: [
      { role: "customer", content: "mensagem mascarada ###" },
      { role: "agent",    content: "não entendi" },
    ],
    expectedOutcomeJson: {},
    status:         "WARN",
    evaluations:    [] as Array<{ id: string }>,
  };
}

function setupDefaults(overrides: {
  config?:       Record<string, unknown> | null;
  pendingCount?: number;
  failures?:     ReturnType<typeof warnScenario>[];
  coveredProposals?: Array<{ sourceScenarioIds: string[] }>;
} = {}) {
  prismaMock.agentTrainingConfig.findUnique.mockResolvedValue(
    overrides.config === null ? null : {
      agentType:           "WHATSAPP_ORDERING",
      autoCreateProposals: true,
      ...overrides.config,
    },
  );
  prismaMock.agentImprovementProposal.count.mockResolvedValue(overrides.pendingCount ?? 0);
  // findMany is called for: (1) covered proposals, (2) failure scenarios (analyzeFailures)
  prismaMock.agentImprovementProposal.findMany.mockResolvedValue(overrides.coveredProposals ?? []);
  prismaMock.agentTrainingScenario.findMany.mockResolvedValue(overrides.failures ?? []);
  prismaMock.agentImprovementProposal.create.mockResolvedValue({ id: "prop-new" });
  prismaMock.agentTrainingEvaluation.create.mockResolvedValue({ id: "eval-new" });
  prismaMock.agentTrainingScenario.update.mockResolvedValue({});
  prismaMock.agentTrainingScenario.count.mockResolvedValue(0);
  mockGptProposal();
}

// ── A. Proposal per uncovered category ────────────────────────────────────────

describe("A — processRunForProposals creates proposals for uncovered categories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates one proposal per failure category", async () => {
    setupDefaults({
      failures: [
        warnScenario("s1", "UNKNOWN_INTENT"),
        warnScenario("s2", "UNKNOWN_INTENT"),
        warnScenario("s3", "PRICE_LOOKUP"),
      ],
    });

    const summary = await processRunForProposals({
      runId: "run-1", agentType: "WHATSAPP_ORDERING", restaurantId: "rest-1",
    });

    expect(summary.groupsFound).toBe(2);
    expect(summary.proposalsCreated).toBe(2);
    expect(summary.skipped).toHaveLength(0);
    expect(prismaMock.agentImprovementProposal.create).toHaveBeenCalledTimes(2);
  });
});

// ── B. Category dedup never blocks all ────────────────────────────────────────

describe("B — dedup skips covered category but allows new categories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips UNKNOWN_INTENT (covered) but still creates PRICE_LOOKUP proposal", async () => {
    setupDefaults({
      failures: [
        warnScenario("s1", "UNKNOWN_INTENT"),
        warnScenario("s3", "PRICE_LOOKUP"),
      ],
      coveredProposals: [{ sourceScenarioIds: ["old-1"] }],
    });
    // The covered proposal's scenarios resolve to UNKNOWN_INTENT goal
    prismaMock.agentTrainingScenario.findMany
      .mockResolvedValueOnce([warnScenario("s1", "UNKNOWN_INTENT"), warnScenario("s3", "PRICE_LOOKUP")]) // analyzeFailures
      .mockResolvedValueOnce([{ goal: "UNKNOWN_INTENT" }]); // covered categories lookup

    const summary = await processRunForProposals({
      runId: "run-1", agentType: "WHATSAPP_ORDERING",
    });

    expect(summary.proposalsCreated).toBe(1);
    expect(summary.skipped).toEqual([
      { category: "UNKNOWN_INTENT", reason: expect.stringContaining("coberta") },
    ]);
  });
});

// ── C. maxOpenProposals cap with visible reason ───────────────────────────────

describe("C — queue cap is respected with a visible skip reason", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips everything when 15+ proposals pending and reports why", async () => {
    setupDefaults({
      pendingCount: 15,
      failures:     [warnScenario("s1", "UNKNOWN_INTENT")],
    });

    const summary = await processRunForProposals({
      runId: "run-1", agentType: "WHATSAPP_ORDERING",
    });

    expect(summary.proposalsCreated).toBe(0);
    expect(summary.skipped[0]?.reason).toContain("Fila cheia");
    expect(prismaMock.agentImprovementProposal.create).not.toHaveBeenCalled();
  });
});

// ── D. Config off = visible skip ──────────────────────────────────────────────

describe("D — autoCreateProposals=false produces visible skip, not silence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns skip reason when config disables proposals", async () => {
    setupDefaults({ config: { autoCreateProposals: false } });

    const summary = await processRunForProposals({
      runId: "run-1", agentType: "WHATSAPP_ORDERING",
    });

    expect(summary.proposalsCreated).toBe(0);
    expect(summary.skipped[0]?.reason).toContain("desativado");
  });
});

// ── E. PENDING_APPROVAL always ────────────────────────────────────────────────

describe("E — proposals are always created as PENDING_APPROVAL", () => {
  beforeEach(() => vi.clearAllMocks());

  it("proposal create call uses status PENDING_APPROVAL", async () => {
    setupDefaults({ failures: [warnScenario("s1", "UNKNOWN_INTENT")] });

    await processRunForProposals({ runId: "run-1", agentType: "WHATSAPP_ORDERING" });

    expect(prismaMock.agentImprovementProposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING_APPROVAL" }),
      }),
    );
  });

  it("never creates APPLIED_TO_PRODUCTION", async () => {
    setupDefaults({ failures: [warnScenario("s1", "UNKNOWN_INTENT")] });
    await processRunForProposals({ runId: "run-1", agentType: "WHATSAPP_ORDERING" });

    for (const call of prismaMock.agentImprovementProposal.create.mock.calls) {
      expect((call[0] as { data: { status: string } }).data.status).not.toBe("APPLIED_TO_PRODUCTION");
    }
  });
});

// ── F. Backfill evaluates + proposes ──────────────────────────────────────────

describe("F — backfillProposals evaluates missing and creates grouped proposals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("evaluates scenarios without evaluations and creates proposal per category", async () => {
    const scenarios = [
      warnScenario("s1", "UNKNOWN_INTENT"),
      { ...warnScenario("s2", "UNKNOWN_INTENT"), evaluations: [{ id: "e1" }] },
    ];
    setupDefaults();
    // Call order: (1) initial WARN/FAIL scan, (2) re-read still failing,
    // (3) covered categories scenario lookup (skipped if no covered proposals)
    prismaMock.agentTrainingScenario.findMany
      .mockResolvedValueOnce(scenarios)             // scan
      .mockResolvedValueOnce(scenarios);            // still failing re-read
    // GPT evaluation response (for evaluateScenario) and proposal response share the mock;
    // evaluateScenario parses scores — provide valid eval JSON first, then proposal
    openaiMock.chat.completions.create
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ overallScore: 45, verdict: "WARN" }) } }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: GPT_PROPOSAL_JSON } }] });

    const summary = await backfillProposals({ agentType: "WHATSAPP_ORDERING", sinceHours: 168 });

    expect(summary.scenariosScanned).toBe(2);
    expect(summary.evaluationsCreated).toBe(1); // only s1 was missing evaluation
    expect(summary.proposalsCreated).toBe(1);   // one grouped UNKNOWN_INTENT proposal
    expect(prismaMock.agentTrainingEvaluation.create).toHaveBeenCalledTimes(1);
  });

  it("returns zeros when no WARN/FAIL exist", async () => {
    setupDefaults();
    prismaMock.agentTrainingScenario.findMany.mockResolvedValue([]);

    const summary = await backfillProposals({ agentType: "WHATSAPP_ORDERING" });

    expect(summary.scenariosScanned).toBe(0);
    expect(summary.proposalsCreated).toBe(0);
  });
});

// ── G. Backfill respects queue cap ────────────────────────────────────────────

describe("G — backfill respects max open proposals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips categories when queue is full and reports reason", async () => {
    const scenarios = [{ ...warnScenario("s1", "UNKNOWN_INTENT"), evaluations: [{ id: "e1" }] }];
    setupDefaults({ pendingCount: 15 });
    prismaMock.agentTrainingScenario.findMany
      .mockResolvedValueOnce(scenarios)
      .mockResolvedValueOnce(scenarios);

    const summary = await backfillProposals({ agentType: "WHATSAPP_ORDERING" });

    expect(summary.proposalsCreated).toBe(0);
    expect(summary.proposalsSkipped[0]?.reason).toContain("Fila cheia");
  });
});

// ── H. No silent failure ──────────────────────────────────────────────────────

describe("H — proposal generation errors are captured, not swallowed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records skip reason when GPT call throws", async () => {
    setupDefaults({ failures: [warnScenario("s1", "UNKNOWN_INTENT")] });
    openaiMock.chat.completions.create.mockRejectedValue(new Error("rate limit"));

    const summary = await processRunForProposals({
      runId: "run-1", agentType: "WHATSAPP_ORDERING",
    });

    expect(summary.proposalsCreated).toBe(0);
    expect(summary.skipped[0]?.category).toBe("UNKNOWN_INTENT");
    expect(summary.skipped[0]?.reason).toContain("Erro na geração");
  });
});

// ── getCoveredFailureCategories unit ─────────────────────────────────────────

describe("getCoveredFailureCategories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty set when no recent proposals", async () => {
    prismaMock.agentImprovementProposal.findMany.mockResolvedValue([]);
    const covered = await getCoveredFailureCategories("WHATSAPP_ORDERING");
    expect(covered.size).toBe(0);
  });

  it("maps proposal scenario ids to their goals", async () => {
    prismaMock.agentImprovementProposal.findMany.mockResolvedValue([
      { sourceScenarioIds: ["s1", "s2"] },
    ]);
    prismaMock.agentTrainingScenario.findMany.mockResolvedValue([
      { goal: "UNKNOWN_INTENT" },
      { goal: "PRICE_LOOKUP" },
    ]);
    const covered = await getCoveredFailureCategories("WHATSAPP_ORDERING");
    expect(covered.has("UNKNOWN_INTENT")).toBe(true);
    expect(covered.has("PRICE_LOOKUP")).toBe(true);
    expect(covered.has("HANDOFF")).toBe(false);
  });
});
