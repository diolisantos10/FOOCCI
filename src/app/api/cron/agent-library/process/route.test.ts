import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  agentLibraryExtractionJob: { findMany: vi.fn() },
  agentLibrarySourceChunk: { count: vi.fn() },
}));
const svc = vi.hoisted(() => ({ processNextPendingChunk: vi.fn(), consolidateJob: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/services/agentLibrary/deepExtraction/DeepExtractionService", () => ({ DeepExtractionService: svc }));
vi.mock("@/services/agentLibrary/deepExtraction/realChunkExtractor", () => ({ realChunkExtractor: vi.fn() }));

import { POST } from "./route";

function req(headers: Record<string, string> = {}, body = "{}") {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, text: async () => body } as unknown as Parameters<typeof POST>[0];
}

const OLD = process.env.CRON_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  db.agentLibraryExtractionJob.findMany.mockResolvedValue([]);
  db.agentLibrarySourceChunk.count.mockResolvedValue(0);
  svc.processNextPendingChunk.mockResolvedValue({ processed: false });
  svc.consolidateJob.mockResolvedValue({ techniquesCreated: 0 });
});
afterEach(() => { process.env.CRON_SECRET = OLD; });

describe("POST /api/cron/agent-library/process", () => {
  it("requires Bearer auth — 401 without it", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(svc.processNextPendingChunk).not.toHaveBeenCalled();
  });

  it("503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ authorization: "Bearer x" }));
    expect(res.status).toBe(503);
  });

  it("processes pending chunks up to the budget, then consolidates ready jobs", async () => {
    // 3 chunks available, then exhausted
    svc.processNextPendingChunk
      .mockResolvedValueOnce({ processed: true, jobId: "j1" })
      .mockResolvedValueOnce({ processed: true, jobId: "j1" })
      .mockResolvedValueOnce({ processed: true, jobId: "j1" })
      .mockResolvedValue({ processed: false });
    db.agentLibraryExtractionJob.findMany.mockResolvedValue([{ id: "j1" }]);
    svc.consolidateJob.mockResolvedValue({ techniquesCreated: 4 });
    db.agentLibrarySourceChunk.count.mockResolvedValue(0);

    const res = await POST(req({ authorization: "Bearer s3cr3t" }, JSON.stringify({ max: 10 })));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(3);
    expect(body.consolidatedJobs).toBe(1);
    expect(body.techniquesCreated).toBe(4);
    expect(body.remainingPending).toBe(0);
  });

  it("clamps the chunk budget (max 20)", async () => {
    svc.processNextPendingChunk.mockResolvedValue({ processed: true, jobId: "j1" });
    await POST(req({ authorization: "Bearer s3cr3t" }, JSON.stringify({ max: 9999 })));
    expect(svc.processNextPendingChunk.mock.calls.length).toBe(20);
  });
});
