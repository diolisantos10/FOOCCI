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

/**
 * Polyfill the browser globals pdfjs (used by pdf-parse) expects in Node.
 *
 * pdfjs v5 references `DOMMatrix` (and friends) as globals but, in Node, only
 * wires `@napi-rs/canvas` for createCanvas — it never sets these globals, so
 * text extraction throws "DOMMatrix is not defined". We assign the spec-
 * compliant implementations from `@napi-rs/canvas` (already a dependency) onto
 * globalThis, only when missing. Scoped to the parser — not a broad app-wide
 * polyfill — and run once.
 */
let pdfGlobalsReady = false;
async function ensurePdfGlobals(): Promise<void> {
  if (pdfGlobalsReady) return;
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") {
    const canvas = (await import("@napi-rs/canvas")) as unknown as Record<string, unknown>;
    for (const name of ["DOMMatrix", "DOMPoint", "Path2D", "ImageData"]) {
      if (typeof g[name] === "undefined" && canvas[name]) g[name] = canvas[name];
    }
  }
  pdfGlobalsReady = true;
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  // Ensure DOMMatrix & co. exist before pdfjs runs (Node has no browser globals).
  try {
    await ensurePdfGlobals();
  } catch {
    /* fall through — extractPdf maps a missing-DOMMatrix failure to a clear message */
  }

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If DOMMatrix (or another browser global) is still missing, surface a clear,
    // specific message instead of the raw ReferenceError.
    if (/DOMMatrix|Path2D|ImageData|is not defined/i.test(msg)) {
      throw new Error("O parser de PDF precisa do modo Node/legacy. Extração não concluída. Use TXT/MD ou cole uma síntese.");
    }
    throw err instanceof Error ? err : new Error(msg);
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
      kind === "pdf"
        ? "PDF sem texto extraível. Use PDF com texto selecionável ou cole uma síntese."
        : "Não foi possível extrair texto deste arquivo. Cole uma síntese manualmente.",
    );
  }
  return result;
}
