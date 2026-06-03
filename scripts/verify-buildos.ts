/**
 * Build OS verification — confirm config + classifier + prompt draft (no relay).
 *
 * Prints PASS/FAIL for each check. Read-only against the DB. NO Claude/GitHub/LLM
 * relay, NO execution. Exits non-zero if any check fails.
 *
 * Run:  npm run buildos:verify
 */

import { runVerification } from "../src/services/buildos/BuildOSBootstrapService";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("\n🔍 Build OS — verificação\n");
  const report = await runVerification();

  for (const c of report.checks) {
    console.log(`   ${c.pass ? "✅ PASS" : "❌ FAIL"}  ${c.name}`);
    console.log(`            ${c.detail}`);
  }

  console.log(`\n${report.allPass ? "✅ TODOS OS CHECKS PASSARAM" : "❌ ALGUNS CHECKS FALHARAM"}\n`);
  if (!report.allPass) process.exit(2);
}

main()
  .catch((err) => {
    console.error("\n❌ Verificação falhou:", err instanceof Error ? err.message : err, "\n");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
