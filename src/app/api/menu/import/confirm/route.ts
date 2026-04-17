import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized, badRequest, serverError, ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

const itemSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  price: z.number().min(0),
});

const categorySchema = z.object({
  name: z.string().min(1),
  items: z.array(itemSchema),
});

const bodySchema = z.object({
  categories: z.array(categorySchema).min(1),
  clearExisting: z.boolean().default(true),
});

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

    const { categories, clearExisting } = parsed.data;

    // Strip empty names / items
    const validCats = categories
      .filter((c) => c.name.trim())
      .map((c) => ({
        ...c,
        name: c.name.trim(),
        items: c.items.filter((i) => i.name.trim()).map((i) => ({
          ...i,
          name: i.name.trim(),
          description: i.description.trim(),
        })),
      }))
      .filter((c) => c.items.length > 0);

    if (validCats.length === 0) {
      return badRequest("Nenhuma categoria ou item válido para importar.");
    }

    await prisma.$transaction(async (tx) => {
      if (clearExisting) {
        // menuCategory → menuItem → menuItemVariant cascade is set up in schema
        await tx.menuCategory.deleteMany({ where: { restaurantId } });
      }

      let ci = 0;
      for (const cat of validCats) {
        const category = await tx.menuCategory.create({
          data: {
            restaurantId,
            name: cat.name,
            isActive: true,
            isAvailable: true,
            showInDelivery: true,
            showInDineIn: true,
            sortOrder: ci++,
            source: "MANUAL",
          },
        });

        let ii = 0;
        for (const item of cat.items) {
          await tx.menuItem.create({
            data: {
              categoryId: category.id,
              name: item.name,
              description: item.description || null,
              price: item.price,
              isActive: true,
              isAvailable: true,
              showInDelivery: true,
              showInDineIn: true,
              hasVariants: false,
              sortOrder: ii++,
            },
          });
        }
      }
    });

    const totalItems = validCats.reduce((s, c) => s + c.items.length, 0);
    return ok({ categories: validCats.length, items: totalItems });
  } catch (e) {
    console.error("[POST /api/menu/import/confirm]", e);
    return serverError("Erro ao salvar cardápio.");
  }
}
