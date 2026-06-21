/**
 * POST /api/menu/items/[id]/duplicate
 *
 * Deep-copies a MenuItem into a target category, including:
 *   - All base fields and AI-enrichment fields
 *   - MenuItemVariant[] with preserved price/portion/sortOrder
 *   - MenuItemExtra[]  with preserved price/quantity/portion
 *   - OptionGroup[]    with nested OptionGroupItem[] (required/min/max preserved)
 *
 * NOT copied (intentionally):
 *   - Promotions (new product starts clean)
 *   - Placements (belongs to a specific category context)
 *   - ImageEnhancement (AI-generated, can be regenerated)
 *   - Order history
 *
 * The entire copy runs in a single Prisma transaction: if any child fails,
 * the whole duplicate is rolled back.
 *
 * Auth: tenant context (OWNER or MANAGER role).
 * Body: { targetCategoryId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { Decimal } from "@prisma/client/runtime/library";

const bodySchema = z.object({
  targetCategoryId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["OWNER", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw    = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "targetCategoryId é obrigatório" }, { status: 400 });
  }
  const { targetCategoryId } = parsed.data;

  // ── Validate source item belongs to this restaurant ──────────────────────────
  const source = await prisma.menuItem.findFirst({
    where:  { id: params.id, category: { restaurantId: ctx.restaurantId } },
    include: {
      variants:     { orderBy: { sortOrder: "asc" } },
      extras:       true,
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  if (!source) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  // ── Validate target category belongs to this restaurant ──────────────────────
  const targetCategory = await prisma.menuCategory.findFirst({
    where:  { id: targetCategoryId, restaurantId: ctx.restaurantId },
    select: { id: true },
  });

  if (!targetCategory) {
    return NextResponse.json({ error: "Categoria de destino não encontrada" }, { status: 404 });
  }

  // ── Deep copy in a transaction ────────────────────────────────────────────────
  const newItem = await prisma.$transaction(async (tx) => {
    // 1. Create the new MenuItem
    const created = await tx.menuItem.create({
      data: {
        categoryId:           targetCategoryId,
        name:                 source.name,
        description:          source.description,
        ingredients:          source.ingredients,
        price:                new Decimal(source.price.toString()),
        imageUrl:             source.imageUrl,
        sortOrder:            0,
        isActive:             source.isActive,
        isAvailable:          source.isAvailable,
        showInDelivery:       source.showInDelivery,
        showInDineIn:         source.showInDineIn,
        hasVariants:          source.hasVariants,
        code:                 source.code,
        servingSize:          source.servingSize,
        portionInfo:          source.portionInfo,
        tagFunil:             source.tagFunil,
        perfilPaladar:        source.perfilPaladar,
        harmonizacaoSugerida: source.harmonizacaoSugerida,
        alergenosDetalhados:  source.alergenosDetalhados,
        storytellingIA:       source.storytellingIA,
        saiposIntegrationCode: null, // POS code intentionally cleared — new product, new code
      },
    });

    // 2. Copy variants
    if (source.variants.length > 0) {
      await tx.menuItemVariant.createMany({
        data: source.variants.map((v) => ({
          menuItemId:           created.id,
          name:                 v.name,
          // Copy the variant price as-is — a null (inherited) price stays inherited.
          price:                v.price === null ? null : new Decimal(v.price.toString()),
          portion:              v.portion,
          isAvailable:          v.isAvailable,
          sortOrder:            v.sortOrder,
          saiposIntegrationCode: null,
        })),
      });
    }

    // 3. Copy extras (add-ons/adicionais)
    if (source.extras.length > 0) {
      await tx.menuItemExtra.createMany({
        data: source.extras.map((e) => ({
          menuItemId:           created.id,
          name:                 e.name,
          quantity:             e.quantity,
          price:                new Decimal(e.price.toString()),
          portion:              e.portion,
          isAvailable:          e.isAvailable,
          saiposIntegrationCode: null,
        })),
      });
    }

    // 4. Copy option groups and their options (nested, must be sequential)
    for (const group of source.optionGroups) {
      const newGroup = await tx.optionGroup.create({
        data: {
          menuItemId: created.id,
          name:       group.name,
          required:   group.required,
          minSelect:  group.minSelect,
          maxSelect:  group.maxSelect,
          sortOrder:  group.sortOrder,
        },
      });

      if (group.options.length > 0) {
        await tx.optionGroupItem.createMany({
          data: group.options.map((opt) => ({
            groupId:              newGroup.id,
            name:                 opt.name,
            price:                new Decimal(opt.price.toString()),
            portion:              opt.portion,
            isAvailable:          opt.isAvailable,
            sortOrder:            opt.sortOrder,
            saiposIntegrationCode: null,
          })),
        });
      }
    }

    // Return the full new item (with fresh children)
    return tx.menuItem.findUniqueOrThrow({
      where:   { id: created.id },
      include: {
        variants:     { orderBy: { sortOrder: "asc" } },
        extras:       true,
        optionGroups: {
          orderBy: { sortOrder: "asc" },
          include: { options: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
  });

  return NextResponse.json({ success: true, data: newItem }, { status: 201 });
}
