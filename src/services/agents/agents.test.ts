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

/**
 * Os quatro slots aposentados em 07/08/2026 por decisão do CEO, cada um com o
 * Essencial que ele duplicava. O motivo viaja junto com o slug de propósito:
 * um teste que só lista nomes proibidos vira enigma em dois meses, e quem não
 * entende a regra a remove em vez de obedecê-la.
 */
const APOSENTADOS = [
  { slug: "orchestrator",        duplicava: "cerebro" },
  { slug: "security-governance", duplicava: "seguranca" },
  { slug: "ui-ux",               duplicava: "interface + experiencia" },
  { slug: "qa-test",             duplicava: "qualidade" },
] as const;

/** O elenco que o registro DEVE ter depois do corte — exato, não "pelo menos". */
const ELENCO_ESPERADO = [
  // Os quatro com conteúdo real.
  "waiter",
  "crm",
  "whatsapp",
  "suporte-tecnico",
  // Os quatro placeholders que ficaram: não colidem com Essencial nenhum e
  // podem virar agente de produto de verdade.
  "manual-constitution",
  "integration",
  "branding",
  "analytics-product",
] as const;

describe("Agent registry (code-defined defaults)", () => {
  it("includes every expected agent slot", () => {
    const slugs = getDefaultAgentProfiles().map((p) => p.slug);
    for (const expected of ELENCO_ESPERADO) {
      expect(slugs).toContain(expected);
    }
  });

  /*
    ── O PORTÃO DO CORTE DE 07/08/2026, NAS DUAS METADES ──────────────────────

    Metade que REPROVA: um dos quatro nomes duplicados volta ao registro. A
    regressão real deste bloco não é alguém desfazer o corte de propósito — é
    alguém recriar o slot "por completude do organograma" daqui a dois meses,
    sem saber que o nome já pertence a um Essencial. O `.toBe(false)` com o
    motivo na mensagem é o que faz o teste ENSINAR em vez de só barrar.

    Metade que PASSA: os quatro placeholders que sobraram continuam presentes.
    Sem ela, apagar os OITO satisfaria o teste acima — e o estrago seria maior
    que o problema que este bloco existe para resolver (guardrail 5).
  */
  it.each(APOSENTADOS)(
    "`$slug` NÃO volta ao registro — duplica o Essencial $duplicava",
    ({ slug, duplicava }) => {
      const slugs = getDefaultAgentProfiles().map((p) => p.slug);
      expect(
        slugs.includes(slug),
        `"${slug}" voltou ao registro de agentes de produto. Esse trabalho é do ` +
          `Essencial "${duplicava}", que vive em .claude/agents e é protegido por ` +
          `elencoObrigatorio.test.ts. Dois nomes para o mesmo cargo foi o que o ` +
          `corte de 07/08/2026 apagou — não recrie o slot "por completude".`,
      ).toBe(false);
    },
  );

  it("os placeholders que NÃO colidem com Essencial continuam no registro", () => {
    // A metade que passa. Se esta falhar junto com a de cima, o corte passou do
    // ponto: alguém esvaziou o registro em vez de tirar os quatro duplicados.
    const slugs = getDefaultAgentProfiles().map((p) => p.slug);
    for (const mantido of ["manual-constitution", "integration", "branding", "analytics-product"]) {
      expect(
        slugs,
        `"${mantido}" não colide com nenhum Essencial e não deveria ter sido removido`,
      ).toContain(mantido);
    }
  });

  it("o registro é EXATAMENTE o elenco esperado — nem a mais, nem a menos", () => {
    // `toContain` não pega slot novo entrando calado. Este pega, e obriga quem
    // adiciona um agente de produto a passar por aqui e ler o bloco acima.
    const slugs = getDefaultAgentProfiles().map((p) => p.slug);
    expect([...slugs].sort()).toEqual([...ELENCO_ESPERADO].sort());
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

  it("the fully-defined agents (Waiter, CRM, WhatsApp, Suporte) are ACTIVE; the rest are DRAFT placeholders", () => {
    const ACTIVE_SLUGS = new Set(["waiter", "crm", "whatsapp", "suporte-tecnico"]);
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
