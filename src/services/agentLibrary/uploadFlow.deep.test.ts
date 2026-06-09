import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./AgentLibraryService", () => ({
  AgentLibraryService: {
    createSourceFromUpload: vi.fn(),
    saveOriginalFile: vi.fn(),
    loadOriginalFile: vi.fn(),
    setRawText: vi.fn(),
    setExtractionStatus: vi.fn(),
    extractTechniques: vi.fn(),
  },
}));
vi.mock("./extractText", () => ({ extractTextFromUpload: vi.fn() }));
vi.mock("./deepExtraction/DeepExtractionService", () => ({
  DeepExtractionService: { scheduleJob: vi.fn() },
}));

import { runUploadFlow } from "./uploadFlow";
import { AgentLibraryService } from "./AgentLibraryService";
import { DeepExtractionService } from "./deepExtraction/DeepExtractionService";

const svc = vi.mocked(AgentLibraryService);
const deep = vi.mocked(DeepExtractionService);

beforeEach(() => {
  vi.clearAllMocks();
  svc.createSourceFromUpload.mockResolvedValue({ id: "s1" } as never);
  svc.setRawText.mockResolvedValue({} as never);
});

describe("runUploadFlow — deep chunked scheduling", () => {
  it("(1) large pasted text → schedules deep extraction (no manual button), responds fast", async () => {
    deep.scheduleJob.mockResolvedValue({ jobId: "job1", totalChunks: 12, truncated: false } as never);
    const big = "Treinamento de venda consultiva. ".repeat(800); // > DEEP_THRESHOLD_CHARS

    const fd = new FormData();
    fd.append("agentSlug", "waiter");
    fd.append("title", "Livro grande");
    fd.append("sourceType", "INTERNAL_NOTE");
    fd.append("rawText", big);

    const { status, body } = await runUploadFlow(fd);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stage).toBe("scheduled");
    expect(body.message).toContain("Extração profunda agendada");
    expect(deep.scheduleJob).toHaveBeenCalledTimes(1);
    expect(deep.scheduleJob.mock.calls[0][0]).toBe("s1");
    expect(String(deep.scheduleJob.mock.calls[0][1])).toContain("venda consultiva");
    // the single-shot quick extractor is NOT used for large material
    expect(svc.extractTechniques).not.toHaveBeenCalled();
  });

  it("small text keeps the quick single-shot path (deep not scheduled)", async () => {
    svc.extractTechniques.mockResolvedValue({ created: 3 } as never);
    const fd = new FormData();
    fd.append("agentSlug", "waiter");
    fd.append("title", "Nota curta");
    fd.append("sourceType", "INTERNAL_NOTE");
    fd.append("rawText", "Treinamento de venda consultiva: diagnosticar intenção e sugerir até 3 opções.");

    const { body } = await runUploadFlow(fd);

    expect(body.stage).toBe("done");
    expect(deep.scheduleJob).not.toHaveBeenCalled();
    expect(svc.extractTechniques).toHaveBeenCalledWith("s1");
  });
});
