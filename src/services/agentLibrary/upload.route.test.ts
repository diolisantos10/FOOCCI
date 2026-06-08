/**
 * Tests for the source-first Library upload pipeline (runUploadFlow) and the
 * ReferenceError fix:
 *   • TXT upload creates the source (stage "created", sourceId present)
 *   • invalid file type returns a stage, no source
 *   • no file / no text returns a stage, no source
 *   • parsing failing AFTER the source returns the sourceId (partial)
 *   • AI extraction failing AFTER the source returns the sourceId (partial)
 *
 * DB, OpenAI and pdf parsing are mocked — this exercises control flow + the JSON
 * contract, not real IO.
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

vi.mock("./extractText", () => ({
  extractTextFromUpload: vi.fn(),
}));

import { runUploadFlow } from "./uploadFlow";
import { AgentLibraryService } from "./AgentLibraryService";
import { extractTextFromUpload } from "./extractText";

const svc = vi.mocked(AgentLibraryService);
const parse = vi.mocked(extractTextFromUpload);

beforeEach(() => {
  vi.clearAllMocks();
  svc.createSourceFromUpload.mockResolvedValue({ id: "src_1" } as never);
  svc.saveOriginalFile.mockResolvedValue({ storageKey: "db:file_1" } as never);
  svc.loadOriginalFile.mockResolvedValue(null as never); // fall back to request blob in parse step
  svc.setRawText.mockResolvedValue({} as never);
  svc.setExtractionStatus.mockResolvedValue({} as never);
});

describe("runUploadFlow — source-first", () => {
  it("creates the source from a simple TXT upload (stage=created)", async () => {
    parse.mockResolvedValue({ kind: "text", text: "hello world", truncated: false } as never);
    const fd = new FormData();
    fd.append("agentSlug", "waiter");
    fd.append("extract", "0");
    fd.append("file", new Blob(["hello world"], { type: "text/plain" }), "notes.txt");

    const { status, body } = await runUploadFlow(fd);

    expect(svc.createSourceFromUpload).toHaveBeenCalledTimes(1);
    // the original file is stored privately (storageKey)
    expect(svc.saveOriginalFile).toHaveBeenCalledTimes(1);
    expect(svc.saveOriginalFile).toHaveBeenCalledWith("src_1", expect.objectContaining({ fileName: "notes.txt", mimeType: "text/plain" }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stage).toBe("created");
    expect(body.sourceId).toBe("src_1");
  });

  it("rejects an invalid file type with a stage and creates no source", async () => {
    const fd = new FormData();
    fd.append("agentSlug", "waiter");
    fd.append("file", new Blob(["x"], { type: "image/png" }), "pic.png");

    const { status, body } = await runUploadFlow(fd);

    expect(svc.createSourceFromUpload).not.toHaveBeenCalled();
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.stage).toBe("fileValidation");
    expect("sourceId" in body).toBe(false);
  });

  it("requires a file or pasted text (stage=fileValidation)", async () => {
    const fd = new FormData();
    fd.append("agentSlug", "waiter");

    const { body } = await runUploadFlow(fd);
    expect(body.ok).toBe(false);
    expect(body.stage).toBe("fileValidation");
  });

  it("auto-extracts when no extract flag is sent (happy path needs no manual button)", async () => {
    parse.mockResolvedValue({ kind: "text", text: "ancoragem de preço e escassez", truncated: false } as never);
    svc.extractTechniques.mockResolvedValue({ created: 4 } as never);
    const fd = new FormData();
    fd.append("agentSlug", "waiter");
    // NOTE: no `extract` field at all → extraction must run automatically
    fd.append("file", new Blob(["ancoragem"], { type: "text/plain" }), "notes.txt");

    const { status, body } = await runUploadFlow(fd);

    expect(svc.extractTechniques).toHaveBeenCalledWith("src_1");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stage).toBe("done");
    expect(body.created).toBe(4);
  });

  it("auto-extracts pasted text too (no file, no extract flag)", async () => {
    svc.extractTechniques.mockResolvedValue({ created: 3 } as never);
    const fd = new FormData();
    fd.append("agentSlug", "waiter");
    fd.append("title", "Notas de vendas");
    fd.append("rawText", "técnica de upsell consultivo e ancoragem");

    const { body } = await runUploadFlow(fd);
    expect(svc.extractTechniques).toHaveBeenCalledWith("src_1");
    expect(body.stage).toBe("done");
  });

  it("opts out of extraction with extract=0 ('Só salvar') — no AI call", async () => {
    parse.mockResolvedValue({ kind: "text", text: "hello", truncated: false } as never);
    const fd = new FormData();
    fd.append("agentSlug", "waiter");
    fd.append("extract", "0");
    fd.append("file", new Blob(["hello"], { type: "text/plain" }), "notes.txt");

    const { body } = await runUploadFlow(fd);
    expect(svc.extractTechniques).not.toHaveBeenCalled();
    expect(body.stage).toBe("created");
    expect(body.ok).toBe(true);
  });

  it("does not auto-extract (nor FAIL) when there is no text — just created", async () => {
    parse.mockResolvedValue({ kind: "text", text: "   ", truncated: false } as never);
    const fd = new FormData();
    fd.append("agentSlug", "waiter");
    fd.append("file", new Blob([" "], { type: "text/plain" }), "empty.txt");

    const { body } = await runUploadFlow(fd);
    expect(svc.extractTechniques).not.toHaveBeenCalled();
    expect(svc.setExtractionStatus).not.toHaveBeenCalledWith("src_1", "FAILED");
    expect(body.stage).toBe("created");
    expect(body.ok).toBe(true);
  });

  it("keeps the source when parsing fails AFTER creation (partial, sourceId)", async () => {
    parse.mockRejectedValue(new Error("DOMMatrix is not defined"));
    const fd = new FormData();
    fd.append("agentSlug", "waiter");
    fd.append("extract", "1");
    fd.append("file", new Blob(["%PDF-fake"], { type: "application/pdf" }), "book.pdf");

    const { status, body } = await runUploadFlow(fd);

    expect(svc.createSourceFromUpload).toHaveBeenCalledTimes(1);
    // file was stored BEFORE parsing, so the retry has something to re-read
    expect(svc.saveOriginalFile).toHaveBeenCalledTimes(1);
    expect(svc.setExtractionStatus).toHaveBeenCalledWith("src_1", "FAILED");
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.stage).toBe("pdfParse");
    expect(body.sourceId).toBe("src_1");
  });

  it("keeps the source when AI extraction fails AFTER creation (partial, sourceId)", async () => {
    parse.mockResolvedValue({ kind: "text", text: "some notes", truncated: false } as never);
    svc.extractTechniques.mockRejectedValue(new Error("OpenAI down"));
    const fd = new FormData();
    fd.append("agentSlug", "waiter");
    fd.append("extract", "1");
    fd.append("file", new Blob(["some notes"], { type: "text/plain" }), "notes.txt");

    const { status, body } = await runUploadFlow(fd);

    expect(svc.extractTechniques).toHaveBeenCalledWith("src_1");
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.stage).toBe("aiExtraction");
    expect(body.sourceId).toBe("src_1");
  });
});
