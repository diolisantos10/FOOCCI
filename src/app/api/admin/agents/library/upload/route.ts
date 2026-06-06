/**
 * POST /api/admin/agents/library/upload — Upload First flow (source-first).
 *
 * Multipart form-data. Primary field: `file` (PDF/TXT/MD).
 *
 * Order of operations (resilient):
 *   A. validate input (agent + file/text + supported type)   → fatal, no source
 *   B. CREATE THE SOURCE FIRST (metadata + pasted text)      → fatal if DB fails
 *   C. parse the file text; on failure mark source FAILED    → partial (sourceId)
 *   D. run AI extraction; on failure mark source FAILED      → partial (sourceId)
 *   E. success → source EXTRACTED + techniques
 *
 * The source survives parsing/AI failures so the admin can retry. The original
 * binary is NOT persisted (kept private). Every response is JSON and carries a
 * `stage`. Safe logs only (stage + sizes + error name) — never content/secrets.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 * Node runtime (pdf-parse). Does NOT touch any agent runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { AgentLibraryService } from "@/services/agentLibrary/AgentLibraryService";
import { extractTextFromUpload } from "@/services/agentLibrary/extractText";
import {
  validateSourceInput,
  deriveTitleFromFileName,
  detectUploadKind,
  isValidLibraryAgent,
  isValidSourceType,
  isMissingTableError,
  buildUploadResponse,
  MAX_UPLOAD_BYTES,
  type UploadStage,
} from "@/services/agentLibrary/agentLibraryHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Always-JSON response helper carrying ok + stage + message (+ sourceId/created). */
function respond(
  status: number,
  p: { ok: boolean; stage: UploadStage; message: string; sourceId?: string | null; created?: number },
) {
  return NextResponse.json(buildUploadResponse(p), { status });
}

/** Safe server log — no file content, no secrets. */
function log(stage: string, extra?: Record<string, unknown>) {
  console.info("[library/upload]", JSON.stringify({ stage, ...extra }));
}

export async function POST(req: NextRequest) {
  // Tracks the created source so the outer guard can still return its id.
  let sourceId: string | null = null;

  try {
    // ── auth ──────────────────────────────────────────────────────────────────
    if (!process.env.ADMIN_SECRET) {
      return respond(403, { ok: false, stage: "auth", message: "Endpoint desabilitado (ADMIN_SECRET ausente no servidor)." });
    }
    if (!checkAdminRequest(req)) {
      return respond(401, { ok: false, stage: "auth", message: "Sessão admin expirada. Faça login novamente." });
    }

    // ── formData ──────────────────────────────────────────────────────────────
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return respond(400, { ok: false, stage: "formData", message: "Envio inválido (esperado multipart/form-data)." });
    }
    const str = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v.trim() : "";
    };

    // ── A. validate input ───────────────────────────────────────────────────────
    const agentSlug = str("agentSlug");
    if (!isValidLibraryAgent(agentSlug)) {
      return respond(400, { ok: false, stage: "fileValidation", message: "Agente inválido." });
    }

    const file = form.get("file");
    const hasFile = file instanceof File && file.size > 0;
    const pastedText = str("rawText");

    let fileName: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | null = null;

    if (hasFile) {
      const f = file as File;
      fileName = f.name;
      mimeType = f.type || "application/octet-stream";
      fileSize = f.size;
      log("file-received", { fileSize, mimeType, ext: fileName.split(".").pop() });

      if (f.size > MAX_UPLOAD_BYTES) {
        return respond(400, { ok: false, stage: "fileValidation", message: "Arquivo grande demais para processar nesta fase (máx. 15 MB)." });
      }
      if (!detectUploadKind(fileName, mimeType)) {
        return respond(400, { ok: false, stage: "fileValidation", message: "Tipo de arquivo não suportado. Use PDF, TXT ou MD." });
      }
    } else if (!pastedText) {
      return respond(400, { ok: false, stage: "fileValidation", message: "Envie um arquivo (PDF/TXT/MD) ou cole o conteúdo." });
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
      return respond(400, { ok: false, stage: "fileValidation", message: parsed.errors.join(" ") || "Dados da fonte inválidos." });
    }

    // ── B. create the source FIRST (survives later failures) ────────────────────
    try {
      const source = await AgentLibraryService.createSourceFromUpload({
        input: parsed.value,
        extractedText: null, // text (if any) is applied after parsing, below
        fileName,
        mimeType,
        fileSize,
      });
      sourceId = source.id;
      log("source-created", { sourceId });
    } catch (err) {
      if (isMissingTableError(err)) {
        log("db-missing-table");
        return respond(503, { ok: false, stage: "migration", message: "Migration da Agent Library ainda não aplicada. Rode prisma migrate deploy." });
      }
      log("create-source-failed", { errName: err instanceof Error ? err.name : "Error" });
      return respond(500, { ok: false, stage: "dbCreateSource", message: "Falha ao criar a fonte no banco." });
    }

    // ── C. parse file text (source already saved) ───────────────────────────────
    let textForAI = pastedText;
    let extractNote: string | undefined;
    if (hasFile) {
      try {
        const buffer = Buffer.from(await (file as File).arrayBuffer());
        const result = await extractTextFromUpload(buffer, fileName!, mimeType!);
        textForAI = result.text;
        extractNote = result.note;
        await AgentLibraryService.setRawText(sourceId, result.text);
        log("text-extracted", { sourceId, pages: result.totalPages, parsed: result.pagesParsed, chars: result.text.length });
      } catch (err) {
        log("pdf-parse-failed", { sourceId, errName: err instanceof Error ? err.name : "Error" });
        await AgentLibraryService.setExtractionStatus(sourceId, "FAILED").catch(() => {});
        const detail = err instanceof Error ? err.message : "";
        return respond(200, {
          ok: false,
          stage: "pdfParse",
          sourceId,
          message: `Fonte criada, mas não foi possível extrair texto do arquivo. ${detail}`.trim(),
        });
      }
    }

    // ── D. AI extraction (optional; source already saved) ───────────────────────
    const wantExtract = str("extract") === "1";
    if (wantExtract) {
      if (!textForAI.trim()) {
        await AgentLibraryService.setExtractionStatus(sourceId, "FAILED").catch(() => {});
        return respond(200, { ok: false, stage: "aiExtraction", sourceId, message: "Fonte criada, mas não há texto para extrair. Adicione técnicas manualmente." });
      }
      try {
        const r = await AgentLibraryService.extractTechniques(sourceId);
        log("extraction-done", { sourceId, created: r.created });
        const baseMsg = r.created > 0 ? `${r.created} técnica(s) extraída(s).` : "Nenhuma técnica foi extraída — revise o conteúdo ou adicione manualmente.";
        return respond(200, { ok: r.created > 0, stage: r.created > 0 ? "done" : "aiExtraction", sourceId, created: r.created, message: (extractNote ? `${extractNote} ` : "") + baseMsg });
      } catch (err) {
        log("extraction-failed", { sourceId, errName: err instanceof Error ? err.name : "Error" });
        const detail = err instanceof Error ? err.message : "";
        return respond(200, { ok: false, stage: "aiExtraction", sourceId, message: `Fonte criada, mas a extração por IA falhou. Você pode tentar novamente. ${detail}`.trim() });
      }
    }

    // ── E. created (no extraction requested) ────────────────────────────────────
    return respond(200, { ok: true, stage: "created", sourceId, message: (extractNote ? `${extractNote} ` : "") + "Fonte criada." });
  } catch (err) {
    // Last-resort guard: ALWAYS return JSON, preserving sourceId if it exists.
    console.error("[library/upload] unhandled", err instanceof Error ? err.name : "Error");
    if (isMissingTableError(err)) {
      return respond(503, { ok: false, stage: "migration", sourceId, message: "Migration da Agent Library ainda não aplicada. Rode prisma migrate deploy." });
    }
    return respond(500, {
      ok: false,
      stage: sourceId ? "pdfParse" : "dbCreateSource",
      sourceId,
      message: sourceId
        ? "Fonte criada, mas o processamento falhou. Você pode tentar extrair novamente."
        : "Erro interno ao processar o upload. Veja os logs do servidor.",
    });
  }
}
