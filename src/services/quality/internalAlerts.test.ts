import { describe, it, expect } from "vitest";
import { deriveInternalAlerts, hasCriticalAlert, type AlertRunLike } from "./internalAlerts";
import type { FindingStatus } from "./types";

function run(id: string, globalStatus: FindingStatus, P0 = 0): AlertRunLike {
  return { id, globalStatus, countsBySeverity: { P0, P1: 0, P2: 0, INFO: 0 }, createdAt: `2026-06-0${id}T03:00:00Z` };
}

describe("deriveInternalAlerts", () => {
  it("emits a NEW_P0 alert when a P0 appears (newest pair)", () => {
    const alerts = deriveInternalAlerts([run("3", "FAIL", 1), run("2", "WARNING", 0)]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("NEW_P0");
    expect(alerts[0].severity).toBe("P0");
    expect(alerts[0].runId).toBe("3");
    expect(alerts[0].previousRunId).toBe("2");
  });

  it("emits a P0_RESOLVED alert when a P0 is cleared", () => {
    const alerts = deriveInternalAlerts([run("3", "WARNING", 0), run("2", "FAIL", 1)]);
    expect(alerts[0].type).toBe("P0_RESOLVED");
    expect(alerts[0].severity).toBe("INFO");
  });

  it("emits a STATUS_REGRESSION alert on a plain worsening (no P0)", () => {
    const alerts = deriveInternalAlerts([run("3", "WARNING", 0), run("2", "PASS", 0)]);
    expect(alerts[0].type).toBe("STATUS_REGRESSION");
    expect(alerts[0].severity).toBe("WARNING");
  });

  it("does NOT alert on stable or plain improvement (anti-noise)", () => {
    expect(deriveInternalAlerts([run("3", "WARNING", 0), run("2", "WARNING", 0)])).toEqual([]);
    expect(deriveInternalAlerts([run("3", "PASS", 0), run("2", "WARNING", 0)])).toEqual([]); // improved, not a P0-resolve
  });

  it("returns no alerts with insufficient history", () => {
    expect(deriveInternalAlerts([])).toEqual([]);
    expect(deriveInternalAlerts([run("1", "FAIL", 1)])).toEqual([]);
  });

  it("scans multiple transitions and caps to the limit", () => {
    const runs = [run("5", "FAIL", 1), run("4", "PASS", 0), run("3", "WARNING", 0), run("2", "PASS", 0), run("1", "PASS", 0)];
    const alerts = deriveInternalAlerts(runs, 2);
    expect(alerts.length).toBeLessThanOrEqual(2);
    expect(alerts[0].runId).toBe("5"); // most recent transition first
  });

  it("hasCriticalAlert detects an open P0", () => {
    expect(hasCriticalAlert(deriveInternalAlerts([run("3", "FAIL", 1), run("2", "PASS", 0)]))).toBe(true);
    expect(hasCriticalAlert([])).toBe(false);
  });
});
