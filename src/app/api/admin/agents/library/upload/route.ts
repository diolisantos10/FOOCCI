/**
 * POST /api/admin/agents/library/upload — Upload First flow.
 *
 * Multipart form-data. Primary field: `file` (PDF/TXT/MD). Server extracts text
 * (page-limited, capped), creates the source with metadata + synthesis, and —
 * when `extract=1` — runs AI technique extraction. The original binary is NOT
 * persisted (kept private). Never stores/serves the full work.
 *
 * Robustness: the WHOLE handler is wrapped so every failure returns a specific
 * JSON error (never an unhandled 500 / generic "Falha no upload"). Safe logs
 * only (stage + sizes + error name) — never file content or secrets.
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
  MAX_UPLOAD_BYTES,
} from "@/services/agentLibrary/agentLibraryHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Safe server log — no file content, no secrets. */
function log(stage: string, extra?: Record<string, unknown>) {
  console.info("[library/upload]", JSON.stringify({ stage, ...extra }));
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ADMIN_SECRET) {
      return fail("Endpoint desabilitado (ADMIN_SECRET ausente no servidor).", 403);
    }
    if (!checkAdminRequest(req)) {
      return fail("Sessão admin expirada. Faça login novamente.", 401);
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail("Envio inválido (esperado multipart/form-data).", 400);
    }

    const str = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v.trim() : "";
    };

    const agentSlug = str("agentSlug");
    if (!isValidLibraryAgent(agentSlug)) return fail("Agente inválido.", 400);

    const file = form.get("file");
    const hasFile = file instanceof File && file.size > 0;

    // ── extract text from the file (if any) ────────────────────────────────────
    let extractedText: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | null = null;
    let extractNote: string | undefined;

    if (hasFile) {
      const f = file as File;
      fileName = f.name;
      mimeType = f.type || "application/octet-stream";
      fileSize = f.size;
      log("file-received", { fileSize, mimeType, ext: fileName.split(".").pop() });

      if (f.size > MAX_UPLOAD_BYTES) {
        return fail("PDF grande demais para processar nesta fase (máx. 15 MB).", 400);
      }
      if (!detectUploadKind(fileName, mimeType)) {
        return fail("Tipo de arquivo não suportado. Use PDF, TXT ou MD.", 400);
      }

      try {
        const buffer = Buffer.from(await f.arrayBuffer());
        const result = await extractTextFromUpload(buffer, fileName, mimeType);
        extractedText = result.text;
        extractNote = result.note;
        log("text-extracted", { pages: result.totalPages, parsed: result.pagesParsed, chars: result.text.length });
      } catch (err) {
        const name = err instanceof Error ? err.name : "Error";
        const message = err instanceof Error ? err.message : "Falha ao ler o arquivo.";
        log("extract-text-failed", { errName: name });
        return fail(`Não foi possível extrair texto deste arquivo. ${message}`, 400);
      }
    }

    // ── build + validate the source payload ────────────────────────────────────
    const sourceTypeRaw = str("sourceType");
    const kind = hasFile ? detectUploadKind(fileName!, mimeType!) : null;
    const sourceType = isValidSourceType(sourceTypeRaw)
      ? sourceTypeRaw
      : kind === "pdf"
        ? "PDF"
        : "INTERNAL_NOTE";

    const title = str("title") || (hasFile ? deriveTitleFromFileName(fileName!) : "");
    const pastedText = str("rawText");

    if (!hasFile && !pastedText) {
      return fail("Envie um arquivo (PDF/TXT/MD) ou cole o conteúdo.", 400);
    }

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
      return fail(parsed.errors.join(" ") || "Dados da fonte inválidos.", 400);
    }

    // ── create the source ──────────────────────────────────────────────────────
    let source;
    try {
      source = await AgentLibraryService.createSourceFromUpload({
        input: parsed.value,
        extractedText,
        fileName,
        mimeType,
        fileSize,
      });
      log("source-created", { sourceId: source.id });
    } catch (err) {
      if (isMissingTableError(err)) {
        log("db-missing-table");
        return fail("Migration da Agent Library ainda não aplicada. Rode a migration add_agent_library.", 503);
      }
      const name = err instanceof Error ? err.name : "Error";
      log("create-source-failed", { errName: name });
      return fail("Falha ao criar a fonte no banco.", 500);
    }

    // ── optional AI extraction (never loses the upload) ─────────────────────────
    const wantExtract = str("extract") === "1";
    let created = 0;
    let extractError: string | undefined;
    if (wantExtract) {
      try {
        const r = await AgentLibraryService.extractTechniques(source.id);
        created = r.created;
        log("extraction-done", { sourceId: source.id, created });
      } catch (err) {
        extractError = err instanceof Error ? err.message : "Falha na extração por IA.";
        log("extraction-failed", { sourceId: source.id });
      }
    }

    return NextResponse.json({
      ok: true,
      sourceId: source.id,
      extracted: wantExtract,
      created,
      note: extractNote,
      extractError,
    });
  } catch (err) {
    // Last-resort guard: ALWAYS return JSON, never an unhandled 500.
    const name = err instanceof Error ? err.name : "Error";
    console.error("[library/upload] unhandled", name);
    if (isMissingTableError(err)) {
      return fail("Migration da Agent Library ainda não aplicada. Rode a migration add_agent_library.", 503);
    }
    return fail("Erro interno ao processar o upload. Veja os logs do servidor.", 500);
  }
}
