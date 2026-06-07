/**
 * Real (unmocked) regression tests for the upload pipeline.
 *
 * Only the DB service is mocked — extractTextFromUpload runs for REAL. This
 * exercises the exact pre-source code path that previously threw
 * `ReferenceError: File is not defined` (now duck-typed via asUploadedBlob),
 * proving the flow is ReferenceError-free for real Blob inputs.
 */

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

import { runUploadFlow } from "./uploadFlow";
import { extractTextFromUpload } from "./extractText";
import { AgentLibraryService } from "./AgentLibraryService";

const svc = vi.mocked(AgentLibraryService);

beforeEach(() => {
  vi.clearAllMocks();
  svc.createSourceFromUpload.mockResolvedValue({ id: "src_real" } as never);
  svc.saveOriginalFile.mockResolvedValue({ storageKey: "db:file_real" } as never);
  svc.loadOriginalFile.mockResolvedValue(null as never);
  svc.setRawText.mockResolvedValue({} as never);
  svc.setExtractionStatus.mockResolvedValue({} as never);
});

describe("extractTextFromUpload — real, no mocks", () => {
  it("extracts TXT content", async () => {
    const buf = Buffer.from("Olá mundo — notas de vendas SPIN.", "utf-8");
    const r = await extractTextFromUpload(buf, "notas.txt", "text/plain");
    expect(r.kind).toBe("text");
    expect(r.text).toContain("SPIN");
  });

  it("extracts MD content", async () => {
    const buf = Buffer.from("# Título\n\n- técnica 1\n- técnica 2", "utf-8");
    const r = await extractTextFromUpload(buf, "manual.md", "text/markdown");
    expect(r.kind).toBe("text");
    expect(r.text).toContain("técnica");
  });

  it("rejects an unsupported type with a clear error (not a ReferenceError)", async () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    await expect(extractTextFromUpload(buf, "pic.png", "image/png")).rejects.toThrow(/não suportado/i);
  });
});

describe("runUploadFlow — real extractText, only DB mocked", () => {
  it("creates a source from a real TXT Blob without any ReferenceError", async () => {
    const fd = new FormData();
    fd.append("agentSlug", "waiter");
    fd.append("extract", "0");
    fd.append("file", new Blob(["conteúdo real de teste"], { type: "text/plain" }), "notes.txt");

    const { status, body } = await runUploadFlow(fd);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stage).toBe("created");
    expect(body.sourceId).toBe("src_real");
    // real extracted text was persisted
    expect(svc.setRawText).toHaveBeenCalledWith("src_real", expect.stringContaining("conteúdo real"));
  });
});
