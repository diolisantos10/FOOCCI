/**
 * CrmAgentProfile — unit tests for the CRM Agent professional constitution.
 *
 * Pure module tests — no DB, no network, no send paths.
 * Verifies: non-empty required sections, directive compilation, safety content,
 * registry wiring, and runtime-disabled flag.
 */

import { describe, it, expect } from "vitest";

import {
  CRM_AGENT_PROFILE,
  buildCrmProfileDirective,
  CRM_MISSION,
  CRM_OBJECTIVES,
  CRM_RESPONSIBILITIES,
  CRM_WHATSAPP_SAFETY_RULES,
  CRM_CANNOT_DO,
} from "../CrmAgentProfile";

import {
  DEFAULT_AGENT_PROFILES,
  getDefaultAgentProfileBySlug,
} from "@/services/agents/defaultAgentProfiles";

// ── Required sections are non-empty ──────────────────────────────────────────

describe("CRM_AGENT_PROFILE required sections", () => {
  it("has a non-empty role and mission", () => {
    expect(CRM_AGENT_PROFILE.role.length).toBeGreaterThan(10);
    expect(CRM_MISSION.length).toBeGreaterThan(10);
  });

  it("has at least 5 objectives", () => {
    expect(CRM_OBJECTIVES.length).toBeGreaterThanOrEqual(5);
  });

  it("has at least 5 responsibilities", () => {
    expect(CRM_RESPONSIBILITIES.length).toBeGreaterThanOrEqual(5);
  });

  it("has whatsAppSafetyRules covering opt-out and cooldown", () => {
    const rules = CRM_WHATSAPP_SAFETY_RULES.join(" ").toLowerCase();
    expect(rules).toMatch(/opt-out/);
    expect(rules).toMatch(/cooldown/);
  });

  it("forbids inventing offers and customer facts", () => {
    const forbidden = CRM_CANNOT_DO.join(" ").toLowerCase();
    expect(forbidden).toMatch(/inventar/);
    expect(forbidden).toMatch(/ofertas|cupons|descontos/);
    expect(forbidden).toMatch(/fatos/);
  });

  it("has examples covering good and bad patterns", () => {
    expect(CRM_AGENT_PROFILE.examples.length).toBeGreaterThanOrEqual(2);
    for (const ex of CRM_AGENT_PROFILE.examples) {
      expect(ex.good.length).toBeGreaterThan(0);
      expect(ex.bad.length).toBeGreaterThan(0);
    }
    // Bad examples should never appear as "good"
    const goods = CRM_AGENT_PROFILE.examples.map((e) => e.good.toLowerCase());
    expect(goods.some((g) => g.includes("🔥") && g.includes("imperdível"))).toBe(false);
  });
});

// ── Directive compiler ────────────────────────────────────────────────────────

describe("buildCrmProfileDirective()", () => {
  const directive = buildCrmProfileDirective();

  it("compiles to a non-empty string (>200 chars)", () => {
    expect(directive.length).toBeGreaterThan(200);
  });

  it("frames the CRM Agent as a relationship manager, not a spam bot", () => {
    expect(directive).toMatch(/GERENTE DE RELACIONAMENTO/i);
    expect(directive).toMatch(/NÃO\s+SPAM\s+BOT/i);
  });

  it("includes opt-out language in the WhatsApp safety section", () => {
    expect(directive).toMatch(/opt-out/i);
  });

  it("includes cooldown language", () => {
    expect(directive).toMatch(/cooldown/i);
  });

  it("includes language prohibiting invented offers", () => {
    expect(directive).toMatch(/inventar/i);
  });

  it("includes LGPD reference", () => {
    expect(directive).toMatch(/lgpd/i);
  });

  it("includes WhatsApp safety header section", () => {
    expect(directive).toMatch(/SEGURANÇA WHATSAPP/i);
  });

  it("includes absolute limits section", () => {
    expect(directive).toMatch(/LIMITES ABSOLUTOS/i);
  });
});

// ── Registry wiring ───────────────────────────────────────────────────────────

describe("defaultAgentProfiles CRM entry", () => {
  const crmProfile = getDefaultAgentProfileBySlug("crm");

  it("CRM profile exists in DEFAULT_AGENT_PROFILES", () => {
    const slugs = DEFAULT_AGENT_PROFILES.map((p) => p.slug);
    expect(slugs).toContain("crm");
  });

  it("CRM profile is no longer an empty DRAFT placeholder", () => {
    expect(crmProfile).toBeDefined();
    expect(crmProfile!.status).toBe("ACTIVE");
    expect(crmProfile!.objectives.length).toBeGreaterThan(0);
    expect(crmProfile!.responsibilities.length).toBeGreaterThan(0);
    expect(crmProfile!.businessRules.length).toBeGreaterThan(0);
    expect(crmProfile!.safetyRules.length).toBeGreaterThan(0);
  });

  it("CRM profile has isRuntimeEnabled = false (Phase 1)", () => {
    expect(crmProfile!.isRuntimeEnabled).toBe(false);
  });

  it("CRM profile visibility is INTERNAL", () => {
    expect(crmProfile!.visibility).toBe("INTERNAL");
  });

  it("CRM profile source is CODE_SEED", () => {
    expect(crmProfile!.source).toBe("CODE_SEED");
  });

  it("CRM profile has a promptInstructions block from buildCrmProfileDirective", () => {
    expect(crmProfile!.promptInstructions).toBeTruthy();
    expect(crmProfile!.promptInstructions!.length).toBeGreaterThan(100);
  });

  it("CRM profile forbiddenActions includes no-inventing rule", () => {
    const forbidden = crmProfile!.forbiddenActions.join(" ").toLowerCase();
    expect(forbidden).toMatch(/inventar/);
  });

  it("CRM profile safetyRules includes opt-out", () => {
    const safety = crmProfile!.safetyRules.join(" ").toLowerCase();
    expect(safety).toMatch(/opt-out/);
  });
});
