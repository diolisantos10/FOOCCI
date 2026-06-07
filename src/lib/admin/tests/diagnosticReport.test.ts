import { describe, it, expect } from "vitest";
import {
  maskPhone,
  maskSecret,
  fmtDateForFilename,
  buildFilename,
  buildDiagnosticReportText,
} from "../diagnosticReport";

// A — maskPhone
describe("maskPhone", () => {
  it("A1 — hides all but last 4 digits for a Brazilian E.164 number", () => {
    const masked = maskPhone("+5511940595223");
    expect(masked).not.toContain("9405");
    expect(masked).toMatch(/5223$/);
  });

  it("A2 — handles empty string", () => {
    expect(maskPhone("")).toBe("****");
  });

  it("A3 — handles a short number (4 digits or fewer)", () => {
    const result = maskPhone("1234");
    expect(result).toBe("****");
  });

  it("A4 — strips non-digit chars before masking", () => {
    const masked = maskPhone("+55 (11) 94059-5223");
    expect(masked).toMatch(/5223$/);
    expect(masked).not.toContain("9405");
  });
});

// B — maskSecret
describe("maskSecret", () => {
  it("B1 — shows first 2 and last 2 chars", () => {
    const result = maskSecret("super-secret-key-12345");
    expect(result).toMatch(/^su/);
    expect(result).toMatch(/45$/);
    expect(result).toContain("***");
  });

  it("B2 — short secret returns ****", () => {
    expect(maskSecret("abc")).toBe("****");
  });

  it("B3 — empty returns ****", () => {
    expect(maskSecret("")).toBe("****");
  });
});

// C — fmtDateForFilename
describe("fmtDateForFilename", () => {
  it("C1 — formats to YYYY-MM-DD-HH-MM", () => {
    const result = fmtDateForFilename("2026-06-07T14:30:00.000Z");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/);
  });

  it("C2 — zero-pads single-digit months and days", () => {
    const result = fmtDateForFilename("2026-01-05T09:05:00.000Z");
    const parts = result.split("-");
    expect(parts[1]).toHaveLength(2);
    expect(parts[2]).toHaveLength(2);
    expect(parts[3]).toHaveLength(2);
    expect(parts[4]).toHaveLength(2);
  });
});

// D — buildFilename
describe("buildFilename", () => {
  it("D1 — builds standard filename with prefix, slug, date, extension", () => {
    const filename = buildFilename("crm-test", "sushi-cazza", "2026-06-07T14:30:00.000Z", "json");
    expect(filename).toMatch(/^crm-test-sushi-cazza-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
  });

  it("D2 — txt extension works", () => {
    const filename = buildFilename("cart-recovery", "burger-co", "2026-06-07T10:00:00.000Z", "txt");
    expect(filename).toMatch(/\.txt$/);
    expect(filename).toContain("cart-recovery-burger-co-");
  });
});

// E — buildDiagnosticReportText — header
describe("buildDiagnosticReportText — header", () => {
  it("E1 — includes FOOCCI — DIAGNOSTIC REPORT header", () => {
    const text = buildDiagnosticReportText({ tool: "Test Tool" });
    expect(text).toContain("FOOCCI — DIAGNOSTIC REPORT");
    expect(text).toContain("Test Tool");
  });

  it("E2 — masks phone in header", () => {
    const text = buildDiagnosticReportText({ tool: "T", phone: "+5511940595223" });
    expect(text).not.toContain("9405");
    expect(text).toContain("5223");
  });

  it("E3 — includes restaurant and slug when provided", () => {
    const text = buildDiagnosticReportText({ tool: "T", restaurant: "Sushi Cazza", slug: "sushi-cazza" });
    expect(text).toContain("Sushi Cazza");
    expect(text).toContain("sushi-cazza");
  });

  it("E4 — omits optional fields when not provided", () => {
    const text = buildDiagnosticReportText({ tool: "T" });
    expect(text).not.toContain("Telefone:");
    expect(text).not.toContain("Commit SHA:");
    expect(text).not.toContain("Modo:");
  });
});

// F — buildDiagnosticReportText — summary block
describe("buildDiagnosticReportText — summary", () => {
  it("F1 — includes SUMÁRIO section with verdict", () => {
    const text = buildDiagnosticReportText({
      tool:    "T",
      verdict: "PASS",
      diagnosis: "All checks passed",
      recommendation: "Ship it",
    });
    expect(text).toContain("SUMÁRIO");
    expect(text).toContain("PASS");
    expect(text).toContain("All checks passed");
    expect(text).toContain("Ship it");
  });

  it("F2 — no SUMÁRIO block when all fields absent", () => {
    const text = buildDiagnosticReportText({ tool: "T" });
    expect(text).not.toContain("SUMÁRIO");
  });
});

// G — buildDiagnosticReportText — inputs block
describe("buildDiagnosticReportText — inputs", () => {
  it("G1 — includes ENTRADAS section with key/value rows", () => {
    const text = buildDiagnosticReportText({
      tool: "T",
      inputs: { slug: "sushi-cazza", mode: "dry_run", count: 3 },
    });
    expect(text).toContain("ENTRADAS");
    expect(text).toContain("slug: sushi-cazza");
    expect(text).toContain("mode: dry_run");
    expect(text).toContain("count: 3");
  });

  it("G2 — null values render as —", () => {
    const text = buildDiagnosticReportText({
      tool: "T",
      inputs: { orderId: null },
    });
    expect(text).toContain("orderId: —");
  });
});

// H — buildDiagnosticReportText — custom sections
describe("buildDiagnosticReportText — sections", () => {
  it("H1 — renders titled section with rows", () => {
    const text = buildDiagnosticReportText({
      tool: "T",
      sections: [
        { title: "Resultados", rows: [{ label: "eligíveis", value: 5 }, { label: "enviados", value: 3 }] },
      ],
    });
    expect(text).toContain("RESULTADOS");
    expect(text).toContain("eligíveis: 5");
    expect(text).toContain("enviados: 3");
  });
});

// I — buildDiagnosticReportText — safety notes
describe("buildDiagnosticReportText — safety notes", () => {
  it("I1 — includes NOTAS DE SEGURANÇA with bullet points", () => {
    const text = buildDiagnosticReportText({
      tool: "T",
      safetyNotes: ["live routing NOT active", "no real orders created"],
    });
    expect(text).toContain("NOTAS DE SEGURANÇA");
    expect(text).toContain("- live routing NOT active");
    expect(text).toContain("- no real orders created");
  });
});

// J — no side effects
describe("no side effects", () => {
  it("J1 — maskPhone is pure (same input → same output)", () => {
    expect(maskPhone("+5511940595223")).toBe(maskPhone("+5511940595223"));
  });

  it("J2 — buildDiagnosticReportText is pure", () => {
    const opts = { tool: "T", restaurant: "R", verdict: "PASS" };
    expect(buildDiagnosticReportText(opts)).toBe(buildDiagnosticReportText(opts));
  });

  it("J3 — buildFilename does not mutate arguments", () => {
    const slug = "sushi-cazza";
    const ts   = "2026-06-07T10:00:00.000Z";
    buildFilename("test", slug, ts, "json");
    expect(slug).toBe("sushi-cazza");
    expect(ts).toBe("2026-06-07T10:00:00.000Z");
  });
});
