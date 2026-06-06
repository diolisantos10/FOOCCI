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
