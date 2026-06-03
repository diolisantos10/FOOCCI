/**
 * Build OS bootstrap — configure Build OS without Railway/UI (dev/admin).
 *
 * Idempotent + additive. Enables Build OS (DB config), ensures the Foocci
 * project, and creates/updates ONE authorized operator. Never deletes data,
 * never prints secrets. NO Claude/GitHub/LLM relay, NO execution.
 *
 * Inputs (env vars or CLI):
 *   BUILD_OS_BOOTSTRAP_PHONE   (required, E.164, e.g. "+5511999999999")
 *   BUILD_OS_BOOTSTRAP_NAME    (optional, default "Diego")
 *   BUILD_OS_BOOTSTRAP_ROLE    (optional, default "OWNER")
 *
 * Run:
 *   BUILD_OS_BOOTSTRAP_PHONE="+5511999999999" npm run buildos:bootstrap
 *   npm run buildos:bootstrap -- --dry-run
 */

import { runBootstrap, prepareBootstrapPlan } from "../src/services/buildos/BuildOSBootstrapService";
import { prisma } from "../src/lib/prisma";

function arg(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const phone = process.env.BUILD_OS_BOOTSTRAP_PHONE ?? arg("phone");
  const name = process.env.BUILD_OS_BOOTSTRAP_NAME ?? arg("name");
  const role = process.env.BUILD_OS_BOOTSTRAP_ROLE ?? arg("role");

  if (!phone) {
    console.error(
      "\n❌ BUILD_OS_BOOTSTRAP_PHONE é obrigatório.\n" +
        '   Use E.164, ex.: BUILD_OS_BOOTSTRAP_PHONE="+5511999999999" npm run buildos:bootstrap\n',
    );
    process.exit(1);
  }

  // Validate/normalize up front so --dry-run also fails clearly on bad input.
  const plan = prepareBootstrapPlan({ phone, name, role, dryRun });

  console.log("\n🛠️  Build OS bootstrap");
  console.log(`   Operador:   ${plan.name} (${plan.role})`);
  console.log(`   Telefone:   ${plan.rawPhone}  →  ${plan.normalizedPhone} (normalizado)`);
  console.log(`   Modo:       ${dryRun ? "DRY-RUN (não grava nada)" : "APLICAR"}`);
  console.log("\n   Ações planejadas:");
  plan.actions.forEach((a) => console.log(`     • ${a}`));

  const result = await runBootstrap({ phone, name, role, dryRun });

  if (result.dryRun) {
    console.log("\n✅ DRY-RUN concluído — nenhuma escrita no banco.\n");
    return;
  }

  console.log("\n   Resultado:");
  console.log(`     • BuildOSConfig.isEnabled = ${result.configEnabled}`);
  console.log(
    `     • Projetos: criados ${result.projectSeed?.created ?? 0}, atualizados ${result.projectSeed?.updated ?? 0}`,
  );
  console.log(`     • Operador: ${result.senderAction}`);
  console.log("\n✅ Bootstrap aplicado. Build OS está habilitado e o operador autorizado.\n");
}

main()
  .catch((err) => {
    console.error("\n❌ Bootstrap falhou:", err instanceof Error ? err.message : err, "\n");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
