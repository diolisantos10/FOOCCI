/**
 * Import script — Sushi Cazza menu into a Foocci test restaurant.
 *
 * Usage:
 *   npx tsx scripts/import-sushi-cazza.ts [--slug=<restaurant-slug>] [--dry-run]
 *
 * Defaults:
 *   --slug  pizzaria-demo
 *
 * Idempotent: safe to re-run. Uses findFirst + create/update pattern because
 * MenuCategory has no unique constraint on (restaurantId, name).
 *
 * Modifier-based items (Refrigerante, Sucos, Cervejas):
 *   - base price = 0, hasVariants = true
 *   - each modifier option → MenuItemVariant with its own price
 *
 * Sobremesas:
 *   - showInDelivery = false (delivery not configured in source system)
 *   - showInDineIn = true (visible in dine-in channel)
 */

import { PrismaClient, MenuSource } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const DATA_FILE = path.join(__dirname, "../data/sushi-cazza-import.json");
const DEFAULT_SLUG = "pizzaria-demo";

const args = process.argv.slice(2);
const slugArg = args.find((a) => a.startsWith("--slug="))?.split("=")[1];
const slug = slugArg ?? DEFAULT_SLUG;
const dryRun = args.includes("--dry-run");

interface ImportOption {
  name: string;
  price: number;
}

interface ImportModifier {
  name: string;
  required: boolean;
  options: ImportOption[];
}

interface ImportItem {
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  tags: string[];
  upsellHints: string[];
  modifiers: ImportModifier[];
  _note?: string;
}

interface ImportCategory {
  name: string;
  description: string | null;
  items: ImportItem[];
  _note?: string;
}

interface ImportFile {
  _meta: Record<string, unknown>;
  categories: ImportCategory[];
}

const SOBREMESA_KEYWORDS = ["sobremesa", "sobremesas", "doce", "doces"];

function isSobremesa(catName: string): boolean {
  const n = catName.toLowerCase();
  return SOBREMESA_KEYWORDS.some((kw) => n.includes(kw));
}

async function main(): Promise<void> {
  console.log(`\nSushi Cazza Import`);
  console.log(`  Restaurant : ${slug}`);
  console.log(`  Dry run    : ${dryRun}`);
  console.log(`  File       : ${DATA_FILE}\n`);

  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  const data: ImportFile = JSON.parse(raw);

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`ERROR: Restaurant with slug "${slug}" not found.`);
    process.exit(1);
  }
  console.log(`Restaurant: ${restaurant.name} (${restaurant.id})\n`);

  let totalCategories = 0;
  let totalItems = 0;
  let totalVariants = 0;

  for (let ci = 0; ci < data.categories.length; ci++) {
    const catData = data.categories[ci];
    const deliveryHidden = isSobremesa(catData.name);

    console.log(`[${ci + 1}/${data.categories.length}] ${catData.name}${deliveryHidden ? " (delivery: hidden)" : ""}`);

    let category = await prisma.menuCategory.findFirst({
      where: { restaurantId: restaurant.id, name: catData.name },
    });

    if (!dryRun) {
      if (category) {
        category = await prisma.menuCategory.update({
          where: { id: category.id },
          data: {
            description: catData.description,
            sortOrder: ci,
            source: MenuSource.EXTERNAL,
            showInDelivery: !deliveryHidden,
          },
        });
        console.log(`  -> Updated category ${category.id}`);
      } else {
        category = await prisma.menuCategory.create({
          data: {
            restaurantId: restaurant.id,
            name: catData.name,
            description: catData.description,
            sortOrder: ci,
            isActive: true,
            isAvailable: true,
            showInDelivery: !deliveryHidden,
            showInDineIn: true,
            source: MenuSource.EXTERNAL,
          },
        });
        console.log(`  -> Created category ${category.id}`);
      }
    }

    totalCategories++;

    for (let ii = 0; ii < catData.items.length; ii++) {
      const itemData = catData.items[ii];
      const hasVariants = itemData.modifiers.length > 0;
      const basePrice = hasVariants ? 0 : itemData.price;

      process.stdout.write(`  [${ii + 1}/${catData.items.length}] ${itemData.name}`);
      if (hasVariants) {
        const count = itemData.modifiers.reduce((s, m) => s + m.options.length, 0);
        process.stdout.write(` (${count} variants)`);
      }
      console.log();

      if (!dryRun && category) {
        let item = await prisma.menuItem.findFirst({
          where: { categoryId: category.id, name: itemData.name },
        });

        if (item) {
          item = await prisma.menuItem.update({
            where: { id: item.id },
            data: {
              description: itemData.description,
              price: new Decimal(basePrice),
              imageUrl: itemData.image,
              sortOrder: ii,
              hasVariants,
              showInDelivery: !deliveryHidden,
              isActive: true,
            },
          });
        } else {
          item = await prisma.menuItem.create({
            data: {
              categoryId: category.id,
              name: itemData.name,
              description: itemData.description,
              price: new Decimal(basePrice),
              imageUrl: itemData.image,
              sortOrder: ii,
              isActive: true,
              isAvailable: true,
              showInDelivery: !deliveryHidden,
              showInDineIn: true,
              hasVariants,
            },
          });
        }

        totalItems++;

        if (hasVariants) {
          let vi = 0;
          for (const modifier of itemData.modifiers) {
            for (const opt of modifier.options) {
              const existing = await prisma.menuItemVariant.findFirst({
                where: { menuItemId: item.id, name: opt.name },
              });
              if (existing) {
                await prisma.menuItemVariant.update({
                  where: { id: existing.id },
                  data: { price: new Decimal(opt.price), sortOrder: vi },
                });
              } else {
                await prisma.menuItemVariant.create({
                  data: {
                    menuItemId: item.id,
                    name: opt.name,
                    price: new Decimal(opt.price),
                    isAvailable: true,
                    sortOrder: vi,
                  },
                });
              }
              vi++;
              totalVariants++;
            }
          }
        }
      } else {
        totalItems++;
        if (hasVariants) {
          totalVariants += itemData.modifiers.reduce((s, m) => s + m.options.length, 0);
        }
      }
    }

    console.log();
  }

  console.log(`━━━ Summary ━━━`);
  console.log(`  Categories : ${totalCategories}`);
  console.log(`  Items      : ${totalItems}`);
  console.log(`  Variants   : ${totalVariants}`);

  if (dryRun) {
    console.log(`\n[DRY RUN] No data written.`);
  } else {
    console.log(`\nImport complete.`);
  }
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
