import { describe, it, expect } from "vitest";
import { detectRegression, type RegressionRunLike } from "./regression";
import type { FindingStatus } from "./types";

function r(id: string, globalStatus: FindingStatus, P0 = 0, P1 = 0, P2 = 0): RegressionRunLike {
  return { id, globalStatus, countsBySeverity: { P0, P1, P2, INFO: 0 } };
}

describe("detectRegression", () => {
  it("(7) insufficient history when a run is missing", () => {
    expect(detectRegression(undefined, undefined).trend).toBe("INSUFFICIENT_HISTORY");
    expect(detectRegression(r("a", "PASS"), undefined).trend).toBe("INSUFFICIENT_HISTORY");
    expect(detectRegression(null, r("b", "PASS")).trend).toBe("INSUFFICIENT_HISTORY");
  });

  it("(2) PASS → WARNING = piorou (WARNING)", () => {
    const out = detectRegression(r("new", "WARNING"), r("old", "PASS"));
    expect(out.trend).toBe("WORSENED");
    expect(out.severity).toBe("WARNING");
    expect(out.title).toBe("Piorou");
    expect(out.previousRunId).toBe("old");
    expect(out.latestRunId).toBe("new");
  });

  it("(3) PASS → FAIL = piorou muito", () => {
    // FAIL with no P0 (status-only failure) → 'Piorou muito', not 'Novo P0'
    const out = detectRegression(r("new", "FAIL", 0), r("old", "PASS", 0));
    expect(out.trend).toBe("WORSENED");
    expect(out.title).toBe("Piorou muito");
  });

  it("WARNING → FAIL = piorou", () => {
    expect(detectRegression(r("n", "FAIL"), r("o", "WARNING")).title).toBe("Piorou");
  });

  it("(4) WARNING → PASS = melhorou", () => {
    const out = detectRegression(r("n", "PASS"), r("o", "WARNING"));
    expect(out.trend).toBe("IMPROVED");
    expect(out.title).toBe("Melhorou");
    expect(out.severity).toBe("INFO");
  });

  it("FAIL → PASS = melhorou muito", () => {
    expect(detectRegression(r("n", "PASS"), r("o", "FAIL")).title).toBe("Melhorou muito");
  });

  it("same status = estável", () => {
    const out = detectRegression(r("n", "WARNING"), r("o", "WARNING"));
    expect(out.trend).toBe("STABLE");
    expect(out.title).toBe("Estável");
  });

  it("(5) a new P0 that did not exist before = regressão crítica (severity P0)", () => {
    const out = detectRegression(r("n", "FAIL", 1), r("o", "WARNING", 0));
    expect(out.trend).toBe("WORSENED");
    expect(out.severity).toBe("P0");
    expect(out.title).toBe("Novo P0");
  });

  it("new P0 wins over the plain status comparison", () => {
    // even PASS → FAIL becomes 'Novo P0' when the FAIL carries a P0
    const out = detectRegression(r("n", "FAIL", 2), r("o", "PASS", 0));
    expect(out.severity).toBe("P0");
    expect(out.title).toBe("Novo P0");
  });

  it("(6) a resolved P0 = melhora crítica", () => {
    const out = detectRegression(r("n", "WARNING", 0), r("o", "FAIL", 1));
    expect(out.trend).toBe("IMPROVED");
    expect(out.title).toBe("P0 resolvido");
    expect(out.severity).toBe("INFO");
  });
});
