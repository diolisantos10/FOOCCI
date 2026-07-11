/**
 * Unit tests for updateAgentProfile (Ficha Técnica PATCH — service level).
 *
 * Prisma is mocked: no DB, no runtime. Asserts the merge contract:
 *   • unknown slug (sem row e sem default de código) → null, nada é escrito;
 *   • sem row no DB → base é o default de código, patch por cima;
 *   • com row no DB → base é a row (DB-first), patch por cima;
 *   • campos ausentes/undefined no patch nunca apagam seções existentes;
 *   • safetyRules/isRuntimeEnabled são preservados (nunca vêm do patch);
 *   • grava source=MANUAL + updatedBy e retorna a view com origin "db".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentProfileDefinition } from "./types";

const db = vi.hoisted(() => ({
  agentProfile: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { updateAgentProfile } from "./AgentProfileService";
import { getDefaultAgentProfileBySlug } from "./defaultAgentProfiles";

/** Builds a plausible Prisma row from a definition (what findUnique returns). */
function rowFromDefinition(
  def: AgentProfileDefinition,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "row_1",
    slug: def.slug,
    name: def.name,
    title: def.title ?? null,
    area: def.area,
    description: def.description ?? null,
    mission: def.mission ?? null,
    objectives: def.objectives,
    responsibilities: def.responsibilities,
    skills: def.skills,
    allowedActions: def.allowedActions,
    forbiddenActions: def.forbiddenActions,
    tools: def.tools,
    knowledgeAreas: def.knowledgeAreas,
    interfaceContext: def.interfaceContext ?? null,
    businessRules: def.businessRules,
    safetyRules: def.safetyRules,
    escalationRules: def.escalationRules,
    promptInstructions: def.promptInstructions ?? null,
    outputRules: def.outputRules,
    evaluationCriteria: def.evaluationCriteria,
    extendedSections: def.extendedSections ?? null,
    status: def.status,
    visibility: def.visibility,
    isGlobalDefault: def.isGlobalDefault,
    isRuntimeEnabled: def.isRuntimeEnabled,
    version: def.version,
    source: def.source ?? "CODE_SEED",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-07-11T12:00:00Z"),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

beforeEach(() => {
  db.agentProfile.findUnique.mockReset();
  db.agentProfile.upsert.mockReset();
  // upsert echoes back what was written, plus row metadata.
  db.agentProfile.upsert.mockImplementation(
    async ({ create }: { create: Record<string, unknown> }) => ({
      id: "row_1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-07-11T12:00:00Z"),
      createdBy: null,
      ...create,
    }),
  );
});

describe("updateAgentProfile (service, prisma mockado)", () => {
  it("returns null for an unknown slug (no DB row, no code default) and writes nothing", async () => {
    db.agentProfile.findUnique.mockResolvedValue(null);
    const result = await updateAgentProfile("agente-que-nao-existe", {
      mission: "não deve salvar",
    });
    expect(result).toBeNull();
    expect(db.agentProfile.upsert).not.toHaveBeenCalled();
  });

  it("without a DB row, merges the patch over the code default and upserts", async () => {
    db.agentProfile.findUnique.mockResolvedValue(null);
    const waiterDefault = getDefaultAgentProfileBySlug("waiter")!;

    const result = await updateAgentProfile(
      "waiter",
      {
        mission: "Nova missão do garçom",
        forbiddenActions: ["Nunca inventar produto", "Nunca prometer prazo"],
      },
      "Diolinaldo",
    );

    expect(db.agentProfile.upsert).toHaveBeenCalledTimes(1);
    const args = db.agentProfile.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ slug: "waiter" });

    // Patch applied
    expect(args.create.mission).toBe("Nova missão do garçom");
    expect(args.create.forbiddenActions).toEqual([
      "Nunca inventar produto",
      "Nunca prometer prazo",
    ]);
    // Untouched sections preserved from the code default
    expect(args.create.responsibilities).toEqual(waiterDefault.responsibilities);
    expect(args.create.safetyRules).toEqual(waiterDefault.safetyRules);
    expect(args.create.isRuntimeEnabled).toBe(waiterDefault.isRuntimeEnabled);
    // Audit trail
    expect(args.create.source).toBe("MANUAL");
    expect(args.create.updatedBy).toBe("Diolinaldo");
    // create and update write the same payload (idempotent upsert)
    expect(args.update).toEqual(args.create);

    // Returned view reflects the saved row
    expect(result).not.toBeNull();
    expect(result!.origin).toBe("db");
    expect(result!.mission).toBe("Nova missão do garçom");
    expect(result!.updatedAt).toBe("2026-07-11T12:00:00.000Z");
  });

  it("with an existing DB row, the row (not the code default) is the merge base", async () => {
    const waiterDefault = getDefaultAgentProfileBySlug("waiter")!;
    db.agentProfile.findUnique.mockResolvedValue(
      rowFromDefinition(waiterDefault, {
        name: "Waiter Customizado",
        mission: "Missão já editada antes",
      }),
    );

    const result = await updateAgentProfile("waiter", {
      businessRules: ["Só recomenda itens do cardápio real"],
    });

    const args = db.agentProfile.upsert.mock.calls[0][0];
    // Base came from the DB row, not from the code default
    expect(args.create.name).toBe("Waiter Customizado");
    expect(args.create.mission).toBe("Missão já editada antes");
    // Patch applied on top
    expect(args.create.businessRules).toEqual([
      "Só recomenda itens do cardápio real",
    ]);
    expect(result!.name).toBe("Waiter Customizado");
  });

  it("undefined patch fields never wipe existing content; slug is never editable", async () => {
    db.agentProfile.findUnique.mockResolvedValue(null);
    const crmDefault = getDefaultAgentProfileBySlug("crm")!;

    await updateAgentProfile("crm", {
      mission: undefined,
      escalationRules: ["Escala para humano em reclamação de cobrança"],
    });

    const args = db.agentProfile.upsert.mock.calls[0][0];
    expect(args.create.mission).toBe(crmDefault.mission ?? null);
    expect(args.create.escalationRules).toEqual([
      "Escala para humano em reclamação de cobrança",
    ]);
    expect(args.create.slug).toBe("crm");
  });
});
