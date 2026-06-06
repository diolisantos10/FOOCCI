/**
 * agentLibraryHelpers — pure, dependency-free helpers + constants for the
 * Agent Library Workbench. No Prisma, no IO — safe to unit test and to import
 * from both server and client code.
 *
 * The Library is the agents' professional FORMATION. It is NEVER read by any
 * runtime (Waiter/CRM/WhatsApp). Copyright-safe: we keep syntheses, not works.
 */

// ── agent ownership ────────────────────────────────────────────────────────────

export interface LibraryAgent {
  slug: string;
  name: string;
}

/** Agents that can own a Library. Extend as new agents come online. */
export const LIBRARY_AGENTS: readonly LibraryAgent[] = [
  { slug: "waiter", name: "Waiter" },
  { slug: "crm", name: "CRM" },
  { slug: "whatsapp", name: "WhatsApp" },
  { slug: "analytics", name: "Analytics" },
];

export function isValidLibraryAgent(slug: string | null | undefined): boolean {
  return !!slug && LIBRARY_AGENTS.some((a) => a.slug === slug);
}

export function libraryAgentName(slug: string): string {
  return LIBRARY_AGENTS.find((a) => a.slug === slug)?.name ?? slug;
}

// ── source types ───────────────────────────────────────────────────────────────

export const SOURCE_TYPES = [
  "BOOK",
  "PDF",
  "ARTICLE",
  "MANUAL",
  "TRAINING",
  "PLAYBOOK",
  "INTERNAL_NOTE",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  BOOK: "Livro",
  PDF: "PDF",
  ARTICLE: "Artigo",
  MANUAL: "Manual",
  TRAINING: "Treinamento",
  PLAYBOOK: "Playbook",
  INTERNAL_NOTE: "Nota interna",
};

export function isValidSourceType(t: string | null | undefined): t is SourceType {
  return !!t && (SOURCE_TYPES as readonly string[]).includes(t);
}

// ── status labels (for the UI) ──────────────────────────────────────────────────

export const EXTRACTION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  EXTRACTING: "Extraindo…",
  EXTRACTED: "Extraído",
  FAILED: "Falhou",
};

export const SOURCE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativa",
  ARCHIVED: "Arquivada",
};

export const TECHNIQUE_STATUS_LABELS: Record<string, string> = {
  EXTRACTED: "Extraída",
  IN_REVIEW: "Em revisão",
  ACTIVE: "Ativa",
  ARCHIVED: "Arquivada",
};

// ── input validation ────────────────────────────────────────────────────────────

/** Max chars of pasted/raw text we ever send to the LLM — copyright + cost guard. */
export const MAX_LLM_INPUT_CHARS = 8000;

/** Clamp free text to a safe length before sending to an LLM. */
export function clampText(text: string, max: number = MAX_LLM_INPUT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export interface SourceInput {
  agentSlug: string;
  title: string;
  author?: string | null;
  sourceType: SourceType;
  category?: string | null;
  description?: string | null;
  rawText?: string | null;
}

export interface ValidationResult<T> {
  ok: boolean;
  errors: string[];
  value?: T;
}

/** Validate + normalize a "new source" payload coming from the API. */
export function validateSourceInput(raw: unknown): ValidationResult<SourceInput> {
  const errors: string[] = [];
  const obj = (raw ?? {}) as Record<string, unknown>;

  const agentSlug = typeof obj.agentSlug === "string" ? obj.agentSlug.trim() : "";
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const sourceTypeRaw = typeof obj.sourceType === "string" ? obj.sourceType.trim() : "";

  if (!isValidLibraryAgent(agentSlug)) errors.push("Agente inválido.");
  if (!title) errors.push("Título é obrigatório.");
  if (title.length > 200) errors.push("Título muito longo (máx. 200).");
  if (!isValidSourceType(sourceTypeRaw)) errors.push("Tipo de fonte inválido.");

  if (errors.length > 0) return { ok: false, errors };

  const str = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length > 0 ? s : null;
  };

  return {
    ok: true,
    errors: [],
    value: {
      agentSlug,
      title,
      author: str(obj.author),
      sourceType: sourceTypeRaw as SourceType,
      category: str(obj.category),
      description: str(obj.description),
      rawText: str(obj.rawText),
    },
  };
}

export interface TechniqueInput {
  techniqueName: string;
  category?: string | null;
  purpose?: string | null;
  principle?: string | null;
  application?: string | null;
  usageRule?: string | null;
  qualityTest?: string | null;
  goodExample?: string | null;
  badExample?: string | null;
  confidence?: number | null;
}

/** Validate + normalize a "new technique" payload (manual or extracted). */
export function validateTechniqueInput(raw: unknown): ValidationResult<TechniqueInput> {
  const errors: string[] = [];
  const obj = (raw ?? {}) as Record<string, unknown>;

  const techniqueName = typeof obj.techniqueName === "string" ? obj.techniqueName.trim() : "";
  if (!techniqueName) errors.push("Nome da técnica é obrigatório.");
  if (techniqueName.length > 200) errors.push("Nome da técnica muito longo (máx. 200).");

  if (errors.length > 0) return { ok: false, errors };

  const str = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length > 0 ? s : null;
  };
  let confidence: number | null = null;
  if (typeof obj.confidence === "number" && Number.isFinite(obj.confidence)) {
    confidence = Math.max(0, Math.min(1, obj.confidence));
  }

  return {
    ok: true,
    errors: [],
    value: {
      techniqueName,
      category: str(obj.category),
      purpose: str(obj.purpose),
      principle: str(obj.principle),
      application: str(obj.application),
      usageRule: str(obj.usageRule),
      qualityTest: str(obj.qualityTest),
      goodExample: str(obj.goodExample),
      badExample: str(obj.badExample),
      confidence,
    },
  };
}

/**
 * Safely parse the LLM extraction JSON into a list of technique inputs.
 * Accepts either { techniques: [...] } or a bare array. Never throws.
 */
export function parseExtractedTechniques(rawJson: string): TechniqueInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.techniques)
      ? ((parsed as Record<string, unknown>).techniques as unknown[])
      : [];

  const out: TechniqueInput[] = [];
  for (const item of arr) {
    const v = validateTechniqueInput(item);
    if (v.ok && v.value) out.push(v.value);
  }
  return out;
}

// ── upload (v1.1 — Upload First) ─────────────────────────────────────────────────

/** File kinds we can extract text from in this phase. */
export type UploadKind = "pdf" | "text";

export const ACCEPTED_UPLOAD_EXTENSIONS = [".pdf", ".txt", ".md"] as const;

/** Max accepted upload size. Larger files are rejected before parsing. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

/** Max chars of extracted text we PERSIST (copyright guard — never the full work). */
export const MAX_STORED_TEXT_CHARS = 20000;

/** Max PDF pages parsed in this phase (large-file safety — sample the start). */
export const MAX_PDF_PAGES = 15;

/** Detect what kind of file this is from name + mime. Null = unsupported. */
export function detectUploadKind(fileName: string, mimeType: string): UploadKind | null {
  const name = (fileName || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    mime.startsWith("text/") ||
    mime === "application/octet-stream" || // some browsers send this for .md
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown")
  ) {
    return "text";
  }
  return null;
}

/** Human title fallback derived from a file name (strip path + extension). */
export function deriveTitleFromFileName(fileName: string): string {
  const base = (fileName || "").split(/[\\/]/).pop() ?? "";
  const noExt = base.replace(/\.[a-z0-9]+$/i, "");
  const cleaned = noExt.replace(/[_-]+/g, " ").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : "Documento sem título";
}

/** Cap extracted text to the storage limit; report whether it was truncated. */
export function capStoredText(text: string): { text: string; truncated: boolean } {
  const t = text ?? "";
  if (t.length <= MAX_STORED_TEXT_CHARS) return { text: t, truncated: false };
  return { text: t.slice(0, MAX_STORED_TEXT_CHARS), truncated: true };
}

// ── error classification + friendly messages ─────────────────────────────────────

/** True when an error means the Library tables are not migrated yet. */
export function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "P2021") return true; // Prisma: table does not exist
  const m = (e.message ?? "").toLowerCase();
  return m.includes("does not exist in the current database") || (m.includes("relation") && m.includes("does not exist"));
}

// ── upload response contract (source-first flow) ─────────────────────────────────

/** Stages of the upload pipeline — included in every upload response as `stage`. */
export type UploadStage =
  | "init"
  | "auth"
  | "formData"
  | "fileValidation"
  | "migration"
  | "dbCreateSource"
  | "pdfParse"
  | "aiExtraction"
  | "created"
  | "done";

export interface UploadResponseBody {
  ok: boolean;
  stage: UploadStage;
  message: string;
  /** Present once the source row exists — even on partial failure. */
  sourceId?: string;
  created?: number;
}

/** Build the canonical upload JSON body (always carries ok + stage + message). */
export function buildUploadResponse(p: {
  ok: boolean;
  stage: UploadStage;
  message: string;
  sourceId?: string | null;
  created?: number;
}): UploadResponseBody {
  const body: UploadResponseBody = { ok: p.ok, stage: p.stage, message: p.message };
  if (p.sourceId) body.sourceId = p.sourceId;
  if (typeof p.created === "number") body.created = p.created;
  return body;
}

/**
 * Safe last-resort response for the upload route's OUTER catch.
 *
 * Uses ONLY the two values that are guaranteed to exist (top-level `stage` and
 * `sourceId`) — never any local object — so the catch itself can never throw a
 * ReferenceError. If the source was already created, it is a partial success
 * (HTTP 200, keep + select it in the UI); otherwise it is fatal (HTTP 500).
 */
export function buildOuterCatchResponse(
  stage: UploadStage,
  sourceId?: string | null,
): { status: number; body: UploadResponseBody } {
  if (sourceId) {
    return {
      status: 200,
      body: buildUploadResponse({
        ok: false,
        stage,
        sourceId,
        message: "Fonte criada, mas ocorreu erro interno no processamento. Você pode tentar extrair novamente.",
      }),
    };
  }
  return {
    status: 500,
    body: buildUploadResponse({
      ok: false,
      stage,
      message: "Erro interno antes de criar a fonte.",
    }),
  };
}

/**
 * How the UI should treat an upload response:
 *   • "success" — green, fully done
 *   • "partial" — yellow warning, source created but a later stage failed (select it)
 *   • "fatal"   — red, nothing was created (auth/type/db/migration)
 */
export type UploadOutcome = "success" | "partial" | "fatal";

export function classifyUploadOutcome(body: { ok?: unknown; sourceId?: unknown }): UploadOutcome {
  if (body?.ok === true) return "success";
  if (typeof body?.sourceId === "string" && body.sourceId.length > 0) return "partial";
  return "fatal";
}

/**
 * Map an upload API outcome to a specific, friendly Portuguese message.
 * Prefers the server-provided error; otherwise derives from the HTTP status.
 */
export function friendlyUploadMessage(status: number, serverError?: string | null): string {
  if (serverError && serverError.trim()) return serverError.trim();
  if (status === 0) return "Não foi possível falar com o servidor. Verifique a conexão.";
  if (status === 401) return "Sessão admin expirada. Faça login novamente.";
  if (status === 403) return "Endpoint desabilitado (ADMIN_SECRET ausente no servidor).";
  if (status === 413) return "Arquivo grande demais para o servidor.";
  if (status === 400) return "Requisição inválida no upload.";
  if (status === 503) return "Migration da Agent Library ainda não aplicada.";
  if (status >= 500) return "Erro interno ao processar o upload. Veja os logs do servidor.";
  return "Falha no upload.";
}
