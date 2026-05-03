/**
 * scripts/rebuild-customer-metrics.ts
 *
 * Rebuilds Customer.totalOrders, totalSpend, and lastOrderAt from source-of-truth
 * Order data for every customer in a restaurant (or all restaurants).
 *
 * Also stamps Order.crmSyncedAt on all countable orders so future incremental
 * syncs do not double-count them.
 *
 * Usage:
 *   # All restaurants
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/rebuild-customer-metrics.ts
 *
 *   # Single restaurant
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/rebuild-customer-metrics.ts --restaurantId=<id>
 *
 * Safe to run multiple times — idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { isCrmCountable } from "../src/services/crm/crm-countable";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

// ── CLI args ───────────────────────────────────────────────────────────────────

function getRestaurantIdArg(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith("--restaurantId="));
  return arg ? arg.split("=")[1] : undefined;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const restaurantIdFilter = getRestaurantIdArg();

  console.log("══════════════════════════════════════════════════");
  console.log("  CRM Customer Metrics Rebuild");
  console.log("══════════════════════════════════════════════════");
  if (restaurantIdFilter) {
    console.log(`  Scope: restaurant ${restaurantIdFilter}`);
  } else {
    console.log("  Scope: ALL restaurants");
  }
  console.log();

  // ── Fetch customers ───────────────────────────────────────────────────────

  const customers = await prisma.customer.findMany({
    where: restaurantIdFilter ? { restaurantId: restaurantIdFilter } : undefined,
    select: { id: true, restaurantId: true, name: true, totalOrders: true, totalSpend: true },
    orderBy: { restaurantId: "asc" },
  });

  console.log(`Found ${customers.length} customers to process.\n`);

  let customersUpdated   = 0;
  let totalOrdersCounted = 0;
  let totalOrdersIgnored = 0;
  let errors             = 0;
  const now = new Date();

  for (const customer of customers) {
    try {
      // ── Fetch all orders for this customer ───────────────────────────────
      const orders = await prisma.order.findMany({
        where:  { customerId: customer.id },
        select: {
          id:        true,
          status:    true,
          total:     true,
          createdAt: true,
          payment: { select: { paymentMode: true, status: true } },
        },
      });

      const countable = orders.filter(isCrmCountable);
      const ignored   = orders.length - countable.length;

      totalOrdersCounted += countable.length;
      totalOrdersIgnored += ignored;

      const newTotalOrders = countable.length;
      const newTotalSpend  = countable.reduce((s, o) => s + Number(o.total), 0);
      const newLastOrderAt = countable.length > 0
        ? countable.reduce((latest, o) =>
            o.createdAt > latest ? o.createdAt : latest,
            countable[0]!.createdAt
          )
        : null;

      const prevOrders = customer.totalOrders;
      const prevSpend  = Number(customer.totalSpend);

      // ── Update customer + stamp crmSyncedAt atomically ──────────────────
      await prisma.$transaction(async (tx) => {
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            totalOrders: newTotalOrders,
            totalSpend:  new Decimal(newTotalSpend),
            lastOrderAt: newLastOrderAt,
          },
        });

        // Stamp crmSyncedAt on all countable orders that are missing it
        const countableIds = countable.map((o) => o.id);
        if (countableIds.length > 0) {
          await tx.order.updateMany({
            where: { id: { in: countableIds }, crmSyncedAt: null },
            data:  { crmSyncedAt: now },
          });
        }
      });

      customersUpdated++;

      // Log only when metrics actually changed to reduce noise
      if (newTotalOrders !== prevOrders || newTotalSpend !== prevSpend) {
        console.log(
          `  ✅  ${customer.name.padEnd(30)} ` +
          `orders: ${prevOrders} → ${newTotalOrders}  ` +
          `spend: R$${prevSpend.toFixed(2)} → R$${newTotalSpend.toFixed(2)}`
        );
      }

    } catch (err) {
      errors++;
      console.error(`  ❌  Customer ${customer.id} (${customer.name}):`, err);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log();
  console.log("══════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Customers processed : ${customers.length}`);
  console.log(`  Customers updated   : ${customersUpdated}`);
  console.log(`  Orders counted      : ${totalOrdersCounted}`);
  console.log(`  Orders ignored      : ${totalOrdersIgnored}`);
  console.log(`  Errors              : ${errors}`);
  console.log();

  if (errors > 0) {
    console.warn("  ⚠️  Some customers failed to rebuild. Check logs above.");
    process.exit(1);
  } else {
    console.log("  ✅  Rebuild complete.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
