/**
 * seed-foocci-bakery — provisiona a padaria de DEMONSTRAÇÃO "Foocci Bakery".
 *
 * Este arquivo é só a BOCA DE LINHA DE COMANDO. A lógica inteira vive em
 * `src/services/demo/FoocciBakeryService.ts`, que é o mesmo serviço chamado pelo
 * botão do admin (`/api/admin/demo-bakery/seed`). Duas cópias divergem — e a que
 * diverge em silêncio é a que estraga a vitrine na véspera da demonstração.
 *
 * A padaria é um restaurante NORMAL e completo dentro do sistema (cardápio,
 * horário, entrega, pagamento, comanda) para que o visitante do site de vendas
 * degustre as três superfícies antes de comprar:
 *
 *   mesa (QR)   →  /qr/foocci-bakery
 *   loja sem IA →  /pedido/foocci-bakery?modo=loja
 *   Garçom IA   →  /pedido/foocci-bakery
 *
 * Ela nasce com `Restaurant.isDemo = true`. Essa coluna é a trava que impede a
 * vitrine de virar cliente em cobrança e em relatório (src/lib/demo-restaurant.ts).
 *
 * ─── Uso ──────────────────────────────────────────────────────────────────────
 *   npm run bakery:seed                  # cria/atualiza (idempotente)
 *   npm run bakery:seed -- --dry-run     # não escreve nada; só conta
 *   npm run bakery:seed -- --prune       # remove do cardápio o que saiu do arquivo
 *
 * Senha do dono: lida de FOOCCI_BAKERY_OWNER_PASSWORD. Sem a variável, o serviço
 * sorteia uma senha e ela é impressa UMA vez. Nunca há senha conhecida embutida
 * no repositório. Re-execução NUNCA troca a senha de um dono que já existe.
 *
 * Não roda contra produção sozinho: usa o DATABASE_URL do ambiente. Confira para
 * onde ele aponta ANTES de rodar. (Quem não tem terminal usa o botão do admin.)
 */

import { prisma } from "@/lib/prisma";
import { BakeryOperationError, seedBakery } from "@/services/demo/FoocciBakeryService";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const prune = args.includes("--prune");

async function main(): Promise<void> {
  const dbHost = (process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@");
  console.log("\n🥐  Foocci Bakery — seed da padaria de demonstração");
  console.log(`    banco   : ${dbHost || "(DATABASE_URL não definida)"}`);
  console.log(`    dry-run : ${dryRun}`);
  console.log(`    prune   : ${prune}\n`);

  const r = await seedBakery({ dryRun, prune });

  console.log(`  ${r.restaurantCreated ? "criado" : "atualizado"}: ${r.restaurantName} (${r.slug})`);
  if (r.ownerPasswordOnce) {
    console.log(`  dono criado: ${r.ownerEmail}`);
    console.log(`  SENHA (aparece uma única vez): ${r.ownerPasswordOnce}`);
  } else {
    console.log(`  dono já existia: ${r.ownerEmail} (senha intocada)`);
  }
  console.log("  loja configurada: horário, entrega, pagamento, marca, ficha, estações, precificação");

  console.log("\n━━━ Resumo ━━━");
  console.log(`  categorias : ${r.categoriesCreated} criadas · ${r.categoriesUpdated} atualizadas`);
  console.log(`  itens      : ${r.itemsCreated} criados · ${r.itemsUpdated} atualizados`);
  console.log(`  variantes  : ${r.variants}`);
  console.log(`  adicionais : ${r.extras}`);
  console.log(`  grupos de opção : ${r.optionGroups} (${r.options} opções)`);
  if (r.pruned) {
    console.log(`  removidos  : ${r.itemsPruned} itens · ${r.categoriesPruned} categorias`);
  }
  if (r.itemsWithoutImage !== null) {
    console.log(`  SEM FOTO   : ${r.itemsWithoutImage} itens — rode \`npm run bakery:imagens -- --yes\``);
  }

  console.log("\n  Degustação:");
  console.log(`    mesa (QR)   ${r.routes.mesaQr}`);
  console.log(`    loja sem IA ${r.routes.lojaSemIa}`);
  console.log(`    Garçom IA   ${r.routes.garcomIa}`);

  if (r.dryRun) console.log("\n[DRY RUN] Nada foi escrito.");
}

main()
  .catch((err) => {
    if (err instanceof BakeryOperationError) {
      // A recusa já vem escrita em linguagem de gente; a evidência técnica é
      // separada, para o log (guardrail 6).
      console.error(`\n✗ ${err.message}`);
      if (err.evidence) console.error("  detalhe:", err.evidence);
    } else {
      console.error("\n✗ seed falhou:", err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
