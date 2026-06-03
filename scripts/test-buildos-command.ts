/**
 * Build OS simulated command — exercise the full 1.1–1.4 intake flow without a
 * real WhatsApp message and without sending anything (no-send by default).
 *
 * Creates a BuildCommand → resolves project → classifies → drafts a prompt →
 * AWAITING_CONFIRMATION. NEVER sends to Claude/GitHub and NEVER executes code.
 *
 * Run:
 *   npm run buildos:test-command -- --phone="+5511999999999" \
 *     --message="/build Faz um RAIO-X do checkout Pix. Não implemente nada ainda."
 */

import { runSimulatedIntake } from "../src/services/buildos/BuildOSBootstrapService";
import { prisma } from "../src/lib/prisma";

function arg(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

async function main() {
  const phone = arg("phone") ?? process.env.BUILD_OS_BOOTSTRAP_PHONE;
  const message =
    arg("message") ?? "/build Faz um RAIO-X do checkout Pix. Não implemente nada ainda.";

  if (!phone) {
    console.error('\n❌ --phone é obrigatório (ex.: --phone="+5511999999999").\n');
    process.exit(1);
  }

  console.log("\n🧪 Build OS — comando simulado (sem WhatsApp, sem envio)\n");
  console.log(`   Telefone: ${phone}`);
  console.log(`   Mensagem: ${message}\n`);

  const result = await runSimulatedIntake({ phone, message, noSend: true });

  if (!result.ok) {
    console.error(`❌ ${result.error}\n`);
    process.exit(2);
  }

  console.log("✅ Comando simulado criado:");
  console.log(`   ID:        ${result.commandId} (#${result.shortId})`);
  console.log(`   Projeto:   ${result.projectSlug ?? "não resolvido"}`);
  console.log(`   Status:    ${result.status}`);
  console.log(`   Prompt:    versão ${result.promptVersion ?? "—"}`);
  if (result.classification) {
    const c = result.classification;
    console.log(
      `   Classif.:  task=${c.taskType}, intent=${c.executionIntent}, area=${c.targetArea}, risk=${c.riskLevel}`,
    );
  }
  console.log("\n   (Nenhuma mensagem enviada · nenhum relay para Claude/GitHub · nada executado.)\n");
}

main()
  .catch((err) => {
    console.error("\n❌ Comando simulado falhou:", err instanceof Error ? err.message : err, "\n");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
