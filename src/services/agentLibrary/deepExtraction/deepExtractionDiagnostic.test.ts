import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  agentLibraryExtractionJob: { findUnique: vi.fn() },
  agentLibraryChunkTechniqueCandidate: { count: vi.fn() },
}));
const lib = vi.hoisted(() => ({ createSource: vi.fn(), getSourceWithTechniques: vi.fn(), deleteSource: vi.fn() }));
const deep = vi.hoisted(() => ({ scheduleJob: vi.fn(), processNextPendingChunk: vi.fn(), consolidateJob: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../AgentLibraryService", () => ({ AgentLibraryService: lib }));
vi.mock("./DeepExtractionService", () => ({ DeepExtractionService: deep }));
vi.mock("./realChunkExtractor", () => ({ realChunkExtractor: vi.fn() }));

import { runDeepExtractionDiagnostic } from "./deepExtractionDiagnostic";

const goodExtractor = vi.fn().mockResolvedValue([
  { techniqueName: "Diagnóstico de intenção", application: "Identifica a ocasião antes de sugerir.", usageRule: "Máx. 1 pergunta." },
]);

beforeEach(() => {
  vi.clearAllMocks();
  lib.createSource.mockResolvedValue({ id: "s1" });
  lib.deleteSource.mockResolvedValue(true);
  deep.scheduleJob.mockResolvedValue({ jobId: "job1", totalChunks: 2, truncated: false });
  deep.processNextPendingChunk.mockResolvedValueOnce({ processed: true }).mockResolvedValueOnce({ processed: true }).mockResolvedValue({ processed: false });
  prismaMock.agentLibraryExtractionJob.findUnique.mockResolvedValue({ id: "job1", sourceId: "s1" });
  prismaMock.agentLibraryChunkTechniqueCandidate.count.mockResolvedValue(4);
});

describe("runDeepExtractionDiagnostic", () => {
  it("(7) PASS when consolidation produces techniques with useful fields, and cleans up", async () => {
    deep.consolidateJob.mockResolvedValue({ techniquesCreated: 3 });
    lib.getSourceWithTechniques.mockResolvedValue({ techniques: [{ techniqueName: "X", application: "como usar" }, { techniqueName: "Y", usageRule: "regra" }] });

    const r = await runDeepExtractionDiagnostic(goodExtractor);

    expect(r.status).toBe("PASS");
    expect(r.techniquesCreated).toBe(3);
    expect(r.candidatesCreated).toBe(4);
    expect(r.chunksProcessed).toBe(2);
    expect(r.runtimeTouched).toBe(false);
    expect(r.sourceCleanedUp).toBe(true);
    expect(lib.deleteSource).toHaveBeenCalledWith("s1");
  });

  it("(6) FAIL when techniquesCreated = 0 (loses at consolidate), still cleans up", async () => {
    deep.consolidateJob.mockResolvedValue({ techniquesCreated: 0 });

    const r = await runDeepExtractionDiagnostic(goodExtractor);

    expect(r.status).toBe("FAIL");
    expect(r.stage).toBe("consolidate");
    expect(r.message).toContain("Candidatas (4)");
    expect(lib.deleteSource).toHaveBeenCalledWith("s1");
    expect(r.sourceCleanedUp).toBe(true);
  });

  it("FAIL when techniques exist but lack useful fields", async () => {
    deep.consolidateJob.mockResolvedValue({ techniquesCreated: 2 });
    lib.getSourceWithTechniques.mockResolvedValue({ techniques: [{ techniqueName: "X" }, { techniqueName: "Y" }] });
    const r = await runDeepExtractionDiagnostic(goodExtractor);
    expect(r.status).toBe("FAIL");
    expect(r.stage).toBe("validate");
  });

  it("FAIL controlled when chunking yields nothing", async () => {
    deep.scheduleJob.mockResolvedValue({ jobId: "job1", totalChunks: 0, truncated: false });
    const r = await runDeepExtractionDiagnostic(goodExtractor);
    expect(r.status).toBe("FAIL");
    expect(r.stage).toBe("chunking");
  });

  it("exposes self-authored dense content (no copyrighted text)", async () => {
    const { DEEP_DIAGNOSTIC_TEXT } = await import("./deepExtractionDiagnostic");
    expect(DEEP_DIAGNOSTIC_TEXT).toContain("venda consultiva");
    expect(DEEP_DIAGNOSTIC_TEXT.length).toBeGreaterThan(800);
  });
});
