import { describe, it, expect, vi } from "vitest";
import { resolveTextForExtraction, NO_TEXT_NO_FILE_MESSAGE, type StoredFile } from "./extractionText";

describe("resolveTextForExtraction — retry text source", () => {
  it("uses rawText when present and never loads the file", async () => {
    const loadFile = vi.fn<[], Promise<StoredFile | null>>();
    const parse = vi.fn();
    const r = await resolveTextForExtraction({ rawText: "  notas existentes  ", loadFile, parse });
    expect(r.text).toBe("notas existentes");
    expect(r.fromFile).toBe(false);
    expect(loadFile).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
  });

  it("re-parses the stored file when rawText is empty", async () => {
    const loadFile = vi.fn(async () => ({ buffer: Buffer.from("pdf"), fileName: "b.pdf", mimeType: "application/pdf" }));
    const parse = vi.fn(async () => ({ text: "texto vindo do arquivo" }));
    const r = await resolveTextForExtraction({ rawText: "", loadFile, parse });
    expect(loadFile).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(r.text).toBe("texto vindo do arquivo");
    expect(r.fromFile).toBe(true);
  });

  it("throws a clear error when there is neither text nor a stored file", async () => {
    const loadFile = vi.fn(async () => null);
    const parse = vi.fn();
    await expect(resolveTextForExtraction({ rawText: null, loadFile, parse })).rejects.toThrow(NO_TEXT_NO_FILE_MESSAGE);
    expect(parse).not.toHaveBeenCalled();
  });

  it("throws when the stored file yields no extractable text", async () => {
    const loadFile = vi.fn(async () => ({ buffer: Buffer.from(""), fileName: "scan.pdf", mimeType: "application/pdf" }));
    const parse = vi.fn(async () => ({ text: "   " }));
    await expect(resolveTextForExtraction({ rawText: "", loadFile, parse })).rejects.toThrow(NO_TEXT_NO_FILE_MESSAGE);
  });
});
