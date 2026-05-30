/**
 * Seed: AI Agent Profiles foundation (Phase 1).
 *
 * Populates the `agent_profiles` table from the code-defined registry
 * (src/services/agents/defaultAgentProfiles.ts). The Waiter agent is seeded with
 * rich content derived from its existing constitution; the other agents are
 * DRAFT placeholders.
 *
 * Safety:
 *   - Idempotent: upserts by slug (re-run refreshes content, no duplicates).
 *   - DATA ONLY: does not enable runtime, does not touch any restaurant config,
 *     does not alter the Waiter flow. The live Waiter keeps reading the code
 *     constitution until Phase 3.
 *
 * Run with:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-agent-profiles.ts
 */

import { seedDefaultAgentProfiles } from "../src/services/agents/AgentProfileService";
import { prisma } from "../src/lib/prisma";

async function main() {
  const { created, updated } = await seedDefaultAgentProfiles();
  // eslint-disable-next-line no-console
  console.log(
    `[seed-agent-profiles] done — created: ${created}, updated: ${updated}`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[seed-agent-profiles] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
