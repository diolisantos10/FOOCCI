/**
 * Seed: Build OS default projects (Priority 1.1).
 *
 * Populates the `build_projects` table from the code-defined registry
 * (src/services/buildos/defaultBuildProjects.ts). Foocci is the default project.
 *
 * Safety: idempotent (upsert by slug), data-only. Does not enable relay/runtime,
 * does not configure authorized senders (those use BUILD_OS_AUTHORIZED_PHONES).
 *
 * Run with:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-build-projects.ts
 */

import { seedDefaultBuildProjects } from "../src/services/buildos/defaultBuildProjects";
import { prisma } from "../src/lib/prisma";

async function main() {
  const { created, updated } = await seedDefaultBuildProjects();
  // eslint-disable-next-line no-console
  console.log(`[seed-build-projects] done — created: ${created}, updated: ${updated}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[seed-build-projects] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
