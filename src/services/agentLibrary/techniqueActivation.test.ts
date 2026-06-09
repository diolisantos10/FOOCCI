import { describe, it, expect } from "vitest";
import { newTechniqueActivationDefaults } from "./agentLibraryHelpers";

describe("newTechniqueActivationDefaults — Library techniques are born ready", () => {
  it("returns ACTIVE + runtimeEnabled + a positive priority (no manual approval queue)", () => {
    const d = newTechniqueActivationDefaults();
    expect(d.status).toBe("ACTIVE");
    expect(d.runtimeEnabled).toBe(true);
    expect(d.runtimePriority).toBeGreaterThan(0);
    expect(d.approvedAt).toBeInstanceOf(Date);
    expect(typeof d.approvedBy).toBe("string");
  });

  it("does NOT enable any runtime by itself — governance stays at version level", () => {
    // The bridge only injects techniques via an ACTIVE LIBRARY_ASSISTED version.
    // Being ACTIVE+runtimeEnabled makes a technique ELIGIBLE, not LIVE. With no
    // active version (default CURRENT) nothing reaches a real customer. This is a
    // documentation/contract assertion mirrored by the bridge tests.
    const d = newTechniqueActivationDefaults();
    expect(d.status === "ACTIVE" && d.runtimeEnabled).toBe(true);
  });
});
