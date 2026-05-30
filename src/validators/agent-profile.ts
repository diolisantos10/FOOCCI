/**
 * Zod validators for AI Agent Profiles (Phase 1).
 *
 * Used by the future Admin → Agents API to validate writes, and by the seed to
 * assert the code-defined registry is well-formed. Safety fields are validated
 * but NOTE: write paths must additionally enforce that restaurant-level callers
 * can never set `forbiddenActions` / `safetyRules` (those are master-only).
 */

import { z } from "zod";

export const AGENT_AREAS = [
  "ORCHESTRATOR",
  "SECURITY",
  "WAITER",
  "WHATSAPP",
  "CRM",
  "UI_UX",
  "MANUAL",
  "QA",
  "INTEGRATION",
  "BRANDING",
  "ANALYTICS",
  "GENERAL",
] as const;

export const AGENT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export const AGENT_VISIBILITIES = ["INTERNAL", "RESTAURANT", "PUBLIC"] as const;

const stringList = z.array(z.string().max(500)).max(100);

export const agentExampleSchema = z.object({
  customerSays: z.string().max(500),
  good: z.string().max(1000),
  bad: z.string().max(1000),
});

/** Full agent profile definition (mirror of AgentProfileDefinition / Prisma model). */
export const agentProfileSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "slug deve ser kebab-case (a-z, 0-9, -)"),
  name: z.string().min(1).max(120),
  title: z.string().max(160).optional(),
  area: z.enum(AGENT_AREAS),
  description: z.string().max(2000).optional(),

  mission: z.string().max(2000).optional(),
  objectives: stringList,
  responsibilities: stringList,
  skills: stringList,
  allowedActions: stringList,
  forbiddenActions: stringList,
  tools: stringList,
  knowledgeAreas: stringList,
  interfaceContext: z.string().max(4000).optional(),
  businessRules: stringList,
  safetyRules: stringList,
  escalationRules: stringList,
  promptInstructions: z.string().max(8000).optional(),
  outputRules: stringList,
  evaluationCriteria: stringList,

  extendedSections: z.record(z.unknown()).optional(),

  status: z.enum(AGENT_STATUSES),
  visibility: z.enum(AGENT_VISIBILITIES),
  isGlobalDefault: z.boolean(),
  isRuntimeEnabled: z.boolean(),
  version: z.string().max(20),
  source: z.string().max(40).optional(),
});

/**
 * Restaurant-editable override. Deliberately exposes ONLY tone/voice + non-safety
 * additions. There is no field here that can touch forbiddenActions / safetyRules.
 */
export const restaurantAgentOverrideSchema = z.object({
  displayName: z.string().max(120).nullable().optional(),
  toneOverride: z.string().max(60).nullable().optional(),
  styleOverride: z.string().max(60).nullable().optional(),
  customInstructions: z.string().max(2000).nullable().optional(),
  enrichmentSections: z.record(z.unknown()).nullable().optional(),
  isEnabled: z.boolean().optional(),
});

export type AgentProfileInput = z.infer<typeof agentProfileSchema>;
export type RestaurantAgentOverrideInput = z.infer<
  typeof restaurantAgentOverrideSchema
>;
