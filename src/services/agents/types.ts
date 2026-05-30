/**
 * AI Agents Admin — shared types (Phase 1).
 *
 * These types describe the structured, code-defined shape of an Agent Profile.
 * They are the in-code mirror of the `AgentProfile` Prisma model and the future
 * "Admin → AI Agents" editor. Each agent's professional identity is expressed as
 * independent, structured sections (NOT one giant prompt string) so it migrates
 * cleanly to DB rows and to editable UI fields.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SOURCE-OF-TRUTH PRECEDENCE (must never be violated)
 * ──────────────────────────────────────────────────────────────────────────────
 *   1. Hardcoded safety / protocol rules = the IMMUTABLE FLOOR.
 *        • src/lib/agent/protocol.ts            → ABSOLUTE_RULES
 *        • src/services/ai/waiter/WaiterAgentProfile.ts → SAFETY_BOUNDARIES
 *      These are never overridable from the database, ever.
 *   2. Master AgentProfile (these structures) may ENRICH behavior.
 *   3. RestaurantAgentProfileOverride may PERSONALIZE tone only — it can NEVER
 *      override safety / forbidden rules.
 *
 * RUNTIME USE IS DISABLED in Phase 1. Nothing here is read by the Waiter runtime.
 * The Waiter still reads exclusively from its code-defined constitution. The
 * `AGENT_PROFILE_DB_ENABLED` flag (default OFF) gates any future DB-driven runtime.
 */

// ── Enums (mirror the Prisma enums; duplicated as string unions so non-Prisma
//    code and the future Admin UI can use them without importing @prisma/client) ──

export type AgentArea =
  | "ORCHESTRATOR"
  | "SECURITY"
  | "WAITER"
  | "WHATSAPP"
  | "CRM"
  | "UI_UX"
  | "MANUAL"
  | "QA"
  | "INTEGRATION"
  | "BRANDING"
  | "ANALYTICS"
  | "GENERAL";

export type AgentStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type AgentVisibility = "INTERNAL" | "RESTAURANT" | "PUBLIC";

/** A "what good vs bad looks like" example used to steer behavior. */
export interface AgentExample {
  customerSays: string;
  good: string;
  bad: string;
}

/**
 * The full, structured agent profile as defined in code.
 * Maps 1:1 to the `AgentProfile` Prisma model. Field names match exactly so the
 * seed and the future Admin editor share one shape.
 *
 * Fields marked INTERNAL ONLY must never be exposed to or edited by restaurant
 * users (Q16/Q17 of the RAIO-X).
 */
export interface AgentProfileDefinition {
  slug: string;
  name: string;
  title?: string;
  area: AgentArea;
  description?: string;

  // ── Professional identity ──
  mission?: string;
  objectives: string[];
  responsibilities: string[];
  skills: string[];
  allowedActions: string[];
  /** INTERNAL ONLY — hard safety boundaries, never restaurant-editable. */
  forbiddenActions: string[];
  tools: string[];
  /** Plain string labels in Phase 1; real knowledge links arrive in Phase 4. */
  knowledgeAreas: string[];
  interfaceContext?: string;
  businessRules: string[];
  /** INTERNAL ONLY — the immutable safety floor mirror. */
  safetyRules: string[];
  escalationRules: string[];
  promptInstructions?: string;
  outputRules: string[];
  evaluationCriteria: string[];

  /**
   * Agent-specific rich sections that do not (yet) deserve dedicated columns.
   * For the Waiter this holds salesPrinciples, menuReadingRules, examples, etc.
   */
  extendedSections?: Record<string, unknown>;

  // ── Governance / lifecycle ──
  status: AgentStatus;
  visibility: AgentVisibility;
  isGlobalDefault: boolean;
  /** Per-agent DB-runtime kill-switch. OFF in Phase 1. */
  isRuntimeEnabled: boolean;
  version: string;
  source?: string;
}

/**
 * A "public-safe" projection of an agent profile — what a RESTAURANT admin may
 * see. Strips every INTERNAL-ONLY field (forbiddenActions, safetyRules, raw
 * promptInstructions). Used by future restaurant-facing reads.
 */
export type RestaurantSafeAgentProfile = Omit<
  AgentProfileDefinition,
  "forbiddenActions" | "safetyRules" | "promptInstructions"
>;

/**
 * Admin (internal) read view of an agent profile. Same structured content plus
 * DB metadata when available (null when served from the code registry).
 * INTERNAL ONLY — never sent to restaurant users.
 */
export type AdminAgentProfileView = AgentProfileDefinition & {
  /** ISO timestamp from the DB row, or null when served from the code registry. */
  updatedAt: string | null;
  /** Where the view was sourced: "db" or "code". */
  origin: "db" | "code";
};

