/**
 * defaultBuildProjects — code-defined Build OS project registry (Priority 1.1).
 *
 * Project-agnostic by design: Foocci is simply the first project. Seeding this
 * is additive and idempotent (upsert by slug). The GitHub owner/repo are filled
 * in but unused in Priority 1.1 (no relay yet).
 */

import { prisma } from "@/lib/prisma";

export interface BuildProjectDefinition {
  slug: string;
  name: string;
  description: string;
  defaultBranch: string;
  githubOwner: string | null;
  githubRepo: string | null;
  isDefault: boolean;
}

export const DEFAULT_BUILD_PROJECTS: readonly BuildProjectDefinition[] = [
  {
    slug: "foocci",
    name: "Foocci",
    description:
      "Primeiro laboratório do Build OS. Plataforma de pedidos/CRM para restaurantes.",
    defaultBranch: "main",
    githubOwner: "diolisantos10",
    githubRepo: "foocci",
    isDefault: true,
  },
];

/**
 * Idempotent seed. Safe to run any time — upserts by slug, writes data only,
 * never enables relay/runtime. Returns counts.
 */
export async function seedDefaultBuildProjects(): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const def of DEFAULT_BUILD_PROJECTS) {
    const existing = await prisma.buildProject.findUnique({
      where: { slug: def.slug },
      select: { id: true },
    });

    await prisma.buildProject.upsert({
      where: { slug: def.slug },
      create: {
        slug: def.slug,
        name: def.name,
        description: def.description,
        defaultBranch: def.defaultBranch,
        githubOwner: def.githubOwner,
        githubRepo: def.githubRepo,
        isDefault: def.isDefault,
        isActive: true,
      },
      update: {
        name: def.name,
        description: def.description,
        defaultBranch: def.defaultBranch,
        githubOwner: def.githubOwner,
        githubRepo: def.githubRepo,
        isDefault: def.isDefault,
      },
    });

    if (existing) updated += 1;
    else created += 1;
  }

  return { created, updated };
}
