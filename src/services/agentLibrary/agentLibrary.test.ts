import { describe, it, expect } from "vitest";
import {
  isValidLibraryAgent,
  libraryAgentName,
  isValidSourceType,
  clampText,
  MAX_LLM_INPUT_CHARS,
  validateSourceInput,
  validateTechniqueInput,
  parseExtractedTechniques,
  LIBRARY_AGENTS,
  detectUploadKind,
  deriveTitleFromFileName,
  capStoredText,
  MAX_STORED_TEXT_CHARS,
  isMissingTableError,
  friendlyUploadMessage,
  classifyUploadOutcome,
  buildUploadResponse,
  buildOuterCatchResponse,
} from "./agentLibraryHelpers";

describe("agentLibraryHelpers — outer catch is ReferenceError-proof", () => {
  it("without sourceId → fatal 500, stage preserved, no sourceId", () => {
    const { status, body } = buildOuterCatchResponse("init", undefined);
    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.stage).toBe("init");
    expect("sourceId" in body).toBe(false);
    expect(body.message).toContain("antes de criar");
  });

  it("with sourceId → partial 200, keeps the source id", () => {
    const { status, body } = buildOuterCatchResponse("pdfParse", "src_123");
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.stage).toBe("pdfParse");
    expect(body.sourceId).toBe("src_123");
    expect(body.message).toContain("Fonte criada");
  });

  it("uses only its two args — never throws on null/empty", () => {
    expect(() => buildOuterCatchResponse("init", null)).not.toThrow();
    expect(buildOuterCatchResponse("init", "").status).toBe(500);
  });
});

describe("agentLibraryHelpers — upload response contract (source-first)", () => {
  it("buildUploadResponse always carries ok + stage + message; omits empty sourceId", () => {
    const fatal = buildUploadResponse({ ok: false, stage: "dbCreateSource", message: "Falha no banco." });
    expect(fatal.stage).toBe("dbCreateSource");
    expect(fatal.ok).toBe(false);
    expect("sourceId" in fatal).toBe(false);

    const partial = buildUploadResponse({ ok: false, stage: "pdfParse", message: "parse falhou", sourceId: "src_1" });
    expect(partial.sourceId).toBe("src_1");
    expect(partial.stage).toBe("pdfParse");

    const ok = buildUploadResponse({ ok: true, stage: "done", message: "ok", sourceId: "src_2", created: 4 });
    expect(ok.created).toBe(4);
    expect(ok.sourceId).toBe("src_2");
  });

  it("classifyUploadOutcome: success / partial (sourceId) / fatal", () => {
    expect(classifyUploadOutcome({ ok: true, sourceId: "x" })).toBe("success");
    // source created but a later stage failed → keep upload, warn (yellow)
    expect(classifyUploadOutcome({ ok: false, sourceId: "src_1" })).toBe("partial");
    // nothing created → red fatal
    expect(classifyUploadOutcome({ ok: false })).toBe("fatal");
    expect(classifyUploadOutcome({ ok: false, sourceId: "" })).toBe("fatal");
  });
});

describe("agentLibraryHelpers — upload error handling", () => {
  it("detects the 'migration not applied' (missing table) error", () => {
    expect(isMissingTableError({ code: "P2021" })).toBe(true);
    expect(isMissingTableError({ message: "The table `public.agent_library_sources` does not exist in the current database." })).toBe(true);
    expect(isMissingTableError(new Error("relation \"agent_library_sources\" does not exist"))).toBe(true);
    expect(isMissingTableError(new Error("network timeout"))).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });

  it("prefers the server message, else maps HTTP status to a friendly message", () => {
    // server-provided specific error wins
    expect(friendlyUploadMessage(400, "Tipo de arquivo não suportado. Use PDF, TXT ou MD.")).toContain("não suportado");
    // status-derived fallbacks (no generic 'Falha no upload' for known statuses)
    expect(friendlyUploadMessage(0)).toContain("servidor");
    expect(friendlyUploadMessage(401)).toContain("Sessão admin");
    expect(friendlyUploadMessage(403)).toContain("ADMIN_SECRET");
    expect(friendlyUploadMessage(413)).toContain("grande");
    expect(friendlyUploadMessage(503)).toContain("Migration");
    expect(friendlyUploadMessage(500)).toContain("Erro interno");
    // last-resort generic only for truly unknown
    expect(friendlyUploadMessage(418)).toBe("Falha no upload.");
  });
});

describe("agentLibraryHelpers — upload (Upload First)", () => {
  it("detects pdf vs text vs unsupported", () => {
    expect(detectUploadKind("livro.pdf", "application/pdf")).toBe("pdf");
    expect(detectUploadKind("x.PDF", "")).toBe("pdf");
    expect(detectUploadKind("notas.txt", "text/plain")).toBe("text");
    expect(detectUploadKind("manual.md", "")).toBe("text");
    expect(detectUploadKind("foto.png", "image/png")).toBeNull();
    expect(detectUploadKind("planilha.xlsx", "application/vnd.ms-excel")).toBeNull();
  });

  it("derives a clean title from a file name", () => {
    expect(deriveTitleFromFileName("spin_selling-resumo.pdf")).toBe("spin selling resumo");
    expect(deriveTitleFromFileName("/a/b/Manual Do Garçom.PDF")).toBe("Manual Do Garçom");
    expect(deriveTitleFromFileName("")).toBe("Documento sem título");
  });

  it("caps stored text to the limit and flags truncation", () => {
    const long = "x".repeat(MAX_STORED_TEXT_CHARS + 100);
    const capped = capStoredText(long);
    expect(capped.text.length).toBe(MAX_STORED_TEXT_CHARS);
    expect(capped.truncated).toBe(true);
    expect(capStoredText("curto").truncated).toBe(false);
  });
});

describe("agentLibraryHelpers — agents", () => {
  it("accepts known agents and rejects unknown", () => {
    expect(isValidLibraryAgent("waiter")).toBe(true);
    expect(isValidLibraryAgent("crm")).toBe(true);
    expect(isValidLibraryAgent("nope")).toBe(false);
    expect(isValidLibraryAgent("")).toBe(false);
    expect(isValidLibraryAgent(null)).toBe(false);
  });

  it("maps slug to display name", () => {
    expect(libraryAgentName("waiter")).toBe("Waiter");
    expect(libraryAgentName("unknown")).toBe("unknown");
  });

  it("includes the four launch agents", () => {
    expect(LIBRARY_AGENTS.map((a) => a.slug)).toEqual(["waiter", "crm", "whatsapp", "analytics"]);
  });
});

describe("agentLibraryHelpers — source types & clamp", () => {
  it("validates source type", () => {
    expect(isValidSourceType("BOOK")).toBe(true);
    expect(isValidSourceType("INTERNAL_NOTE")).toBe(true);
    expect(isValidSourceType("ZIP")).toBe(false);
  });

  it("clamps long text to the safe LLM limit", () => {
    const long = "a".repeat(MAX_LLM_INPUT_CHARS + 500);
    expect(clampText(long).length).toBe(MAX_LLM_INPUT_CHARS);
    expect(clampText("short")).toBe("short");
  });
});

describe("validateSourceInput", () => {
  it("rejects missing/invalid fields", () => {
    const r = validateSourceInput({ agentSlug: "x", title: "", sourceType: "ZIP" });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("normalizes a valid payload (empty strings → null)", () => {
    const r = validateSourceInput({
      agentSlug: "waiter",
      title: "  SPIN Selling  ",
      sourceType: "BOOK",
      author: "  Rackham ",
      category: "",
      description: "  ",
      rawText: "notas",
    });
    expect(r.ok).toBe(true);
    expect(r.value?.title).toBe("SPIN Selling");
    expect(r.value?.author).toBe("Rackham");
    expect(r.value?.category).toBeNull();
    expect(r.value?.description).toBeNull();
    expect(r.value?.rawText).toBe("notas");
  });
});

describe("validateTechniqueInput", () => {
  it("requires a technique name", () => {
    expect(validateTechniqueInput({}).ok).toBe(false);
    expect(validateTechniqueInput({ techniqueName: "  " }).ok).toBe(false);
  });

  it("clamps confidence into [0,1]", () => {
    expect(validateTechniqueInput({ techniqueName: "T", confidence: 5 }).value?.confidence).toBe(1);
    expect(validateTechniqueInput({ techniqueName: "T", confidence: -2 }).value?.confidence).toBe(0);
    expect(validateTechniqueInput({ techniqueName: "T" }).value?.confidence).toBeNull();
  });
});

describe("parseExtractedTechniques", () => {
  it("returns [] for invalid JSON", () => {
    expect(parseExtractedTechniques("not json")).toEqual([]);
  });

  it("parses { techniques: [...] } and drops invalid entries", () => {
    const json = JSON.stringify({
      techniques: [
        { techniqueName: "Diagnóstico antes da oferta", application: "Pergunta curta", confidence: 0.8 },
        { application: "sem nome — inválida" },
      ],
    });
    const out = parseExtractedTechniques(json);
    expect(out.length).toBe(1);
    expect(out[0].techniqueName).toBe("Diagnóstico antes da oferta");
    expect(out[0].confidence).toBe(0.8);
  });

  it("parses a bare array too", () => {
    const out = parseExtractedTechniques(JSON.stringify([{ techniqueName: "Prova social" }]));
    expect(out.length).toBe(1);
  });
});
