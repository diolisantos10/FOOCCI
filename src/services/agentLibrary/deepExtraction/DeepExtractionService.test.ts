import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  agentLibrarySource: { findUnique: vi.fn(), update: vi.fn() },
  agentLibraryExtractionJob: { deleteMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  agentLibrarySourceChunk: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  agentLibraryChunkTechniqueCandidate: { createMany: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  agentLibraryTechnique: { createMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { DeepExtractionService, type ChunkExtractor } from "./DeepExtractionService";

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of Object.values(db)) for (const f of Object.values(m)) (f as ReturnType<typeof vi.fn>).mockResolvedValue({} as never);
});

describe("DeepExtractionService.scheduleJob", () => {
  it("(2)(3) chunks the full text and creates a job + chunks in PROCESSING_CHUNKS", async () => {
    db.agentLibrarySource.findUnique.mockResolvedValue({ id: "s1", agentSlug: "waiter", category: null, rawText: "short stored" });
    db.agentLibraryExtractionJob.create.mockResolvedValue({ id: "job1" });
    const fullText = Array.from({ length: 20 }, () => "Parágrafo de venda consultiva. ".repeat(60)).join("\n\n");

    const r = await DeepExtractionService.scheduleJob("s1", fullText);

    expect(r.jobId).toBe("job1");
    expect(r.totalChunks).toBeGreaterThan(1);
    const data = db.agentLibraryExtractionJob.create.mock.calls[0][0].data;
    expect(data.stage).toBe("PROCESSING_CHUNKS");
    expect(data.totalChunks).toBe(r.totalChunks);
    expect(data.chunks.create).toHaveLength(r.totalChunks);
    expect(data.chunks.create[0]).toMatchObject({ chunkIndex: 0, status: "PENDING" });
    expect(db.agentLibrarySource.update).toHaveBeenCalledWith(expect.objectContaining({ data: { extractionStatus: "PROCESSING_CHUNKS" } }));
  });
});

describe("DeepExtractionService.processNextPendingChunk", () => {
  const chunk = {
    id: "c1", jobId: "job1", sourceId: "s1", chunkIndex: 0, totalChunks: 3, text: "trecho", retries: 0,
    job: { agentSlug: "waiter", source: { title: "T", category: null } },
  };

  it("(4) extracts candidates, saves them, marks the chunk DONE and advances counters", async () => {
    db.agentLibrarySourceChunk.findFirst.mockResolvedValue(chunk);
    db.agentLibraryExtractionJob.findUnique.mockResolvedValue({ stage: "PROCESSING_CHUNKS", processedChunks: 1, totalChunks: 3, sourceId: "s1" });
    const extractor: ChunkExtractor = vi.fn().mockResolvedValue([
      { techniqueName: "Pergunta de intenção", application: "...", usageRule: "1 pergunta" },
    ]);

    const r = await DeepExtractionService.processNextPendingChunk(extractor);

    expect(r.processed).toBe(true);
    expect(db.agentLibraryChunkTechniqueCandidate.createMany).toHaveBeenCalledTimes(1);
    expect(db.agentLibrarySourceChunk.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "DONE", techniquesExtracted: 1 } }));
    expect(db.agentLibraryExtractionJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: { processedChunks: { increment: 1 }, techniquesFound: { increment: 1 } } }));
  });

  it("(6)(7) a failing chunk retries without breaking the source", async () => {
    db.agentLibrarySourceChunk.findFirst.mockResolvedValue({ ...chunk, retries: 0 });
    db.agentLibraryExtractionJob.findUnique.mockResolvedValue({ stage: "PROCESSING_CHUNKS", processedChunks: 0, totalChunks: 3, sourceId: "s1" });
    const extractor: ChunkExtractor = vi.fn().mockRejectedValue(new Error("OpenAI down"));

    await DeepExtractionService.processNextPendingChunk(extractor);

    // first failure → back to PENDING (retry), not FAILED
    expect(db.agentLibrarySourceChunk.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", retries: 1 }) }));
  });

  it("returns processed=false when there is no pending chunk", async () => {
    db.agentLibrarySourceChunk.findFirst.mockResolvedValue(null);
    expect((await DeepExtractionService.processNextPendingChunk(vi.fn())).processed).toBe(false);
  });

  it("flips the job to CONSOLIDATING once all chunks are processed", async () => {
    db.agentLibrarySourceChunk.findFirst.mockResolvedValue(chunk);
    db.agentLibraryExtractionJob.findUnique.mockResolvedValue({ stage: "PROCESSING_CHUNKS", processedChunks: 3, totalChunks: 3, sourceId: "s1" });
    await DeepExtractionService.processNextPendingChunk(vi.fn().mockResolvedValue([]));
    expect(db.agentLibraryExtractionJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: { stage: "CONSOLIDATING" } }));
  });
});

describe("DeepExtractionService.consolidateJob", () => {
  it("(8) dedupes candidates into final techniques and marks the source EXTRACTED", async () => {
    db.agentLibraryExtractionJob.findUnique.mockResolvedValue({ id: "job1", sourceId: "s1", agentSlug: "waiter", failedChunks: 0 });
    db.agentLibraryChunkTechniqueCandidate.findMany.mockResolvedValue([
      { techniqueName: "Pergunta de intenção", category: "Atendimento", application: "Identifica ocasião antes de sugerir.", usageRule: "Máximo 1 pergunta.", confidence: 0.6 },
      { techniqueName: "pergunta de INTENÇÃO", category: "Atendimento", application: "Identifica ocasião antes de sugerir.", usageRule: "Máximo 1 pergunta.", confidence: 0.9 }, // dup
      { techniqueName: "Faça perguntas" }, // generic → dropped
    ]);

    const r = await DeepExtractionService.consolidateJob("job1");

    expect(r.techniquesCreated).toBe(1); // dup collapsed, generic dropped
    expect(db.agentLibraryTechnique.createMany).toHaveBeenCalledTimes(1);
    expect(db.agentLibrarySource.update).toHaveBeenCalledWith(expect.objectContaining({ data: { extractionStatus: "EXTRACTED" } }));
    expect(db.agentLibraryChunkTechniqueCandidate.deleteMany).toHaveBeenCalledWith({ where: { jobId: "job1" } });
  });

  it("(5)(9) candidates that all filter out → PARTIAL + lastError (never silent EXTRACTED)", async () => {
    db.agentLibraryExtractionJob.findUnique.mockResolvedValue({ id: "job1", sourceId: "s1", agentSlug: "waiter", failedChunks: 0 });
    db.agentLibraryChunkTechniqueCandidate.findMany.mockResolvedValue([
      { techniqueName: "Faça perguntas" },
      { techniqueName: "Pergunte" },
    ]);
    const r = await DeepExtractionService.consolidateJob("job1");
    expect(r.techniquesCreated).toBe(0);
    expect(db.agentLibraryTechnique.createMany).not.toHaveBeenCalled();
    expect(db.agentLibrarySource.update).toHaveBeenCalledWith(expect.objectContaining({ data: { extractionStatus: "PARTIAL" } }));
    const jobUpdate = db.agentLibraryExtractionJob.update.mock.calls.find((c) => (c[0] as { data: { lastError?: string } }).data.lastError);
    expect((jobUpdate![0] as { data: { lastError: string } }).data.lastError).toContain("nenhuma técnica final");
  });

  it("no candidates at all → FAILED with lastError", async () => {
    db.agentLibraryExtractionJob.findUnique.mockResolvedValue({ id: "job1", sourceId: "s1", agentSlug: "waiter", failedChunks: 0 });
    db.agentLibraryChunkTechniqueCandidate.findMany.mockResolvedValue([]);
    await DeepExtractionService.consolidateJob("job1");
    expect(db.agentLibrarySource.update).toHaveBeenCalledWith(expect.objectContaining({ data: { extractionStatus: "FAILED" } }));
  });

  it("marks PARTIAL when some chunks failed", async () => {
    db.agentLibraryExtractionJob.findUnique.mockResolvedValue({ id: "job1", sourceId: "s1", agentSlug: "waiter", failedChunks: 2 });
    db.agentLibraryChunkTechniqueCandidate.findMany.mockResolvedValue([
      { techniqueName: "Redução de fricção real", application: "x", usageRule: "y", confidence: 0.7 },
    ]);
    await DeepExtractionService.consolidateJob("job1");
    expect(db.agentLibrarySource.update).toHaveBeenCalledWith(expect.objectContaining({ data: { extractionStatus: "PARTIAL" } }));
  });
});
