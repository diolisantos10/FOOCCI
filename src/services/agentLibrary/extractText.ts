/**
 * extractText — server-only text extraction for Library uploads.
 *
 * Supports PDF (via pdf-parse, page-limited), TXT and MD. Large-file safe: PDFs
 * are parsed for at most MAX_PDF_PAGES pages and ALL extracted text is capped to
 * MAX_STORED_TEXT_CHARS before being persisted — we never store/serve the full
 * work. The original binary is NOT persisted (kept private by not storing it).
 *
 * Node runtime only (pdf-parse / pdfjs). Never import from client code.
 */

import {
  detectUploadKind,
  capStoredText,
  MAX_PDF_PAGES,
  type UploadKind,
} from "./agentLibraryHelpers";

export interface ExtractResult {
  kind: UploadKind;
  /** Capped, persist-safe text (synthesis input — never the full work). */
  text: string;
  truncated: boolean;
  /** Pages parsed for PDFs (sample window), when known. */
  pagesParsed?: number;
  totalPages?: number;
  note?: string;
}

// Minimal local typing for pdf-parse v2 (avoids the v1 @types/pdf-parse shape).
interface PdfTextResult {
  text: string;
  total: number;
}
interface PdfParseInstance {
  getText(params?: { first?: number }): Promise<PdfTextResult>;
  destroy(): Promise<void>;
}
interface PdfParseCtor {
  new (opts: { data: Uint8Array }): PdfParseInstance;
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  // pdf-parse is externalized (next.config.js) and loaded at runtime. Resolve the
  // PDFParse constructor whether it is a named export or under `default` (CJS interop).
  const mod = (await import("pdf-parse")) as unknown as {
    PDFParse?: PdfParseCtor;
    default?: { PDFParse?: PdfParseCtor };
  };
  const PdfParse = mod.PDFParse ?? mod.default?.PDFParse;
  if (typeof PdfParse !== "function") {
    throw new Error("Leitor de PDF indisponível no servidor (pdf-parse não carregou).");
  }
  const parser = new PdfParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({ first: MAX_PDF_PAGES });
    const total = result.total ?? 0;
    const pagesParsed = total > 0 ? Math.min(total, MAX_PDF_PAGES) : undefined;
    const capped = capStoredText(result.text ?? "");
    const sampled = total > MAX_PDF_PAGES;
    return {
      kind: "pdf",
      text: capped.text,
      truncated: capped.truncated || sampled,
      pagesParsed,
      totalPages: total > 0 ? total : undefined,
      note: sampled
        ? `PDF grande: foram lidas as primeiras ${MAX_PDF_PAGES} de ${total} páginas (amostra). Para o livro completo, processar por trechos numa fase futura.`
        : capped.truncated
          ? "Texto extraído foi limitado ao máximo de armazenamento (amostra inicial)."
          : undefined,
    };
  } finally {
    await parser.destroy().catch(() => { /* non-fatal */ });
  }
}

function extractPlainText(buffer: Buffer): ExtractResult {
  const raw = buffer.toString("utf-8");
  const capped = capStoredText(raw);
  return {
    kind: "text",
    text: capped.text,
    truncated: capped.truncated,
    note: capped.truncated ? "Conteúdo longo: armazenada apenas a parte inicial (amostra)." : undefined,
  };
}

/**
 * Extract persist-safe text from an uploaded file buffer.
 * Throws a clear Error for unsupported types or unreadable content.
 */
export async function extractTextFromUpload(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ExtractResult> {
  const kind = detectUploadKind(fileName, mimeType);
  if (!kind) {
    throw new Error("Tipo de arquivo não suportado. Use PDF, TXT ou MD.");
  }

  let result: ExtractResult;
  if (kind === "pdf") {
    result = await extractPdf(buffer);
  } else {
    result = extractPlainText(buffer);
  }

  if (!result.text.trim()) {
    throw new Error(
      "Não foi possível extrair texto deste arquivo (pode ser um PDF digitalizado/imagem). Cole uma síntese manualmente.",
    );
  }
  return result;
}
