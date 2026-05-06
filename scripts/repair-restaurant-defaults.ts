/**
 * scripts/repair-restaurant-defaults.ts
 *
 * Backfills default configuration rows for all existing restaurants
 * that were created before RestaurantDefaultsService was introduced.
 *
 * Safe to run multiple times — idempotent, never overwrites existing data.
 *
 * Usage:
 *   npx tsx scripts/repair-restaurant-defaults.ts
 *
 * Optional: target a specific restaurant
 *   RESTAURANT_ID=cldxxxx npx tsx scripts/repair-restaurant-defaults.ts
 */

import { PrismaClient } from "@prisma/client";
import { RestaurantDefaultsService } from "../src/services/restaurant/RestaurantDefaultsService";

const prisma = new PrismaClient();

async function main() {
  const targetId = process.env.RESTAURANT_ID;

  const restaurants = await prisma.restaurant.findMany({
    where: targetId ? { id: targetId } : undefined,
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "asc" },
  });

  if (restaurants.length === 0) {
    console.log(targetId ? `Restaurant ${targetId} not found.` : "No restaurants found.");
    return;
  }

  console.log(`\nRepairing defaults for ${restaurants.length} restaurant(s)...\n`);

  const summary = { totalCreated: 0, totalSkipped: 0, errors: 0 };

  for (const r of restaurants) {
    process.stdout.write(`  [${r.slug}] ${r.name} ... `);
    try {
      const report = await RestaurantDefaultsService.createRestaurantDefaults(r.id);
      const c = report.created.length;
      const s = report.skipped.length;
      summary.totalCreated += c;
      summary.totalSkipped += s;
      console.log(`created ${c}, skipped ${s}`);
      if (c > 0) {
        console.log(`    created: ${report.created.join(", ")}`);
      }
    } catch (err) {
      summary.errors += 1;
      console.log(`ERROR`);
      console.error(`    ${err}`);
    }
  }

  console.log(`
─────────────────────────────────────────
Repair complete
  Restaurants processed : ${restaurants.length}
  Config rows created   : ${summary.totalCreated}
  Config rows skipped   : ${summary.totalSkipped}
  Errors                : ${summary.errors}
─────────────────────────────────────────
`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
