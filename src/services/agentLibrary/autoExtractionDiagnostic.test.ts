import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./uploadFlow", () => ({ runUploadFlow: vi.fn() }));
vi.mock("./AgentLibraryService", () => ({
  AgentLibraryService: {
    getSourceWithTechniques: vi.fn(),
    deleteSource: vi.fn(),
  },
}));

import { runAutoExtractionDiagnostic, DIAGNOSTIC_TEXT } from "./autoExtractionDiagnostic";
import { runUploadFlow } from "./uploadFlow";
import { AgentLibraryService } from "./AgentLibraryService";

const flow = vi.mocked(runUploadFlow);
const svc = vi.mocked(AgentLibraryService);

function uploadResult(body: Record<string, unknown>) {
  return { status: 200, body: { ok: true, ...body } } as never;
}
function tech(over: Record<string, unknown> = {}) {
  return {
    sourceId: "s1", techniqueName: "Venda consultiva", category: "Diagnóstico",
    application: "O Waiter diagnostica a intenção antes de sugerir.", usageRule: "1 pergunta no máximo.",
    qualityTest: "Sugeriu item compatível?", status: "EXTRACTED", ...over,
  } as never;
}
function detail(extractionStatus: string, techniques: unknown[]) {
  return { id: "s1", extractionStatus, techniques } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.deleteSource.mockResolvedValue(true as never);
});

describe("runAutoExtractionDiagnostic", () => {
  it("(1)(3)(5)(8) PASS: real flow creates source + techniques, cleans up, no runtime touch", async () => {
    flow.mockResolvedValue(uploadResult({ stage: "done", sourceId: "s1", created: 3 }));
    svc.getSourceWithTechniques.mockResolvedValue(detail("EXTRACTED", [tech(), tech(), tech()]));

    const r = await runAutoExtractionDiagnostic();

    expect(r.status).toBe("PASS");
    expect(r.ok).toBe(true);
    expect(r.agentSlug).toBe("waiter");
    expect(r.sourceCreated).toBe(true);
    expect(r.techniquesCreated).toBe(3);
    expect(r.sourceCleanedUp).toBe(true);
    expect(r.runtimeTouched).toBe(false);
    expect(svc.deleteSource).toHaveBeenCalledWith("s1");
  });

  it("(2) triggers AUTOMATIC extraction — upload form carries no `extract` flag", async () => {
    flow.mockResolvedValue(uploadResult({ stage: "done", sourceId: "s1", created: 2 }));
    svc.getSourceWithTechniques.mockResolvedValue(detail("EXTRACTED", [tech(), tech()]));

    await runAutoExtractionDiagnostic();

    const form = flow.mock.calls[0][0] as FormData;
    expect(form.get("extract")).toBeNull(); // no manual opt-in → automatic
    expect(form.get("agentSlug")).toBe("waiter");
    expect(String(form.get("rawText"))).toContain("venda consultiva");
  });

  it("(4) FAIL when techniques lack useful fields (still cleans up)", async () => {
    flow.mockResolvedValue(uploadResult({ stage: "done", sourceId: "s1", created: 1 }));
    svc.getSourceWithTechniques.mockResolvedValue(
      detail("EXTRACTED", [tech({ application: null, usageRule: null, qualityTest: null })]),
    );

    const r = await runAutoExtractionDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(r.stage).toBe("validate");
    expect(svc.deleteSource).toHaveBeenCalledWith("s1");
    expect(r.sourceCleanedUp).toBe(true);
  });

  it("FAIL when no technique was created (cleans up)", async () => {
    flow.mockResolvedValue(uploadResult({ stage: "done", sourceId: "s1", created: 0 }));
    svc.getSourceWithTechniques.mockResolvedValue(detail("EXTRACTED", []));
    const r = await runAutoExtractionDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(svc.deleteSource).toHaveBeenCalledWith("s1");
  });

  it("(6) FAIL controlled when AI extraction fails (stage aiExtraction) + cleanup", async () => {
    flow.mockResolvedValue({ status: 200, body: { ok: false, stage: "aiExtraction", sourceId: "s1", message: "Fonte criada, mas a extração automática por IA falhou." } } as never);
    const r = await runAutoExtractionDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(r.message).toContain("OPENAI_API_KEY ausente ou extração IA indisponível");
    expect(r.sourceCleanedUp).toBe(true);
    expect(svc.getSourceWithTechniques).not.toHaveBeenCalled();
  });

  it("(7) FAIL controlled when OPENAI_API_KEY is missing", async () => {
    flow.mockResolvedValue({ status: 200, body: { ok: false, stage: "aiExtraction", sourceId: "s1", message: "OPENAI_API_KEY não configurada." } } as never);
    const r = await runAutoExtractionDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(r.message).toContain("OPENAI_API_KEY");
    expect(r.runtimeTouched).toBe(false);
  });

  it("(9) cleanup is attempted even when deleteSource fails (reports sourceCleanedUp=false)", async () => {
    flow.mockResolvedValue(uploadResult({ stage: "done", sourceId: "s1", created: 0 }));
    svc.getSourceWithTechniques.mockResolvedValue(detail("EXTRACTED", []));
    svc.deleteSource.mockRejectedValue(new Error("db down") as never);
    const r = await runAutoExtractionDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(svc.deleteSource).toHaveBeenCalledWith("s1");
    expect(r.sourceCleanedUp).toBe(false); // never throws
  });

  it("FAIL when the source itself was not created (no sourceId)", async () => {
    flow.mockResolvedValue({ status: 400, body: { ok: false, stage: "fileValidation", message: "Dados inválidos." } } as never);
    const r = await runAutoExtractionDiagnostic();
    expect(r.status).toBe("FAIL");
    expect(r.sourceCreated).toBe(false);
    expect(svc.deleteSource).not.toHaveBeenCalled();
  });

  it("exposes self-authored synthetic content (no copyrighted text)", () => {
    expect(DIAGNOSTIC_TEXT).toContain("venda consultiva");
  });
});
