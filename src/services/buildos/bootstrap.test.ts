/**
 * Bootstrap plan tests (pure, no DB): validation + canonical normalization.
 * The DB writes (runBootstrap apply mode), verification and simulated intake are
 * exercised by the CLI scripts against a real database.
 */

import { describe, it, expect } from "vitest";
import { prepareBootstrapPlan } from "./BuildOSBootstrapService";

describe("prepareBootstrapPlan", () => {
  it("normalizes the phone with runtime logic and defaults name/role", () => {
    const plan = prepareBootstrapPlan({ phone: " +55 (11) 99999-0000 " });
    expect(plan.normalizedPhone).toBe("+5511999990000");
    expect(plan.rawPhone).toBe("+55 (11) 99999-0000");
    expect(plan.name).toBe("Diego");
    expect(plan.role).toBe("OWNER");
    expect(plan.actions.length).toBeGreaterThan(0);
  });

  it("honors provided name/role", () => {
    const plan = prepareBootstrapPlan({ phone: "+5511999990000", name: "Ana", role: "ADMIN" });
    expect(plan.name).toBe("Ana");
    expect(plan.role).toBe("ADMIN");
  });

  it("throws on missing/invalid phone (no guessing)", () => {
    expect(() => prepareBootstrapPlan({ phone: "" })).toThrow();
    expect(() => prepareBootstrapPlan({ phone: "abc" })).toThrow();
    expect(() => prepareBootstrapPlan({ phone: "123" })).toThrow(); // too short
  });
});
