import { describe, it, expect } from "vitest";
import { handleQualityRun } from "./runRequest";

describe("Quality Control — handleQualityRun (API core)", () => {
  it("runAll: empty body returns standardized JSON for all auditors", async () => {
    const { httpStatus, payload } = await handleQualityRun({});
    expect(httpStatus).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.mode).toBe("all");
    expect(payload.result).toBeDefined();
    expect(payload.result!.auditorIds.length).toBeGreaterThanOrEqual(4);
    // JSON-serializable
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it("runAll: missing body (undefined) also runs all", async () => {
    const { payload } = await handleQualityRun(undefined);
    expect(payload.ok).toBe(true);
    expect(payload.mode).toBe("all");
  });

  it("runOne: valid auditorId returns JSON for a single auditor", async () => {
    const { httpStatus, payload } = await handleQualityRun({ auditorId: "waiter" });
    expect(httpStatus).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.mode).toBe("one");
    expect(payload.result!.auditorIds).toEqual(["waiter"]);
  });

  it("runOne: unknown auditorId returns a controlled 404 (never throws)", async () => {
    const { httpStatus, payload } = await handleQualityRun({ auditorId: "does-not-exist" });
    expect(httpStatus).toBe(404);
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("NOT_FOUND");
    expect(payload.error).toContain("does-not-exist");
  });

  it("rejects a non-string auditorId with a controlled 400", async () => {
    const { httpStatus, payload } = await handleQualityRun({ auditorId: 123 });
    expect(httpStatus).toBe(400);
    expect(payload.code).toBe("BAD_REQUEST");
  });

  it("runs under SafeMode — findings carry the safe-mode evidence", async () => {
    const { payload } = await handleQualityRun({ auditorId: "whatsapp" });
    const evidence = payload.result!.findings.flatMap((f) => f.evidence).join(" ");
    expect(evidence).toContain("safeMode=true");
    expect(evidence).toContain("allowSideEffects=false");
  });
});
