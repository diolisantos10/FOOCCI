#!/usr/bin/env npx tsx
/**
 * ONE-TIME CLEANUP — delete the restaurant-level imported sales baseline.
 *
 * Removes ProductSalesAggregate rows (the Saipos/Nemo "quanto o restaurante
 * vendeu de cada prato no passado" comparative). This table has NO link to any
 * customer — deleting it does NOT touch customers, orders, or per-customer
 * purchase history. Those stay intact (imported Order/OrderItem records remain).
 *
 * The imported-baseline feature was retired: Analytics now reflects only real
 * Foocci sales, and nothing reads ProductSalesAggregate anymore.
 *
 * Usage (run where DATABASE_URL points at the target DB, e.g. Railway shell):
 *   # Preview only (default — does NOT delete):
 *   npx tsx scripts/delete-imported-baselines.ts
 *
 *   # Preview a single restaurant by slug:
 *   npx tsx scripts/delete-imported-baselines.ts --restaurant sushi-cazza
 *
 *   # Actually delete (all restaurants):
 *   npx tsx scripts/delete-imported-baselines.ts --confirm
 *
 *   # Actually delete for a single restaurant:
 *   npx tsx scripts/delete-imported-baselines.ts --restaurant sushi-cazza --confirm
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function getOption(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

async function main() {
  const confirm        = getFlag("confirm");
  const restaurantSlug = getOption("restaurant");

  let restaurantId: string | null = null;
  let restaurantLabel = "TODOS os restaurantes";

  if (restaurantSlug) {
    const r = await prisma.restaurant.findFirst({
      where:  { slug: restaurantSlug },
      select: { id: true, name: true, slug: true },
    });
    if (!r) {
      console.error(`✖ Restaurante com slug "${restaurantSlug}" não encontrado.`);
      process.exit(1);
    }
    restaurantId   = r.id;
    restaurantLabel = `${r.name} (${r.slug})`;
  }

  const where = restaurantId ? { restaurantId } : {};

  const total = await prisma.productSalesAggregate.count({ where });

  console.log("─────────────────────────────────────────────");
  console.log("  Limpeza do baseline de vendas importado");
  console.log("─────────────────────────────────────────────");
  console.log(`  Escopo:   ${restaurantLabel}`);
  console.log(`  Linhas:   ${total} em product_sales_aggregates`);
  console.log("");

  if (total === 0) {
    console.log("  Nada a apagar. ✅");
    return;
  }

  if (!confirm) {
    console.log("  MODO PREVIEW (nada foi apagado).");
    console.log("  Para apagar de verdade, rode novamente com --confirm");
    return;
  }

  const result = await prisma.productSalesAggregate.deleteMany({ where });
  console.log(`  ✅ ${result.count} linhas apagadas de product_sales_aggregates.`);
  console.log("  Clientes, pedidos e histórico por cliente: intactos.");
}

main()
  .catch((err) => {
    console.error("✖ Erro:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
