/**
 * AgentProfileService — typed access to AI Agent Profiles (Phase 1).
 *
 * Phase-1 contract (READ THIS BEFORE WIRING ANYTHING TO RUNTIME):
 *   • The Waiter runtime is NOT changed and does NOT read from here.
 *   • Code is the canonical source. The DB is a seed/Admin mirror only.
 *   • DB-driven runtime is gated by `isAgentProfileDbEnabled()` (env flag,
 *     default OFF) AND by each profile's `isRuntimeEnabled` (default OFF).
 *     Both are OFF in Phase 1, so `buildAgentSystemContext()` always returns
 *     the code-defined directive — identical to today's behavior.
 *
 * SAFETY: `forbiddenActions` and `safetyRules` are INTERNAL/master-only. The
 * `toRestaurantSafe()` projection strips them for any restaurant-facing read.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  DEFAULT_AGENT_PROFILES,
  WAITER_DEFAULT_PROFILE,
  getDefaultAgentProfileBySlug,
} from "./defaultAgentProfiles";
import type {
  AgentProfileDefinition,
  AdminAgentProfileView,
  RestaurantSafeAgentProfile,
} from "./types";

// ── Feature flag ────────────────────────────────────────────────────────────────

/**
 * Master kill-switch for DB-driven agent runtime.
 *
 * DEFAULT OFF. Only `"true"` (case-insensitive) enables it. Until a deliberate
 * Phase-3 rollout, this stays OFF and the agent runtime ignores the database
 * entirely. Documented in `.env.example` as AGENT_PROFILE_DB_ENABLED.
 */
export function isAgentProfileDbEnabled(): boolean {
  return (process.env.AGENT_PROFILE_DB_ENABLED ?? "").toLowerCase() === "true";
}

// ── Code-defined reads (always safe, no DB) ─────────────────────────────────────

/** All code-defined default profiles (the canonical registry). */
export function getDefaultAgentProfiles(): readonly AgentProfileDefinition[] {
  return DEFAULT_AGENT_PROFILES;
}

/** The Waiter default profile — the Phase-1 priority agent. */
export function getWaiterDefaultProfile(): AgentProfileDefinition {
  return WAITER_DEFAULT_PROFILE;
}

/** Strip INTERNAL-only fields for restaurant-facing reads. */
export function toRestaurantSafe(
  profile: AgentProfileDefinition,
): RestaurantSafeAgentProfile {
  const { forbiddenActions, safetyRules, promptInstructions, ...safe } = profile;
  void forbiddenActions;
  void safetyRules;
  void promptInstructions;
  return safe;
}

// ── DB-aware reads (data/Admin only — never gates runtime in Phase 1) ───────────

/**
 * Resolve a single agent profile by slug.
 *
 * Phase 1: when the DB flag is OFF (default) this returns the code-defined
 * default directly. When ON, it reads the DB row and falls back to code if the
 * row is missing. Either way, this is for DATA/Admin use — it does not by itself
 * change any runtime behavior.
 */
export async function getAgentProfile(
  slug: string,
): Promise<AgentProfileDefinition | null> {
  const codeDefault = getDefaultAgentProfileBySlug(slug) ?? null;

  if (!isAgentProfileDbEnabled()) return codeDefault;

  try {
    const row = await prisma.agentProfile.findUnique({ where: { slug } });
    if (!row) return codeDefault;
    return rowToDefinition(row);
  } catch {
    // DB unavailable / table not migrated yet → never break callers.
    return codeDefault;
  }
}

/**
 * All ACTIVE agent profiles. Falls back to the code registry when the DB flag is
 * OFF or the DB is unavailable.
 */
export async function getActiveAgentProfiles(): Promise<AgentProfileDefinition[]> {
  if (!isAgentProfileDbEnabled()) {
    return DEFAULT_AGENT_PROFILES.filter((p) => p.status === "ACTIVE");
  }
  try {
    const rows = await prisma.agentProfile.findMany({
      where: { status: "ACTIVE" },
      orderBy: { area: "asc" },
    });
    if (rows.length === 0) {
      return DEFAULT_AGENT_PROFILES.filter((p) => p.status === "ACTIVE");
    }
    return rows.map(rowToDefinition);
  } catch {
    return DEFAULT_AGENT_PROFILES.filter((p) => p.status === "ACTIVE");
  }
}

// ── Admin (internal) reads — ALL agents, with DB metadata when available ─────────
//
// These power the internal Admin → Agents area (read-only). They return EVERY
// agent (including DRAFT placeholders), never filter by status, and carry the
// full structured content INCLUDING internal-only safety fields — that area is
// admin-only and never exposed to restaurant users.

/** Map a code-defined default into the admin view shape (no DB metadata). */
function defaultToAdminView(def: AgentProfileDefinition): AdminAgentProfileView {
  return { ...def, updatedAt: null, origin: "code" };
}

/**
 * Every agent profile for the internal admin overview. DB-aware: when the flag
 * is ON and rows exist, returns DB rows (with updatedAt); otherwise falls back
 * to the full code registry. Never throws.
 */
export async function getAdminAgentProfiles(): Promise<AdminAgentProfileView[]> {
  if (!isAgentProfileDbEnabled()) {
    return DEFAULT_AGENT_PROFILES.map(defaultToAdminView);
  }
  try {
    const rows = await prisma.agentProfile.findMany({ orderBy: { area: "asc" } });
    if (rows.length === 0) return DEFAULT_AGENT_PROFILES.map(defaultToAdminView);
    return rows.map((row) => ({
      ...rowToDefinition(row),
      updatedAt: row.updatedAt.toISOString(),
      origin: "db" as const,
    }));
  } catch {
    return DEFAULT_AGENT_PROFILES.map(defaultToAdminView);
  }
}

/**
 * A single agent profile for the internal admin detail view, by slug.
 * DB-aware with code fallback. Returns null only when the slug is unknown.
 */
export async function getAdminAgentProfile(
  slug: string,
): Promise<AdminAgentProfileView | null> {
  const codeDefault = getDefaultAgentProfileBySlug(slug);
  const codeView = codeDefault ? defaultToAdminView(codeDefault) : null;

  if (!isAgentProfileDbEnabled()) return codeView;

  try {
    const row = await prisma.agentProfile.findUnique({ where: { slug } });
    if (!row) return codeView;
    return {
      ...rowToDefinition(row),
      updatedAt: row.updatedAt.toISOString(),
      origin: "db",
    };
  } catch {
    return codeView;
  }
}



/**
 * Build the system-context directive for an agent — the future single entry
 * point the runtime will call once DB-driven profiles are enabled.
 *
 * Phase 1 behavior: ALWAYS returns the code-defined `promptInstructions`
 * (identical to today). The DB branch is intentionally inert until BOTH the env
 * flag and the profile's `isRuntimeEnabled` are turned on in Phase 3. This keeps
 * the Waiter runtime byte-for-byte unchanged while giving callers a stable API.
 *
 * @param restaurantContext reserved for Phase 3 (tone/override personalization).
 */
export async function buildAgentSystemContext(
  slug: string,
  restaurantContext?: { restaurantId: string },
): Promise<string> {
  void restaurantContext; // reserved — overrides are applied in Phase 3, never here.

  const codeDefault = getDefaultAgentProfileBySlug(slug);
  const codeDirective = codeDefault?.promptInstructions ?? "";

  // Phase 1 guard: DB never drives the directive.
  if (!isAgentProfileDbEnabled()) return codeDirective;

  try {
    const row = await prisma.agentProfile.findUnique({ where: { slug } });
    // Even with the env flag ON, a profile only drives runtime when explicitly
    // marked `isRuntimeEnabled`. Otherwise we keep the code directive.
    if (!row || !row.isRuntimeEnabled || !row.promptInstructions) {
      return codeDirective;
    }
    return row.promptInstructions;
  } catch {
    return codeDirective;
  }
}

// ── Seed (safe, idempotent, additive) ───────────────────────────────────────────

/**
 * Seed the code-defined registry into the database.
 *
 * Idempotent: upserts by slug, so re-running refreshes content without creating
 * duplicates. Writes data ONLY — does not enable runtime, does not touch any
 * restaurant config, does not alter the Waiter flow. Safe to run any time.
 */
export async function seedDefaultAgentProfiles(): Promise<{
  created: number;
  updated: number;
}> {
  let created = 0;
  let updated = 0;

  for (const def of DEFAULT_AGENT_PROFILES) {
    const existing = await prisma.agentProfile.findUnique({
      where: { slug: def.slug },
      select: { id: true },
    });

    const data = definitionToRow(def);
    await prisma.agentProfile.upsert({
      where: { slug: def.slug },
      create: data,
      update: data,
    });

    if (existing) updated += 1;
    else created += 1;
  }

  return { created, updated };
}

// ── Mappers ─────────────────────────────────────────────────────────────────────

/** AgentProfileDefinition → Prisma create/update payload. */
function definitionToRow(def: AgentProfileDefinition) {
  return {
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
    extendedSections: (def.extendedSections ??
      Prisma.JsonNull) as Prisma.InputJsonValue,
    status: def.status,
    visibility: def.visibility,
    isGlobalDefault: def.isGlobalDefault,
    isRuntimeEnabled: def.isRuntimeEnabled,
    version: def.version,
    source: def.source ?? "CODE_SEED",
  };
}

/** Prisma row → AgentProfileDefinition (tolerant of Json typing). */
function rowToDefinition(row: {
  slug: string;
  name: string;
  title: string | null;
  area: string;
  description: string | null;
  mission: string | null;
  objectives: unknown;
  responsibilities: unknown;
  skills: unknown;
  allowedActions: unknown;
  forbiddenActions: unknown;
  tools: unknown;
  knowledgeAreas: unknown;
  interfaceContext: string | null;
  businessRules: unknown;
  safetyRules: unknown;
  escalationRules: unknown;
  promptInstructions: string | null;
  outputRules: unknown;
  evaluationCriteria: unknown;
  extendedSections: unknown;
  status: string;
  visibility: string;
  isGlobalDefault: boolean;
  isRuntimeEnabled: boolean;
  version: string;
  source: string | null;
}): AgentProfileDefinition {
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? (v as unknown[]).map(String) : [];

  return {
    slug: row.slug,
    name: row.name,
    title: row.title ?? undefined,
    area: row.area as AgentProfileDefinition["area"],
    description: row.description ?? undefined,
    mission: row.mission ?? undefined,
    objectives: list(row.objectives),
    responsibilities: list(row.responsibilities),
    skills: list(row.skills),
    allowedActions: list(row.allowedActions),
    forbiddenActions: list(row.forbiddenActions),
    tools: list(row.tools),
    knowledgeAreas: list(row.knowledgeAreas),
    interfaceContext: row.interfaceContext ?? undefined,
    businessRules: list(row.businessRules),
    safetyRules: list(row.safetyRules),
    escalationRules: list(row.escalationRules),
    promptInstructions: row.promptInstructions ?? undefined,
    outputRules: list(row.outputRules),
    evaluationCriteria: list(row.evaluationCriteria),
    extendedSections:
      row.extendedSections && typeof row.extendedSections === "object"
        ? (row.extendedSections as Record<string, unknown>)
        : undefined,
    status: row.status as AgentProfileDefinition["status"],
    visibility: row.visibility as AgentProfileDefinition["visibility"],
    isGlobalDefault: row.isGlobalDefault,
    isRuntimeEnabled: row.isRuntimeEnabled,
    version: row.version,
    source: row.source ?? undefined,
  };
}
