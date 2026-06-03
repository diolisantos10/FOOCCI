/**
 * BuildProjectService — BuildProject registry + deterministic resolution (Pri 1.2).
 *
 * Project-agnostic registry. Resolution is keyword-based and DETERMINISTIC — NO
 * LLM. Only ACTIVE projects can ever be resolved/used, so an inactive registry
 * slot (or unknown project) never gets attached to a command. WhatsApp text can
 * only select an already-registered project by keyword; it can never set repo
 * names or create projects.
 *
 * Read-only in Priority 1.2 (no admin create/update wired yet); the mutating
 * helpers are provided for a future admin API but are not exposed via any route.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface BuildProjectView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  defaultBranch: string;
  isDefault: boolean;
  isActive: boolean;
  category: string | null;
  displayOrder: number;
  projectRules: string[];
  riskNotes: string | null;
  promptContext: string | null;
}

/**
 * Keyword → slug map for deterministic resolution. Lowercase keywords; first
 * match wins (longer/more-specific keywords listed first per project). Only used
 * to look up ACTIVE projects, so an inactive slug here resolves to nothing.
 */
export const PROJECT_KEYWORDS: Array<{ slug: string; keywords: string[] }> = [
  { slug: "foocci",          keywords: ["foocci", "fute"] },
  { slug: "dioli-agency-os", keywords: ["dioli", "agency os", "agencyos"] },
  { slug: "santioh",         keywords: ["santioh", "santio"] },
];

/**
 * Pure keyword matcher (NO DB, NO LLM): returns the candidate project slug whose
 * keyword appears first in the text, or null. Note this only identifies a
 * CANDIDATE — the caller must still confirm the project is ACTIVE before using it.
 */
export function matchProjectSlugByKeyword(messageText: string): string | null {
  const text = (messageText ?? "").toLowerCase();
  for (const entry of PROJECT_KEYWORDS) {
    if (entry.keywords.some((kw) => text.includes(kw))) return entry.slug;
  }
  return null;
}

function rowToView(r: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  defaultBranch: string;
  isDefault: boolean;
  isActive: boolean;
  category: string | null;
  displayOrder: number;
  projectRules: unknown;
  riskNotes: string | null;
  promptContext: string | null;
}): BuildProjectView {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    githubOwner: r.githubOwner,
    githubRepo: r.githubRepo,
    defaultBranch: r.defaultBranch,
    isDefault: r.isDefault,
    isActive: r.isActive,
    category: r.category,
    displayOrder: r.displayOrder,
    projectRules: Array.isArray(r.projectRules) ? (r.projectRules as unknown[]).map(String) : [],
    riskNotes: r.riskNotes,
    promptContext: r.promptContext,
  };
}

const PROJECT_SELECT = {
  id: true, slug: true, name: true, description: true,
  githubOwner: true, githubRepo: true, defaultBranch: true,
  isDefault: true, isActive: true, category: true, displayOrder: true,
  projectRules: true, riskNotes: true, promptContext: true,
} as const;

/** All ACTIVE projects, ordered for display. Defensive: [] on failure. */
export async function getActiveBuildProjects(): Promise<BuildProjectView[]> {
  try {
    const rows = await prisma.buildProject.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: PROJECT_SELECT,
    });
    return rows.map(rowToView);
  } catch {
    return [];
  }
}

/** Every project (active + inactive) for the admin registry view. */
export async function getAllBuildProjects(): Promise<BuildProjectView[]> {
  try {
    const rows = await prisma.buildProject.findMany({
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: PROJECT_SELECT,
    });
    return rows.map(rowToView);
  } catch {
    return [];
  }
}

/** The single default ACTIVE project, or null if none/ambiguous-by-absence. */
export async function getDefaultBuildProject(): Promise<BuildProjectView | null> {
  try {
    const row = await prisma.buildProject.findFirst({
      where: { isDefault: true, isActive: true },
      select: PROJECT_SELECT,
    });
    return row ? rowToView(row) : null;
  } catch {
    return null;
  }
}

/** Look up an ACTIVE project by exact slug. */
export async function getBuildProjectBySlug(slug: string): Promise<BuildProjectView | null> {
  try {
    const row = await prisma.buildProject.findFirst({
      where: { slug, isActive: true },
      select: PROJECT_SELECT,
    });
    return row ? rowToView(row) : null;
  } catch {
    return null;
  }
}

export type ProjectResolutionMethod = "KEYWORD" | "DEFAULT_FALLBACK" | "UNRESOLVED";

export interface ProjectResolution {
  projectId: string | null;
  slug: string | null;
  method: ProjectResolutionMethod;
}

/**
 * Deterministically resolve a project from raw message text (NO LLM):
 *   1. If a known keyword matches an ACTIVE project → that project (KEYWORD).
 *   2. Else, if exactly one ACTIVE default exists → it (DEFAULT_FALLBACK).
 *   3. Else → unresolved (projectId null). Never throws.
 *
 * Inactive registry slots never resolve (only ACTIVE projects are usable).
 */
export async function resolveBuildProjectFromMessage(
  messageText: string,
): Promise<ProjectResolution> {
  // 1. Keyword match against active projects.
  try {
    const candidateSlug = matchProjectSlugByKeyword(messageText);
    if (candidateSlug) {
      const project = await getBuildProjectBySlug(candidateSlug); // active-only
      if (project) {
        return { projectId: project.id, slug: project.slug, method: "KEYWORD" };
      }
      // keyword matched but project not active → fall through to default
    }
  } catch {
    // fall through to default
  }

  // 2. Default fallback.
  const def = await getDefaultBuildProject();
  if (def) return { projectId: def.id, slug: def.slug, method: "DEFAULT_FALLBACK" };

  // 3. Unresolved.
  return { projectId: null, slug: null, method: "UNRESOLVED" };
}

// ── Mutating helpers (FUTURE admin API — not exposed via any route in 1.2) ──────

export interface CreateBuildProjectInput {
  slug: string;
  name: string;
  description?: string | null;
  githubOwner?: string | null;
  githubRepo?: string | null;
  defaultBranch?: string;
  category?: string | null;
  displayOrder?: number;
  projectRules?: string[];
  riskNotes?: string | null;
  promptContext?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
}

export async function createBuildProject(input: CreateBuildProjectInput): Promise<string> {
  const row = await prisma.buildProject.create({
    data: {
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      githubOwner: input.githubOwner ?? null,
      githubRepo: input.githubRepo ?? null,
      defaultBranch: input.defaultBranch ?? "main",
      category: input.category ?? null,
      displayOrder: input.displayOrder ?? 0,
      projectRules: (input.projectRules ?? []) as Prisma.InputJsonValue,
      riskNotes: input.riskNotes ?? null,
      promptContext: input.promptContext ?? null,
      isDefault: input.isDefault ?? false,
      isActive: input.isActive ?? true,
    },
    select: { id: true },
  });
  return row.id;
}

export async function updateBuildProject(
  id: string,
  input: Partial<CreateBuildProjectInput>,
): Promise<void> {
  const data: Prisma.BuildProjectUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.githubOwner !== undefined) data.githubOwner = input.githubOwner;
  if (input.githubRepo !== undefined) data.githubRepo = input.githubRepo;
  if (input.defaultBranch !== undefined) data.defaultBranch = input.defaultBranch;
  if (input.category !== undefined) data.category = input.category;
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
  if (input.projectRules !== undefined) data.projectRules = input.projectRules as Prisma.InputJsonValue;
  if (input.riskNotes !== undefined) data.riskNotes = input.riskNotes;
  if (input.promptContext !== undefined) data.promptContext = input.promptContext;
  if (input.isDefault !== undefined) data.isDefault = input.isDefault;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  await prisma.buildProject.update({ where: { id }, data });
}

export async function deactivateBuildProject(id: string): Promise<void> {
  await prisma.buildProject.update({ where: { id }, data: { isActive: false } });
}
