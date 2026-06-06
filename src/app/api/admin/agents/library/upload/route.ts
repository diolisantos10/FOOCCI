/**
 * POST /api/admin/agents/library/upload — Upload First flow.
 *
 * Multipart form-data. Primary field: `file` (PDF/TXT/MD). Server extracts text
 * (page-limited, capped), creates the source with metadata + synthesis, and —
 * when `extract=1` — runs AI technique extraction. The original binary is NOT
 * persisted (kept private). Never stores/serves the full work.
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
  MAX_UPLOAD_BYTES,
} from "@/services/agentLibrary/agentLibraryHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Envio inválido (esperado multipart/form-data)." }, { status: 400 });
  }

  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };

  const agentSlug = str("agentSlug");
  if (!isValidLibraryAgent(agentSlug)) {
    return NextResponse.json({ ok: false, error: "Agente inválido." }, { status: 400 });
  }

  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;

  // ── extract text from the file (if any) ──────────────────────────────────────
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

    if (f.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "Arquivo muito grande (máx. 15 MB)." }, { status: 400 });
    }
    if (!detectUploadKind(fileName, mimeType)) {
      return NextResponse.json({ ok: false, error: "Tipo de arquivo não suportado. Use PDF, TXT ou MD." }, { status: 400 });
    }

    try {
      const buffer = Buffer.from(await f.arrayBuffer());
      const result = await extractTextFromUpload(buffer, fileName, mimeType);
      extractedText = result.text;
      extractNote = result.note;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao ler o arquivo.";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  }

  // ── build + validate the source payload ──────────────────────────────────────
  const sourceTypeRaw = str("sourceType");
  const kind = hasFile ? detectUploadKind(fileName!, mimeType!) : null;
  const sourceType = isValidSourceType(sourceTypeRaw)
    ? sourceTypeRaw
    : kind === "pdf"
      ? "PDF"
      : "INTERNAL_NOTE";

  const title = str("title") || (hasFile ? deriveTitleFromFileName(fileName!) : "");
  const pastedText = str("rawText");

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
    return NextResponse.json({ ok: false, error: parsed.errors.join(" ") }, { status: 400 });
  }
  if (!hasFile && !pastedText) {
    return NextResponse.json(
      { ok: false, error: "Envie um arquivo (PDF/TXT/MD) ou cole o conteúdo." },
      { status: 400 },
    );
  }

  // ── create the source ────────────────────────────────────────────────────────
  let source;
  try {
    source = await AgentLibraryService.createSourceFromUpload({
      input: parsed.value,
      extractedText,
      fileName,
      mimeType,
      fileSize,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao criar a fonte.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  // ── optional AI extraction ───────────────────────────────────────────────────
  const wantExtract = str("extract") === "1";
  let created = 0;
  let extractError: string | undefined;
  if (wantExtract) {
    try {
      const r = await AgentLibraryService.extractTechniques(source.id);
      created = r.created;
    } catch (err) {
      extractError = err instanceof Error ? err.message : "Falha na extração.";
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
}
