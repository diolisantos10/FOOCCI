import { describe, it, expect } from "vitest";
import {
  WAITER_RUNTIME_COMPONENTS,
  WAITER_RUNTIME_SERVICES,
  WAITER_RUNTIME_TEST_GROUPS,
  componentsForTab,
  runtimeMergeSummary,
  INTELLIGENCE_LABELS,
  MERGE_STATUS_LABELS,
} from "./waiterRuntimeMap";

describe("waiterRuntimeMap — components", () => {
  it("includes the core real Waiter pieces", () => {
    const titles = WAITER_RUNTIME_COMPONENTS.map((c) => c.title);
    expect(titles).toContain("WaiterAgentProfile");
    expect(titles).toContain("WaiterBrainV2");
    expect(titles).toContain("WaiterBrain (v1)");
    expect(titles).toContain("PromptBuilderService");
    expect(titles).toContain("AIOrderService");
    expect(titles).toContain("Waiter Test Center");
  });

  it("marks WaiterAgentProfile as a source of truth and the Library as not-connected", () => {
    const profile = WAITER_RUNTIME_COMPONENTS.find((c) => c.title === "WaiterAgentProfile");
    expect(profile?.sourceOfTruth).toBe(true);
    const lib = WAITER_RUNTIME_COMPONENTS.find((c) => c.category === "Library");
    expect(lib?.productionStatus).toBe("NOT_RUNTIME");
    expect(lib?.mergeStatus).toBe("NOT_CONNECTED");
  });

  it("every component has a known tab + a PT label for its enums", () => {
    for (const c of [...WAITER_RUNTIME_COMPONENTS, ...WAITER_RUNTIME_SERVICES]) {
      expect(INTELLIGENCE_LABELS[c.intelligenceType]).toBeTruthy();
      expect(MERGE_STATUS_LABELS[c.mergeStatus]).toBeTruthy();
      expect(c.filePath.length).toBeGreaterThan(0);
    }
  });
});

describe("waiterRuntimeMap — helpers", () => {
  it("componentsForTab filters by home tab", () => {
    const brain = componentsForTab("Brain & Skills").map((c) => c.title);
    expect(brain).toContain("WaiterBrainV2");
    expect(brain).toContain("WaiterBrain (v1)");
    expect(componentsForTab("Perfil").some((c) => c.title === "WaiterAgentProfile")).toBe(true);
  });

  it("runtimeMergeSummary counts production + sources of truth + mirrored", () => {
    const s = runtimeMergeSummary();
    expect(s.total).toBe(WAITER_RUNTIME_COMPONENTS.length + WAITER_RUNTIME_SERVICES.length);
    expect(s.production).toBeGreaterThan(0);
    expect(s.sourceOfTruth).toBeGreaterThanOrEqual(2);
    expect(s.notConnected).toBeGreaterThanOrEqual(1);
  });

  it("exposes the 10 real Test Center groups", () => {
    expect(WAITER_RUNTIME_TEST_GROUPS.length).toBe(10);
    expect(WAITER_RUNTIME_TEST_GROUPS.map((g) => g.id)).toContain("no_hallucination");
  });
});
