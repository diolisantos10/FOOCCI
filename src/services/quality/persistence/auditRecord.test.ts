import { describe, it, expect } from "vitest";
import { buildRunRecord, sanitizeText, sanitizeEvidence, sanitizeFinding } from "./auditRecord";
import type { AuditFinding, AuditRunResult } from "../types";

function finding(p: Partial<AuditFinding> = {}): AuditFinding {
  return {
    runId: "r", auditorId: "waiter", status: "PASS", severity: "INFO",
    title: "t", summary: "s", evidence: ["e1"], affectedArea: "IA",
    recommendation: "rec", createdAt: new Date(0), ...p,
  };
}

function result(p: Partial<AuditRunResult> = {}): AuditRunResult {
  return {
    runId: "run_x",
    startedAt: new Date("2026-06-08T03:00:00.000Z"),
    finishedAt: new Date("2026-06-08T03:00:00.250Z"),
    auditorIds: ["waiter", "crm"],
    findings: [finding()],
    countsBySeverity: { P0: 0, P1: 0, P2: 1, INFO: 3 },
    countsByStatus: { PASS: 2, WARNING: 2, FAIL: 0 },
    globalStatus: "WARNING",
    ...p,
  };
}

describe("auditRecord — buildRunRecord", () => {
  it("(5) persists countsBySeverity / countsByStatus and global status", () => {
    const rec = buildRunRecord(result(), { source: "MANUAL" });
    expect(rec.globalStatus).toBe("WARNING");
    expect(rec.countsBySeverity).toEqual({ P0: 0, P1: 0, P2: 1, INFO: 3 });
    expect(rec.countsByStatus).toEqual({ PASS: 2, WARNING: 2, FAIL: 0 });
    expect(rec.durationMs).toBe(250);
    expect(rec.source).toBe("MANUAL");
    expect(rec.findings).toHaveLength(1);
  });

  it("(6) keeps auditorId when a single auditor ran", () => {
    expect(buildRunRecord(result(), { source: "MANUAL", auditorId: "crm" }).auditorId).toBe("crm");
    expect(buildRunRecord(result(), { source: "MANUAL" }).auditorId).toBeNull();
  });
});

describe("auditRecord — sanitization (7) never stores sensitive data", () => {
  it("redacts phone numbers", () => {
    expect(sanitizeText("cliente +55 11 99999-0000 pediu")).toContain("[phone]");
    expect(sanitizeText("cliente +55 11 99999-0000 pediu")).not.toMatch(/99999/);
  });

  it("redacts emails", () => {
    expect(sanitizeText("contato joao@exemplo.com")).toContain("[email]");
    expect(sanitizeText("contato joao@exemplo.com")).not.toContain("joao@exemplo.com");
  });

  it("redacts secrets/tokens", () => {
    expect(sanitizeText("authorization: Bearer abc")).toContain("[REDACTED]");
    // long opaque token (24+ chars) — intentionally NOT shaped like any real
    // provider key, so secret-scanning push protection never flags the fixture.
    expect(sanitizeText("key faketokenAAAAAAAAAAAAAAAAAAAAAAAA")).toContain("[token]");
  });

  it("keeps technical evidence intact and drops empties", () => {
    const out = sanitizeEvidence(["safeMode=true · dryRun=true", "", "37/37 cenários"]);
    expect(out).toEqual(["safeMode=true · dryRun=true", "37/37 cenários"]);
  });

  it("sanitizes a whole finding (phone in evidence is redacted)", () => {
    const rec = sanitizeFinding(finding({ evidence: ["handoff p/ +5511988887777"] }));
    expect(rec.evidence[0]).toContain("[phone]");
    expect(rec.evidence[0]).not.toContain("988887777");
  });
});
