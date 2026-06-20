/**
 * Phase-1 verification tests for the AI Agents foundation.
 *
 * These assert the *data/contract* guarantees of Phase 1 WITHOUT touching the
 * database or the Waiter runtime:
 *   • The code registry is well-formed and validates against the Zod schema.
 *   • The Waiter is represented structurally (rich content, real safety rules).
 *   • Safety fields exist and are stripped by the restaurant-safe projection.
 *   • The DB-runtime feature flag defaults OFF.
 *   • buildAgentSystemContext returns the code directive (runtime unchanged).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getDefaultAgentProfiles,
  getWaiterDefaultProfile,
  toRestaurantSafe,
  isAgentProfileDbEnabled,
  buildAgentSystemContext,
} from "../agents/AgentProfileService";
import { agentProfileSchema } from "@/validators/agent-profile";
import { buildWaiterProfileDirective } from "@/services/ai/waiter/WaiterAgentProfile";

describe("Agent registry (code-defined defaults)", () => {
  it("includes every expected agent slot", () => {
    const slugs = getDefaultAgentProfiles().map((p) => p.slug);
    for (const expected of [
      "waiter",
      "orchestrator",
      "security-governance",
      "whatsapp",
      "crm",
      "ui-ux",
      "manual-constitution",
      "qa-test",
      "integration",
      "branding",
      "analytics-product",
    ]) {
      expect(slugs).toContain(expected);
    }
  });

  it("has unique slugs", () => {
    const slugs = getDefaultAgentProfiles().map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every profile validates against the Zod schema", () => {
    for (const profile of getDefaultAgentProfiles()) {
      const result = agentProfileSchema.safeParse(profile);
      expect(result.success, `profile ${profile.slug} failed validation`).toBe(
        true,
      );
    }
  });

  it("the fully-defined agents (Waiter, CRM, WhatsApp) are ACTIVE; the rest are DRAFT placeholders", () => {
    const ACTIVE_SLUGS = new Set(["waiter", "crm", "whatsapp"]);
    for (const profile of getDefaultAgentProfiles()) {
      if (ACTIVE_SLUGS.has(profile.slug)) expect(profile.status).toBe("ACTIVE");
      else expect(profile.status).toBe("DRAFT");
    }
  });
});

describe("Waiter profile is represented structurally", () => {
  const waiter = getWaiterDefaultProfile();

  it("carries rich identity sections", () => {
    expect(waiter.mission).toBeTruthy();
    expect(waiter.objectives.length).toBeGreaterThan(3);
    expect(waiter.responsibilities.length).toBeGreaterThan(3);
    expect(waiter.businessRules.length).toBeGreaterThan(5);
  });

  it("preserves the code-defined safety boundaries", () => {
    expect(waiter.safetyRules.length).toBeGreaterThan(0);
    expect(waiter.forbiddenActions.length).toBeGreaterThan(0);
    // A known hard rule from the constitution must be present.
    expect(waiter.forbiddenActions.join(" ")).toContain("preços");
  });

  it("keeps the compiled directive identical to the code constitution", () => {
    expect(waiter.promptInstructions).toBe(buildWaiterProfileDirective());
  });

  it("exposes Waiter-specific extended sections", () => {
    expect(waiter.extendedSections).toBeDefined();
    expect(waiter.extendedSections).toHaveProperty("menuReadingRules");
    expect(waiter.extendedSections).toHaveProperty("examples");
  });
});

describe("Safety isolation (restaurant-safe projection)", () => {
  it("strips INTERNAL-only fields", () => {
    const safe = toRestaurantSafe(getWaiterDefaultProfile()) as Record<
      string,
      unknown
    >;
    expect(safe).not.toHaveProperty("forbiddenActions");
    expect(safe).not.toHaveProperty("safetyRules");
    expect(safe).not.toHaveProperty("promptInstructions");
    // Non-safety identity remains visible.
    expect(safe).toHaveProperty("mission");
    expect(safe).toHaveProperty("objectives");
  });
});

describe("Runtime is NOT changed in Phase 1", () => {
  beforeEach(() => {
    delete process.env.AGENT_PROFILE_DB_ENABLED;
  });

  it("DB-runtime flag defaults OFF", () => {
    expect(isAgentProfileDbEnabled()).toBe(false);
  });

  it("flag only turns on for an explicit 'true'", () => {
    process.env.AGENT_PROFILE_DB_ENABLED = "1";
    expect(isAgentProfileDbEnabled()).toBe(false);
    process.env.AGENT_PROFILE_DB_ENABLED = "true";
    expect(isAgentProfileDbEnabled()).toBe(true);
    delete process.env.AGENT_PROFILE_DB_ENABLED;
  });

  it("buildAgentSystemContext returns the code directive (flag OFF)", async () => {
    const directive = await buildAgentSystemContext("waiter");
    expect(directive).toBe(buildWaiterProfileDirective());
  });

  it("buildAgentSystemContext is empty for unknown agents (no throw)", async () => {
    const directive = await buildAgentSystemContext("does-not-exist");
    expect(directive).toBe("");
  });
});
