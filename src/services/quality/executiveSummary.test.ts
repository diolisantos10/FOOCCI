import { describe, it, expect } from "vitest";
import {
  getWorstAuditor,
  getPrimaryRecommendation,
  getTrend,
  rollupAuditors,
  buildExecutiveOverview,
  statusText,
  type FindingLike,
  type RunLike,
} from "./executiveSummary";

function f(p: Partial<FindingLike> = {}): FindingLike {
  return { auditorId: "waiter", status: "PASS", severity: "INFO", title: "t", recommendation: "rec", ...p };
}
function run(globalStatus: RunLike["globalStatus"]): RunLike {
  return { globalStatus };
}

describe("executiveSummary — getWorstAuditor (3)", () => {
  it("picks the auditor with the most severe finding", () => {
    const worst = getWorstAuditor([
      f({ auditorId: "waiter", severity: "INFO", status: "PASS" }),
      f({ auditorId: "crm", severity: "P0", status: "FAIL", title: "CRM crítico" }),
      f({ auditorId: "analytics", severity: "P2", status: "WARNING" }),
    ]);
    expect(worst?.auditorId).toBe("crm");
    expect(worst?.severity).toBe("P0");
    expect(worst?.title).toBe("CRM crítico");
  });

  it("returns null when there are no findings", () => {
    expect(getWorstAuditor([])).toBeNull();
  });
});

describe("executiveSummary — getPrimaryRecommendation (5)", () => {
  it("returns the recommendation of the worst finding", () => {
    const rec = getPrimaryRecommendation([
      f({ severity: "INFO", status: "PASS", recommendation: "manter" }),
      f({ auditorId: "wa", severity: "P0", status: "FAIL", recommendation: "corrigir já" }),
    ]);
    expect(rec).toBe("corrigir já");
  });

  it("says no action needed when everything is healthy", () => {
    expect(getPrimaryRecommendation([f({ severity: "INFO", status: "PASS" })])).toContain("Nenhuma ação");
  });

  it("(6) works without history", () => {
    expect(getPrimaryRecommendation([])).toContain("Rode a auditoria");
  });
});

describe("executiveSummary — getTrend (4)", () => {
  it("insufficient with fewer than 2 runs", () => {
    expect(getTrend([])).toBe("insufficient");
    expect(getTrend([run("PASS")])).toBe("insufficient");
  });

  it("improving when latest is better than previous", () => {
    expect(getTrend([run("PASS"), run("WARNING")])).toBe("improving");
    expect(getTrend([run("WARNING"), run("FAIL")])).toBe("improving");
  });

  it("worsening when latest is worse than previous", () => {
    expect(getTrend([run("FAIL"), run("WARNING")])).toBe("worsening");
    expect(getTrend([run("WARNING"), run("PASS")])).toBe("worsening");
  });

  it("stable when latest equals previous", () => {
    expect(getTrend([run("WARNING"), run("WARNING"), run("WARNING")])).toBe("stable");
  });
});

describe("executiveSummary — rollupAuditors", () => {
  it("counts clean vs attention auditors by worst status", () => {
    const r = rollupAuditors([
      f({ auditorId: "waiter", status: "PASS" }),
      f({ auditorId: "waiter", status: "WARNING" }), // waiter worst = WARNING
      f({ auditorId: "crm", status: "PASS" }),
      f({ auditorId: "analytics", status: "FAIL" }),
    ]);
    expect(r.ok).toBe(1); // crm
    expect(r.attention).toBe(2); // waiter + analytics
    expect(r.byAuditor.waiter).toBe("WARNING");
  });
});

describe("executiveSummary — buildExecutiveOverview", () => {
  it("(1)(2) computes status, detects P0 and the worst auditor", () => {
    const o = buildExecutiveOverview({
      globalStatus: "FAIL",
      counts: { P0: 1, P1: 0, P2: 2, INFO: 5 },
      findings: [
        f({ auditorId: "waiter", severity: "INFO", status: "PASS" }),
        f({ auditorId: "crm", severity: "P0", status: "FAIL", recommendation: "fix crm" }),
      ],
      runs: [run("FAIL"), run("WARNING")],
    });
    expect(o.globalStatus).toBe("FAIL");
    expect(o.statusText).toBe("Existe falha crítica que precisa de ação.");
    expect(o.p0).toBe(1);
    expect(o.worstAuditor?.auditorId).toBe("crm");
    expect(o.recommendation).toBe("fix crm");
    expect(o.trend).toBe("worsening");
    expect(o.auditorsOk).toBe(1);
    expect(o.auditorsAttention).toBe(1);
  });

  it("(6) works with no history", () => {
    const o = buildExecutiveOverview({});
    expect(o.hasHistory).toBe(false);
    expect(o.globalStatus).toBeNull();
    expect(o.statusText).toContain("Nenhuma auditoria");
    expect(o.p0).toBe(0);
    expect(o.worstAuditor).toBeNull();
    expect(o.trend).toBe("insufficient");
  });

  it("statusText maps each status", () => {
    expect(statusText("PASS")).toContain("saudável");
    expect(statusText("WARNING")).toContain("atenção");
    expect(statusText("FAIL")).toContain("falha crítica");
    expect(statusText(null)).toContain("Nenhuma");
  });
});
