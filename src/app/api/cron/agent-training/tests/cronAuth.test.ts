/**
 * Agent Training Cron — focused safety tests
 *
 * A. Cron endpoints require CRON_SECRET (401 without it)
 * B. Cron skips when continuousTraining disabled (not 401, returns skipped=true)
 * C. Admin trigger endpoints require admin session (401 without it)
 * D. Mining skips when useRealConversationMining=false
 * E. Cron proceeds (no skip) when correctly configured
 *
 * No DB, no WhatsApp, no orders, no Pix.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock prisma ────────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  agentTrainingConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  agentTrainingRun:    {
    findFirst: vi.fn(),
    create:    vi.fn(async () => ({ id: "run-1" })),
    update:    vi.fn(),
    count:     vi.fn(),
  },
  agentTrainingScenario: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  agentImprovementProposal: { count: vi.fn() },
  agentBrainVersion:   { count: vi.fn() },
  restaurant:          { findFirst: vi.fn() },
  $transaction:        vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const adminAuthMock = vi.hoisted(() => ({ checkAdminRequest: vi.fn(() => false) }));
vi.mock("@/lib/admin-auth", () => adminAuthMock);

vi.mock("@/services/agent-training/AgentTrainingScenarioGenerator", () => ({
  generateBatch: vi.fn(() => []),
}));
vi.mock("@/services/agent-training/AgentTrainingRunnerService", () => ({
  createRun:   vi.fn(async () => ({ id: "run-1", status: "RUNNING" })),
  runBatch:    vi.fn(async () => undefined),
  finalizeRun: vi.fn(async () => ({
    id: "run-1", totalScenarios: 0, passCount: 0, warnCount: 0, failCount: 0, score: 100,
  })),
  failRun: vi.fn(async () => undefined),
}));
vi.mock("@/services/agent-training/AgentTrainingEvaluatorService", () => ({
  evaluateRun: vi.fn(async () => undefined),
}));
vi.mock("@/services/agent-training/AgentTrainingImprovementService", () => ({
  processRunForProposals: vi.fn(async () => undefined),
}));
vi.mock("@/services/agent-training/AgentTrainingConversationMiner", () => ({
  mineRealConversations: vi.fn(async () => []),
}));

import { POST as smallBatchPOST } from "../run-small-batch/route";
import { POST as mineConvPOST }   from "../mine-real-conversations/route";
import { POST as nightlyPOST }    from "../run-nightly/route";
import { POST as nightlyAdminPOST } from "@/app/api/admin/training/trigger/nightly/route";
import { POST as mineAdminPOST }    from "@/app/api/admin/training/trigger/mine/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_SECRET = "test-cron-secret-xyz";

function cronReq(secret?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new NextRequest("http://localhost/api/cron/agent-training/test", {
    method: "POST",
    headers,
  });
}

function adminReq(): NextRequest {
  return new NextRequest("http://localhost/api/admin/training/trigger/test", { method: "POST" });
}

function mockRestaurant() {
  prismaMock.restaurant.findFirst.mockResolvedValue({
    id: "rest-1", slug: "sushi-cazza", name: "Sushi Cazza",
  });
}

function mockConfig(overrides: Record<string, unknown> = {}) {
  prismaMock.agentTrainingConfig.findUnique.mockResolvedValue({
    agentType:                "WHATSAPP_ORDERING",
    enableContinuousTraining: true,
    maxScenariosPerHour:      20,
    useRealConversationMining: true,
    useAiGeneratedScenarios:  true,
    autoCreateProposals:      true,
    autoApplySandbox:         false,
    autoApplyProduction:      false,
    ...overrides,
  });
}

// ── A. CRON_SECRET guard ──────────────────────────────────────────────────────

describe("A — cron endpoints require CRON_SECRET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it("run-small-batch returns 401 without Authorization header", async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const res = await smallBatchPOST(cronReq());
    expect(res.status).toBe(401);
  });

  it("run-small-batch returns 401 with wrong secret", async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const res = await smallBatchPOST(cronReq("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("run-small-batch returns 401 when CRON_SECRET env var is not set", async () => {
    const res = await smallBatchPOST(cronReq(VALID_SECRET));
    expect(res.status).toBe(401);
  });

  it("mine-real-conversations returns 401 without Authorization header", async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const res = await mineConvPOST(cronReq());
    expect(res.status).toBe(401);
  });

  it("run-nightly returns 401 without Authorization header", async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const res = await nightlyPOST(cronReq());
    expect(res.status).toBe(401);
  });
});

// ── B. Continuous training pause check ───────────────────────────────────────

describe("B — run-small-batch respects enableContinuousTraining=false", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = VALID_SECRET;
  });

  it("returns skipped=true when enableContinuousTraining is false", async () => {
    mockConfig({ enableContinuousTraining: false });
    const res  = await smallBatchPOST(cronReq(VALID_SECRET));
    const body = await res.json() as { ok: boolean; skipped?: boolean; reason?: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(true);
    expect(body.reason).toContain("disabled");
  });

  it("does NOT skip when enableContinuousTraining is true", async () => {
    mockConfig({ enableContinuousTraining: true });
    mockRestaurant();
    const res  = await smallBatchPOST(cronReq(VALID_SECRET));
    const body = await res.json() as { ok: boolean; skipped?: boolean };
    // Should not have returned the skip response
    expect(body.skipped).toBeUndefined();
  });
});

// ── C. Admin trigger endpoints require admin auth ─────────────────────────────

describe("C — admin trigger endpoints require admin session (401 without it)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAuthMock.checkAdminRequest.mockReturnValue(false);
  });

  it("POST /api/admin/training/trigger/nightly returns 401 without admin session", async () => {
    const res = await nightlyAdminPOST(adminReq());
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/training/trigger/mine returns 401 without admin session", async () => {
    const res = await mineAdminPOST(adminReq());
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/training/trigger/nightly returns 202 with valid admin session", async () => {
    adminAuthMock.checkAdminRequest.mockReturnValue(true);
    mockRestaurant();
    const res = await nightlyAdminPOST(adminReq());
    expect(res.status).toBe(202);
    const body = await res.json() as { ok: boolean; status: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("RUNNING");
  });

  it("POST /api/admin/training/trigger/mine returns 202 with valid admin session", async () => {
    adminAuthMock.checkAdminRequest.mockReturnValue(true);
    mockConfig();
    mockRestaurant();
    const res = await mineAdminPOST(adminReq());
    expect(res.status).toBe(202);
    const body = await res.json() as { ok: boolean; status: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("RUNNING");
  });
});

// ── D. Mining skips when useRealConversationMining=false ─────────────────────

describe("D — mine-real-conversations respects config flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = VALID_SECRET;
  });

  it("returns skipped=true when useRealConversationMining is false", async () => {
    mockConfig({ useRealConversationMining: false });
    const res  = await mineConvPOST(cronReq(VALID_SECRET));
    const body = await res.json() as { ok: boolean; skipped?: boolean; reason?: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(true);
    expect(body.reason).toContain("disabled");
  });

  it("does NOT skip when useRealConversationMining is true", async () => {
    mockConfig({ useRealConversationMining: true });
    mockRestaurant();
    const res  = await mineConvPOST(cronReq(VALID_SECRET));
    const body = await res.json() as { ok: boolean; skipped?: boolean };
    expect(body.skipped).toBeUndefined();
  });
});
