/**
 * defaultBuildProjects — code-defined Build OS project registry (Priority 1.2).
 *
 * Project-agnostic by design: Foocci is simply the first project. Seeding this
 * is additive and idempotent (upsert by slug), data-only — it never enables
 * relay/runtime and stores NO secrets. GitHub owner/repo are metadata only.
 *
 * Foocci is seeded ACTIVE + default. Other known future projects (Dioli Agency
 * OS, Santioh) are seeded as INACTIVE registry slots so keyword resolution can
 * recognize them without inventing repos; they must be configured + activated in
 * the admin/DB before they can actually be used.
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
  isActive: boolean;
  category: string | null;
  displayOrder: number;
  /** High-level rules only — never secrets. */
  projectRules: string[];
  riskNotes: string | null;
}

export const DEFAULT_BUILD_PROJECTS: readonly BuildProjectDefinition[] = [
  {
    slug: "foocci",
    name: "Foocci",
    description:
      "WhatsApp-based sales, ordering, CRM and AI agents platform for restaurants.",
    defaultBranch: "main",
    // Metadata only (no tokens). Confirmed from the active repo of this project.
    githubOwner: "diolisantos10",
    githubRepo: "foocci",
    isDefault: true,
    isActive: true,
    category: "platform",
    displayOrder: 0,
    projectRules: [
      "Não alterar runtime do Waiter, /pedido, checkout, pagamentos ou CRM sem aprovação.",
      "Mudanças devem ser aditivas e seguras por padrão.",
      "Segredos nunca entram em prompts, logs ou no registro.",
    ],
    riskNotes:
      "Plataforma em produção com pilotos ativos. Tratar checkout/pagamentos como áreas de alto risco.",
  },
  {
    slug: "dioli-agency-os",
    name: "Dioli Agency OS",
    description: "Agency operating system (registry slot — configure before use).",
    defaultBranch: "main",
    // Unknown — must be configured later in admin/DB. Do not invent.
    githubOwner: null,
    githubRepo: null,
    isDefault: false,
    isActive: false, // registry slot only; activate after GitHub metadata is set
    category: "agency",
    displayOrder: 10,
    projectRules: [],
    riskNotes: "Slot de registro. GitHub owner/repo devem ser configurados antes do uso.",
  },
  {
    slug: "santioh",
    name: "Santioh",
    description: "Santioh project (registry slot — configure before use).",
    defaultBranch: "main",
    githubOwner: null,
    githubRepo: null,
    isDefault: false,
    isActive: false, // registry slot only
    category: "experiment",
    displayOrder: 20,
    projectRules: [],
    riskNotes: "Slot de registro. GitHub owner/repo devem ser configurados antes do uso.",
  },
];

/**
 * Idempotent seed. Safe to run any time — upserts by slug, writes data only,
 * never enables relay/runtime. Returns counts.
 *
 * Note: `isDefault`/`isActive` are set on CREATE; on UPDATE they are preserved
 * for non-Foocci slots so an admin who activates a slot is not reset by a re-seed.
 * Foocci's defaults are always reasserted (it is the canonical default).
 */
export async function seedDefaultBuildProjects(): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const def of DEFAULT_BUILD_PROJECTS) {
    const existing = await prisma.buildProject.findUnique({
      where: { slug: def.slug },
      select: { id: true },
    });

    const common = {
      name: def.name,
      description: def.description,
      defaultBranch: def.defaultBranch,
      githubOwner: def.githubOwner,
      githubRepo: def.githubRepo,
      category: def.category,
      displayOrder: def.displayOrder,
      projectRules: def.projectRules,
      riskNotes: def.riskNotes,
    };

    const isFoocci = def.slug === "foocci";

    await prisma.buildProject.upsert({
      where: { slug: def.slug },
      create: {
        slug: def.slug,
        ...common,
        isDefault: def.isDefault,
        isActive: def.isActive,
      },
      // On update: refresh metadata, but only reassert isDefault/isActive for
      // Foocci so an admin's activation of other slots survives re-seeding.
      update: isFoocci
        ? { ...common, isDefault: def.isDefault, isActive: def.isActive }
        : common,
    });

    if (existing) updated += 1;
    else created += 1;
  }

  return { created, updated };
}
