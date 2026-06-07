/**
 * uploadFlow — the source-first Library upload pipeline, extracted from the API
 * route so it is unit-testable (the route path contains "(area)", which vite's
 * resolver can't import in tests).
 *
 * Stages (resilient):
 *   A. validate input (agent + file/text + supported type)   → fatal, no source
 *   B. CREATE THE SOURCE FIRST (metadata + pasted text)      → fatal if DB fails
 *   C. parse the file text; on failure mark source FAILED    → partial (sourceId)
 *   D. run AI extraction; on failure mark source FAILED      → partial (sourceId)
 *   E. success → source EXTRACTED + techniques
 *
 * The outer catch uses ONLY top-level `stage` + `sourceId` (never a local
 * object) so it can never throw a ReferenceError. We never reference the global
 * `File` (undefined on Node 18) — uploaded files are duck-typed as Blob-like.
 */

import { AgentLibraryService } from "./AgentLibraryService";
import { extractTextFromUpload } from "./extractText";
import {
  validateSourceInput,
  deriveTitleFromFileName,
  detectUploadKind,
  isValidLibraryAgent,
  isValidSourceType,
  isMissingTableError,
  buildUploadResponse,
  buildOuterCatchResponse,
  MAX_UPLOAD_BYTES,
  type UploadResponseBody,
  type UploadStage,
} from "./agentLibraryHelpers";

export interface UploadFlowResult {
  status: number;
  body: UploadResponseBody;
}

/** Minimal Blob-like shape for an uploaded file (avoids the global `File`). */
interface UploadedBlob {
  name?: string;
  type?: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Duck-typed file detection — never uses `instanceof File` (not global on Node 18). */
function asUploadedBlob(v: FormDataEntryValue | null): UploadedBlob | null {
  if (
    v &&
    typeof v === "object" &&
    typeof (v as { arrayBuffer?: unknown }).arrayBuffer === "function" &&
    typeof (v as { size?: unknown }).size === "number"
  ) {
    return v as unknown as UploadedBlob;
  }
  return null;
}

function ok(status: number, p: { ok: boolean; stage: UploadStage; message: string; sourceId?: string | null; created?: number }): UploadFlowResult {
  return { status, body: buildUploadResponse(p) };
}

/** Safe server log — no file content, no secrets. */
function log(stage: string, extra?: Record<string, unknown>) {
  console.info("[library/upload]", JSON.stringify({ stage, ...extra }));
}

/**
 * Run the upload pipeline against a parsed FormData. Auth + formData parsing are
 * the route's responsibility; this owns validation → create → parse → AI.
 */
export async function runUploadFlow(form: FormData): Promise<UploadFlowResult> {
  let stage: UploadStage = "init";
  let sourceId: string | undefined;

  try {
    const str = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v.trim() : "";
    };

    // ── A. validate input ─────────────────────────────────────────────────────
    stage = "fileValidation";
    const agentSlug = str("agentSlug");
    if (!isValidLibraryAgent(agentSlug)) {
      return ok(400, { ok: false, stage, message: "Agente inválido." });
    }

    const blob = asUploadedBlob(form.get("file"));
    const hasFile = !!blob && blob.size > 0;
    const pastedText = str("rawText");

    let fileName: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | null = null;

    if (hasFile) {
      fileName = blob!.name || "arquivo";
      mimeType = blob!.type || "application/octet-stream";
      fileSize = blob!.size;
      log("file-received", { fileSize, mimeType, ext: fileName.split(".").pop() });

      if (blob!.size > MAX_UPLOAD_BYTES) {
        return ok(400, { ok: false, stage, message: "Arquivo grande demais para processar nesta fase (máx. 15 MB)." });
      }
      if (!detectUploadKind(fileName, mimeType)) {
        return ok(400, { ok: false, stage, message: "Tipo de arquivo não suportado. Use PDF, TXT ou MD." });
      }
    } else if (!pastedText) {
      return ok(400, { ok: false, stage, message: "Envie um arquivo (PDF/TXT/MD) ou cole o conteúdo." });
    }

    const kind = hasFile ? detectUploadKind(fileName!, mimeType!) : null;
    const sourceTypeRaw = str("sourceType");
    const sourceType = isValidSourceType(sourceTypeRaw)
      ? sourceTypeRaw
      : kind === "pdf"
        ? "PDF"
        : "INTERNAL_NOTE";
    const title = str("title") || (hasFile ? deriveTitleFromFileName(fileName!) : "");

    const parsed = validateSourceInput({
      agentSlug,
      title,
      author: str("author"),
      sourceType,
      category: str("category"),
      description: str("description"),
      rawText: pastedText,
    });
    if (!parsed.ok || !parsed.value) {
      return ok(400, { ok: false, stage, message: parsed.errors.join(" ") || "Dados da fonte inválidos." });
    }

    // ── B. create the source FIRST (survives later failures) ───────────────────
    stage = "dbCreateSource";
    try {
      const source = await AgentLibraryService.createSourceFromUpload({
        input: parsed.value,
        extractedText: null,
        fileName,
        mimeType,
        fileSize,
      });
      sourceId = source.id;
      log("source-created", { sourceId });
    } catch (err) {
      if (isMissingTableError(err)) {
        log("db-missing-table");
        return ok(503, { ok: false, stage: "migration", message: "Migration da Agent Library ainda não aplicada. Rode prisma migrate deploy." });
      }
      log("create-source-failed", { errName: err instanceof Error ? err.name : "Error" });
      return ok(500, { ok: false, stage, message: "Falha ao criar a fonte no banco." });
    }

    // ── B2. store the original file PRIVATELY first (so retry can re-read it) ────
    if (hasFile) {
      stage = "storeFile";
      try {
        const buffer = Buffer.from(await blob!.arrayBuffer());
        const { storageKey } = await AgentLibraryService.saveOriginalFile(sourceId, {
          fileName: fileName!,
          mimeType: mimeType!,
          buffer,
        });
        log("file-stored", { sourceId, storageKey, fileSize });
      } catch (err) {
        // Non-fatal: the source still exists; retry just won't have a file yet.
        log("file-store-failed", { sourceId, errName: err instanceof Error ? err.name : "Error" });
      }
    }

    // ── C. parse file text (source + file already saved) ───────────────────────
    let textForAI = pastedText;
    let extractNote: string | undefined;
    if (hasFile) {
      stage = "pdfParse";
      try {
        // Re-parse from the stored file so this never depends on the request body.
        const stored = await AgentLibraryService.loadOriginalFile(sourceId);
        const buffer = stored ? stored.buffer : Buffer.from(await blob!.arrayBuffer());
        const result = await extractTextFromUpload(buffer, fileName!, mimeType!);
        textForAI = result.text;
        extractNote = result.note;
        await AgentLibraryService.setRawText(sourceId, result.text);
        log("text-extracted", { sourceId, pages: result.totalPages, parsed: result.pagesParsed, chars: result.text.length });
      } catch (err) {
        log("pdf-parse-failed", { sourceId, errName: err instanceof Error ? err.name : "Error" });
        await AgentLibraryService.setExtractionStatus(sourceId, "FAILED").catch(() => {});
        const detail = err instanceof Error ? err.message : "";
        return ok(200, { ok: false, stage, sourceId, message: `Fonte criada e arquivo salvo, mas não foi possível extrair texto do arquivo. ${detail}`.trim() });
      }
    }

    // ── D. AI extraction (optional; source already saved) ──────────────────────
    const wantExtract = str("extract") === "1";
    if (wantExtract) {
      stage = "aiExtraction";
      if (!textForAI.trim()) {
        await AgentLibraryService.setExtractionStatus(sourceId, "FAILED").catch(() => {});
        return ok(200, { ok: false, stage, sourceId, message: "Fonte criada, mas não há texto para extrair. Adicione técnicas manualmente." });
      }
      try {
        const r = await AgentLibraryService.extractTechniques(sourceId);
        log("extraction-done", { sourceId, created: r.created });
        const baseMsg = r.created > 0 ? `${r.created} técnica(s) extraída(s).` : "Nenhuma técnica foi extraída — revise o conteúdo ou adicione manualmente.";
        return ok(200, { ok: r.created > 0, stage: r.created > 0 ? "done" : "aiExtraction", sourceId, created: r.created, message: (extractNote ? `${extractNote} ` : "") + baseMsg });
      } catch (err) {
        log("extraction-failed", { sourceId, errName: err instanceof Error ? err.name : "Error" });
        const detail = err instanceof Error ? err.message : "";
        return ok(200, { ok: false, stage, sourceId, message: `Fonte criada, mas a extração por IA falhou. Você pode tentar novamente. ${detail}`.trim() });
      }
    }

    // ── E. created (no extraction requested) ───────────────────────────────────
    stage = "created";
    return ok(200, { ok: true, stage, sourceId, message: (extractNote ? `${extractNote} ` : "") + "Fonte criada." });
  } catch (err) {
    // Last-resort guard: uses ONLY top-level `stage` + `sourceId` — never throws.
    console.error("[library/upload] unhandled", err instanceof Error ? `${err.name}: ${err.message}` : "Error", JSON.stringify({ stage, sourceId }));
    return buildOuterCatchResponse(stage, sourceId);
  }
}
