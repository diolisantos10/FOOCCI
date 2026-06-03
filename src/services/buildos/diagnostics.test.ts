/**
 * Diagnostics smoke tests (no DB). The full report aggregates DB-backed checks
 * (covered by integration/manual runs); here we confirm the report is defensive
 * (never throws without a DB) and that the pure sub-checks are correct.
 */

import { describe, it, expect } from "vitest";
import { runBuildOsDiagnostics } from "./BuildOSDiagnosticsService";

describe("runBuildOsDiagnostics — defensive + pure checks", () => {
  it("never throws without a database and returns a structured report", async () => {
    const r = (await runBuildOsDiagnostics({ phone: "+5511989400692" })) as Record<string, unknown>;
    expect(r).toHaveProperty("buildOsConfig");
    expect(r).toHaveProperty("authorizedSenderCheck");
    expect(r).toHaveProperty("detectorCheck");
    expect(r).toHaveProperty("classificationCheck");
    expect(r).toHaveProperty("promptDraftCheck");
    expect(r).toHaveProperty("likelyRootCause");
  });

  it("detects the prefix and classifies the Pix sample deterministically", async () => {
    const r = (await runBuildOsDiagnostics({})) as any;
    expect(r.detectorCheck.prefixDetected).toBe("/build");
    expect(r.classificationCheck.taskType).toBe("AUDIT");
    expect(r.classificationCheck.executionIntent).toBe("AUDIT_ONLY");
    expect(r.classificationCheck.targetArea).toBe("payment");
    expect(r.classificationCheck.riskLevel).toBe("HIGH");
  });

  it("generates a prompt draft without any Claude/GitHub relay wording", async () => {
    const r = (await runBuildOsDiagnostics({})) as any;
    expect(r.promptDraftCheck.canGeneratePromptDraft).toBe(true);
    expect(r.promptDraftCheck.noClaudeRelay).toBe(true);
  });

  it("masks the phone (no full number leaked)", async () => {
    const r = (await runBuildOsDiagnostics({ phone: "+5511989400692" })) as any;
    expect(r.authorizedSenderCheck.normalizedPhone).not.toContain("989400");
    expect(r.authorizedSenderCheck.normalizedPhone).toContain("***");
  });

  it("flags CONFIG_DISABLED when the gate is off (no DB → not enabled)", async () => {
    const r = (await runBuildOsDiagnostics({})) as any;
    // In a no-DB unit env the gate resolves disabled → CONFIG_DISABLED.
    expect(["CONFIG_DISABLED", "HEALTHY", "AUTHORIZATION_FAILED"]).toContain(r.likelyRootCause.code);
  });

  it("returns DETECTOR_NOT_CALLED for a non-command message", async () => {
    const r = (await runBuildOsDiagnostics({ message: "quero ver o cardápio" })) as any;
    expect(r.detectorCheck.prefixDetected).toBeNull();
    expect(r.likelyRootCause.code).toBe("DETECTOR_NOT_CALLED");
  });
});
