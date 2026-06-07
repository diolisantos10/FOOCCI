/**
 * PDF parser tests: DOMMatrix polyfill + friendly messages.
 *
 * pdf-parse is mocked so we can drive getText behavior. ensurePdfGlobals runs
 * for real (imports @napi-rs/canvas), so a successful parse proves DOMMatrix is
 * polyfilled onto globalThis in Node.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

let getTextImpl: () => Promise<{ text: string; total: number }>;

vi.mock("pdf-parse", () => {
  class PDFParse {
    async getText() {
      return getTextImpl();
    }
    async destroy() {}
  }
  return { PDFParse };
});

import { extractTextFromUpload } from "./extractText";

beforeEach(() => {
  getTextImpl = async () => ({ text: "conteúdo extraído do pdf", total: 2 });
});

describe("extractTextFromUpload — PDF parser", () => {
  it("polyfills DOMMatrix and extracts text from a (mocked) PDF", async () => {
    const r = await extractTextFromUpload(Buffer.from("%PDF-1.4"), "book.pdf", "application/pdf");
    expect(r.kind).toBe("pdf");
    expect(r.text).toContain("conteúdo extraído");
    // ensurePdfGlobals must have defined DOMMatrix on globalThis (Node has none).
    expect(typeof (globalThis as Record<string, unknown>).DOMMatrix).toBe("function");
  });

  it("maps a 'DOMMatrix is not defined' parser error to a clear message", async () => {
    getTextImpl = async () => {
      throw new Error("DOMMatrix is not defined");
    };
    await expect(extractTextFromUpload(Buffer.from("%PDF"), "book.pdf", "application/pdf")).rejects.toThrow(
      /modo Node\/legacy/i,
    );
  });

  it("returns a friendly 'no selectable text' message for scanned PDFs", async () => {
    getTextImpl = async () => ({ text: "", total: 3 });
    await expect(extractTextFromUpload(Buffer.from("%PDF"), "scan.pdf", "application/pdf")).rejects.toThrow(
      /PDF sem texto extraível/i,
    );
  });
});
