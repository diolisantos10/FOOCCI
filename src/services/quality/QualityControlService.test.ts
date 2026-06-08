import { describe, it, expect } from "vitest";
import {
  getAuditors,
  getAuditor,
  runOne,
  runAll,
  countBySeverity,
  countByStatus,
  computeGlobalStatus,
  QualityAuditorNotFoundError,
} from "./QualityControlService";
import type { AuditFinding } from "./types";

const EXPECTED_IDS = ["waiter", "crm", "analytics", "whatsapp"];

describe("Quality Control — registry", () => {
  it("(1) contains exactly the 4 v0 auditors", () => {
    const ids = getAuditors().map((a) => a.id).sort();
    expect(ids).toEqual([...EXPECTED_IDS].sort());
  });

  it("(2) every auditor is read-only", () => {
    for (const a of getAuditors()) expect(a.readOnly).toBe(true);
  });

  it("(3) every auditor can run daily", () => {
    for (const a of getAuditors()) expect(a.canRunDaily).toBe(true);
  });

  it("every auditor links at least one lab with a real or honestly-flagged href", () => {
    for (const a of getAuditors()) {
      expect(a.linkedLabs.length).toBeGreaterThan(0);
      for (const lab of a.linkedLabs) {
        expect(lab.label.length).toBeGreaterThan(0);
        if (lab.exists) expect(lab.href).toMatch(/^\/admin\//);
      }
    }
  });
});

describe("Quality Control — runOne", () => {
  it("(5) runs an existing auditor and returns standardized findings", async () => {
    const res = await runOne("waiter", { now: new Date("2026-06-08T03:00:00Z"), runId: "run_test" });
    expect(res.runId).toBe("run_test");
    expect(res.auditorIds).toEqual(["waiter"]);
    expect(res.findings.length).toBeGreaterThan(0);
    const f = res.findings[0];
    // exact contract shape
    expect(f).toMatchObject({
      runId: "run_test",
      auditorId: "waiter",
    });
    expect(["PASS", "WARNING", "FAIL"]).toContain(f.status);
    expect(["P0", "P1", "P2", "INFO"]).toContain(f.severity);
    expect(typeof f.title).toBe("string");
    expect(typeof f.summary).toBe("string");
    expect(Array.isArray(f.evidence)).toBe(true);
    expect(typeof f.affectedArea).toBe("string");
    expect(typeof f.recommendation).toBe("string");
    expect(f.createdAt).toBeInstanceOf(Date);
  });

  it("(6) throws a controlled error for an unknown auditor", async () => {
    await expect(runOne("does-not-exist")).rejects.toBeInstanceOf(QualityAuditorNotFoundError);
  });
});

describe("Quality Control — runAll", () => {
  it("(7) aggregates findings from every auditor", async () => {
    const res = await runAll({ now: new Date("2026-06-08T03:00:00Z") });
    expect(res.auditorIds.sort()).toEqual([...EXPECTED_IDS].sort());
    expect(res.findings.length).toBeGreaterThanOrEqual(EXPECTED_IDS.length);
    // every finding is stamped with the same run id
    for (const f of res.findings) expect(f.runId).toBe(res.runId);
  });

  it("severity + status counts sum to the number of findings", async () => {
    const res = await runAll();
    const sevTotal = res.countsBySeverity.P0 + res.countsBySeverity.P1 + res.countsBySeverity.P2 + res.countsBySeverity.INFO;
    const stTotal = res.countsByStatus.PASS + res.countsByStatus.WARNING + res.countsByStatus.FAIL;
    expect(sevTotal).toBe(res.findings.length);
    expect(stTotal).toBe(res.findings.length);
  });
});

// ── pure aggregation helpers ──────────────────────────────────────────────────

function finding(partial: Partial<AuditFinding>): AuditFinding {
  return {
    runId: "r",
    auditorId: "a",
    status: "PASS",
    severity: "INFO",
    title: "t",
    summary: "s",
    evidence: [],
    affectedArea: "area",
    recommendation: "rec",
    createdAt: new Date(0),
    ...partial,
  };
}

describe("Quality Control — counting + global status", () => {
  it("(8) counts P0/P1/P2/INFO correctly", () => {
    const fs = [
      finding({ severity: "P0" }),
      finding({ severity: "P1" }),
      finding({ severity: "P1" }),
      finding({ severity: "INFO" }),
    ];
    expect(countBySeverity(fs)).toEqual({ P0: 1, P1: 2, P2: 0, INFO: 1 });
  });

  it("(9) global status: PASS when only PASS/INFO", () => {
    const fs = [finding({ status: "PASS", severity: "INFO" }), finding({ status: "PASS", severity: "INFO" })];
    expect(computeGlobalStatus(fs)).toBe("PASS");
  });

  it("(9) global status: WARNING when any P1/P2 or WARNING (no P0/FAIL)", () => {
    expect(computeGlobalStatus([finding({ status: "WARNING", severity: "INFO" })])).toBe("WARNING");
    expect(computeGlobalStatus([finding({ status: "PASS", severity: "P2" })])).toBe("WARNING");
    expect(computeGlobalStatus([finding({ status: "PASS", severity: "P1" })])).toBe("WARNING");
  });

  it("(9) global status: FAIL when any P0 or FAIL (wins over warnings)", () => {
    expect(computeGlobalStatus([finding({ status: "FAIL", severity: "INFO" })])).toBe("FAIL");
    expect(computeGlobalStatus([finding({ status: "PASS", severity: "P0" })])).toBe("FAIL");
    expect(
      computeGlobalStatus([finding({ severity: "P1" }), finding({ severity: "P0" })]),
    ).toBe("FAIL");
  });

  it("countByStatus tallies PASS/WARNING/FAIL", () => {
    const fs = [finding({ status: "PASS" }), finding({ status: "WARNING" }), finding({ status: "WARNING" })];
    expect(countByStatus(fs)).toEqual({ PASS: 1, WARNING: 2, FAIL: 0 });
  });

  it("v0 global status is WARNING (auditors registered, runners not connected yet)", async () => {
    const res = await runAll();
    expect(res.globalStatus).toBe("WARNING");
    // honest: nothing was actually verified, so no PASS / no real FAIL
    expect(res.countsByStatus.FAIL).toBe(0);
    expect(res.countsBySeverity.P0).toBe(0);
  });
});
