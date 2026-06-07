/**
 * Verifies the friendly message for a PDF with no selectable text (e.g. scanned
 * image PDF). pdf-parse is mocked to return empty text.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("pdf-parse", () => {
  class PDFParse {
    async getText() {
      return { text: "", total: 3 };
    }
    async destroy() {}
  }
  return { PDFParse };
});

import { extractTextFromUpload } from "./extractText";

describe("extractTextFromUpload — scanned/image PDF", () => {
  it("returns a friendly 'no selectable text' message (not a crash)", async () => {
    const buf = Buffer.from("%PDF-1.4 fake");
    await expect(extractTextFromUpload(buf, "scan.pdf", "application/pdf")).rejects.toThrow(
      /PDF sem texto extraível/i,
    );
  });
});
