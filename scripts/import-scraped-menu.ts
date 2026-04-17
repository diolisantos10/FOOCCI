/**
 * Import script — ingests data/sushi-cazza-scraped.json into a Foocci restaurant.
 *
 * Usage:
 *   npx tsx scripts/import-scraped-menu.ts [--slug=<slug>] [--dry-run] [--clear]
 *
 * --clear : wipe existing menu categories/items/variants before import (default: true)
 * --slug  : restaurant slug (default: pizzaria-demo)
 *
 * channelNote handling:
 *   "presencial_only" → showInDelivery=false, showInDineIn=true
 *   (none)            → showInDelivery=true,  showInDineIn=true
 *
 * Modifier handling:
 *   item.modifiers.length > 0 → hasVariants=true, base price=0, create MenuItemVariant per option
 */

import { PrismaClient, MenuSource } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const DATA_FILE = path.join(__dirname, "../data/sushi-cazza-scraped.json");
const DEFAULT_SLUG = "pizzaria-demo";

const args = process.argv.slice(2);
const slugArg = args.find((a) => a.startsWith("--slug="))?.split("=")[1];
const slug    = slugArg ?? DEFAULT_SLUG;
const dryRun  = args.includes("--dry-run");
const noClear = args.includes("--no-clear");

interface ScrapedOption   { name: string; price: number }
interface ScrapedModifier { name: string; required: boolean; options: ScrapedOption[] }
interface ScrapedItem {
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  modifiers: ScrapedModifier[];
  channelNote?: string | null;
}
interface ScrapedCategory {
  name: string;
  description: string | null;
  items: ScrapedItem[];
}
interface ScrapedFile {
  _meta: Record<string, unknown>;
  categories: ScrapedCategory[];
}

async function clearMenu(restaurantId: string): Promise<void> {
  console.log("  Clearing existing menu...");
  const cats = await prisma.menuCategory.findMany({
    where: { restaurantId },
    select: { id: true },
  });
  const catIds = cats.map((c) => c.id);
  if (catIds.length === 0) { console.log("  Nothing to clear."); return; }

  const items = await prisma.menuItem.findMany({
    where: { categoryId: { in: catIds } },
    select: { id: true },
  });
  const itemIds = items.map((i) => i.id);

  if (itemIds.length > 0) {
    const vars = await prisma.menuItemVariant.deleteMany({ where: { menuItemId: { in: itemIds } } });
    console.log(`  Deleted ${vars.count} variants`);
    const extras = await prisma.menuItemExtra.deleteMany({ where: { menuItemId: { in: itemIds } } });
    if (extras.count > 0) console.log(`  Deleted ${extras.count} extras`);
    const its = await prisma.menuItem.deleteMany({ where: { categoryId: { in: catIds } } });
    console.log(`  Deleted ${its.count} items`);
  }
  const cs = await prisma.menuCategory.deleteMany({ where: { restaurantId } });
  console.log(`  Deleted ${cs.count} categories`);
}

async function main(): Promise<void> {
  console.log(`\nSushi Cazza — scraped menu import`);
  console.log(`  Restaurant : ${slug}`);
  console.log(`  File       : ${DATA_FILE}`);
  console.log(`  Dry run    : ${dryRun}`);
  console.log(`  Clear menu : ${!noClear}\n`);

  const raw: ScrapedFile = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  console.log(`Loaded: ${raw.categories.length} categories, ${raw.categories.reduce((s,c)=>s+c.items.length,0)} items\n`);

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`ERROR: Restaurant "${slug}" not found.`);
    process.exit(1);
  }
  console.log(`Restaurant: ${restaurant.name} (${restaurant.id})\n`);

  if (!dryRun && !noClear) {
    await clearMenu(restaurant.id);
    console.log();
  }

  let totalCats = 0, totalItems = 0, totalVariants = 0;
  const skipped: string[] = [];

  for (let ci = 0; ci < raw.categories.length; ci++) {
    const catData = raw.categories[ci];
    if (!catData) continue;

    const deliveryItems = catData.items.filter((i) => i.channelNote !== "presencial_only");
    const presencialItems = catData.items.filter((i) => i.channelNote === "presencial_only");

    console.log(`[${ci + 1}/${raw.categories.length}] ${catData.name} (${catData.items.length} items, ${presencialItems.length} presencial-only)`);

    if (!dryRun) {
      const category = await prisma.menuCategory.create({
        data: {
          restaurantId: restaurant.id,
          name: catData.name,
          description: catData.description,
          sortOrder: ci,
          isActive: true,
          isAvailable: true,
          showInDelivery: true,
          showInDineIn: true,
          source: MenuSource.EXTERNAL,
        },
      });

      totalCats++;

      for (let ii = 0; ii < catData.items.length; ii++) {
        const itemData = catData.items[ii];
        if (!itemData) continue;

        const isPresencial   = itemData.channelNote === "presencial_only";
        const hasVariants    = itemData.modifiers.length > 0;
        const basePrice      = hasVariants ? 0 : itemData.price;
        const showInDelivery = !isPresencial;

        process.stdout.write(`  [${ii + 1}] ${itemData.name} R$${basePrice}`);
        if (isPresencial)  process.stdout.write(` [presencial-only → delivery:hidden]`);
        if (hasVariants)   process.stdout.write(` [variants:${itemData.modifiers.reduce((s,m)=>s+m.options.length,0)}]`);
        console.log();

        const item = await prisma.menuItem.create({
          data: {
            categoryId:    category.id,
            name:          itemData.name,
            description:   itemData.description,
            price:         new Decimal(basePrice),
            imageUrl:      itemData.image,
            sortOrder:     ii,
            isActive:      true,
            isAvailable:   true,
            showInDelivery,
            showInDineIn:  true,
            hasVariants,
          },
        });

        totalItems++;

        if (hasVariants) {
          let vi = 0;
          for (const modifier of itemData.modifiers) {
            for (const opt of modifier.options) {
              await prisma.menuItemVariant.create({
                data: {
                  menuItemId:  item.id,
                  name:        opt.name,
                  price:       new Decimal(opt.price),
                  isAvailable: true,
                  sortOrder:   vi++,
                },
              });
              totalVariants++;
            }
          }
        }
      }
    } else {
      // dry-run counts
      totalCats++;
      totalItems += catData.items.length;
      for (const i of catData.items) {
        totalVariants += i.modifiers.reduce((s,m) => s + m.options.length, 0);
      }
    }
    console.log();
  }

  console.log(`━━━ Import Summary ━━━`);
  console.log(`  Categories : ${totalCats}`);
  console.log(`  Items      : ${totalItems}`);
  console.log(`  Variants   : ${totalVariants}`);
  if (skipped.length > 0) {
    console.log(`  Skipped    : ${skipped.length}`);
    skipped.forEach((s) => console.log(`    - ${s}`));
  }
  if (dryRun) {
    console.log(`\n[DRY RUN] No data written.`);
  } else {
    console.log(`\nImport complete.`);
  }
}

main()
  .catch((err) => { console.error("Import failed:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
