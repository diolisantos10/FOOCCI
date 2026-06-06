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
} from "./agentLibraryHelpers";

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
