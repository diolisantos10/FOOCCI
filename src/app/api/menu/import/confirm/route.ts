import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized, badRequest, serverError, ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const rowSchema = z.object({
  rowIndex: z.number(),
  foto: z.string().refine(
    (val) => val === "" || /^https?:\/\//i.test(val),
    { message: "imageUrl must use http or https" }
  ),
  categoria: z.string(),
  nome: z.string(),
  descricao: z.string(),
  ingredients: z.string().optional().default(""),
  precoRaw: z.string(),
  preco: z.number().min(0),
  // Optional so a client that predates the cost column keeps working unchanged.
  custoRaw: z.string().optional().default(""),
  custo: z.number().min(0).nullable().optional().default(null),
  showInDelivery: z.boolean().optional().default(true),
  showInDineIn: z.boolean().optional().default(true),
  hasVariants: z.boolean().optional().default(false),
  servingSize: z.number().nullable().optional().default(null),
  portionInfo: z.string().optional().default(""),
  code: z.string().optional().default(""),
  tagFunil: z.string().optional().default(""),
  perfilPaladar: z.string().optional().default(""),
  harmonizacaoSugerida: z.string().optional().default(""),
  alergenosDetalhados: z.string().optional().default(""),
  storytellingIA: z.string().optional().default(""),
  status: z.enum(["valid", "error", "skipped"]),
  errors: z.array(z.string()),
});

const bodySchema = z.object({
  rows: z.array(rowSchema),
  mode: z.enum(["replace", "append"]),
});

// ── Response type ─────────────────────────────────────────────────────────────

export type ImportSummary = {
  categoriesCreated: number;
  itemsCreated: number;
  skipped: number;
  duplicatesSkipped: number;
  failed: number;
  errors: string[];
};

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const { restaurantId } = ctx;

  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return badRequest("Dados inválidos.", parsed.error.flatten());
    }

    const { rows, mode } = parsed.data;

    // Only process rows marked valid
    const validRows = rows.filter((r) => r.status === "valid");
    const errorRows = rows.filter((r) => r.status === "error");

    if (validRows.length === 0) {
      return badRequest("Nenhuma linha válida para importar.");
    }

    const errors: string[] = [];
    let categoriesCreated = 0;
    let itemsCreated = 0;
    let failed = 0;
    let duplicatesSkipped = 0;

    // Errors from the preview are skipped (not failed — they were known invalid)
    const skipped = errorRows.length;

    await prisma.$transaction(async (tx) => {
      // ── Replace: wipe existing menu ───────────────────────────────────────
      if (mode === "replace") {
        // onDelete: Cascade handles items + variants
        await tx.menuCategory.deleteMany({ where: { restaurantId } });
      }

      // ── Build ordered unique category list from valid rows ─────────────────
      const catOrder: string[] = [];
      const catSeen = new Set<string>();
      for (const row of validRows) {
        if (!catSeen.has(row.categoria)) {
          catSeen.add(row.categoria);
          catOrder.push(row.categoria);
        }
      }

      // ── Append: find existing categories + items (to avoid duplicates) ───────
      const existingCatMap = new Map<string, string>(); // lowerName → id
      // catId → Set of lower-cased item names already in that category
      const existingItemNames = new Map<string, Set<string>>();
      let catSortBase = 0;

      if (mode === "append") {
        const existing = await tx.menuCategory.findMany({
          where: { restaurantId },
          select: { id: true, name: true, sortOrder: true, items: { select: { name: true } } },
          orderBy: { sortOrder: "asc" },
        });
        for (const c of existing) {
          existingCatMap.set(c.name.toLowerCase(), c.id);
          existingItemNames.set(
            c.id,
            new Set(c.items.map((i) => i.name.toLowerCase().trim()))
          );
        }
        const maxSort = existing[existing.length - 1]?.sortOrder ?? -1;
        catSortBase = maxSort + 1;
      }

      // ── Create or resolve categories ───────────────────────────────────────
      const catIdMap = new Map<string, string>(); // catName → id
      // Track next sortOrder for items per category
      const itemSortMap = new Map<string, number>(); // catId → next sortOrder

      for (let ci = 0; ci < catOrder.length; ci++) {
        const catName = catOrder[ci]!;
        const existingId = existingCatMap.get(catName.toLowerCase());

        if (existingId) {
          catIdMap.set(catName, existingId);
          // Find current max item sortOrder for this category
          const maxItem = await tx.menuItem.findFirst({
            where: { categoryId: existingId },
            orderBy: { sortOrder: "desc" },
            select: { sortOrder: true },
          });
          itemSortMap.set(existingId, (maxItem?.sortOrder ?? -1) + 1);
        } else {
          const sortOrder = mode === "replace" ? ci : catSortBase + ci;
          const cat = await tx.menuCategory.create({
            data: {
              restaurantId,
              name: catName,
              isActive: true,
              isAvailable: true,
              showInDelivery: true,
              showInDineIn: true,
              sortOrder,
              source: "MANUAL",
            },
          });
          catIdMap.set(catName, cat.id);
          itemSortMap.set(cat.id, 0);
          categoriesCreated++;
        }
      }

      // ── Create items (skip duplicates in append mode) ──────────────────────
      for (const row of validRows) {
        try {
          const catId = catIdMap.get(row.categoria);
          if (!catId) {
            errors.push(
              `Linha ${row.rowIndex}: categoria "${row.categoria}" não mapeada`
            );
            failed++;
            continue;
          }

          // Skip if item with same name already exists in this category (append mode)
          const existingNames = existingItemNames.get(catId);
          if (existingNames?.has(row.nome.toLowerCase().trim())) {
            duplicatesSkipped++;
            continue;
          }

          const sortOrder = itemSortMap.get(catId) ?? 0;
          itemSortMap.set(catId, sortOrder + 1);

          await tx.menuItem.create({
            data: {
              categoryId:          catId,
              name:                row.nome,
              description:         row.descricao         || null,
              ingredients:         row.ingredients       || null,
              price:               row.preco,
              // Safe to set directly here: this path only CREATES items (an existing
              // name is skipped as a duplicate), so there is no previous cost to audit
              // and no reprice to trigger. Changing the cost of an EXISTING item must
              // still go through updateCostsWithReprice.
              cost:                row.custo ?? null,
              imageUrl:            row.foto              || null,
              isActive:            true,
              isAvailable:         true,
              showInDelivery:      row.showInDelivery    ?? true,
              showInDineIn:        row.showInDineIn      ?? true,
              hasVariants:         row.hasVariants       ?? false,
              servingSize:         row.servingSize       ?? null,
              portionInfo:         row.portionInfo       || null,
              code:                row.code              || null,
              tagFunil:            row.tagFunil          || null,
              perfilPaladar:       row.perfilPaladar     || null,
              harmonizacaoSugerida:row.harmonizacaoSugerida || null,
              alergenosDetalhados: row.alergenosDetalhados  || null,
              storytellingIA:      row.storytellingIA       || null,
              sortOrder,
            },
          });
          itemsCreated++;
        } catch {
          errors.push(
            `Linha ${row.rowIndex}: falha ao criar "${row.nome}"`
          );
          failed++;
        }
      }
    });

    return ok<ImportSummary>({
      categoriesCreated,
      itemsCreated,
      skipped,
      duplicatesSkipped,
      failed,
      errors,
    });
  } catch (e) {
    console.error("[POST /api/menu/import/confirm]", e);
    return serverError("Erro ao importar cardápio.");
  }
}
