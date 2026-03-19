import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";

const SAMPLE_CATEGORIES = [
  {
    name: "Pizzas Tradicionais",
    description: "Sabores clássicos que todo mundo ama",
    sortOrder: 1,
    items: [
      {
        name: "Margherita",
        description: "Molho de tomate, mussarela, manjericão fresco e azeite",
        price: 42.9,
        sortOrder: 1,
      },
      {
        name: "Calabresa",
        description: "Molho de tomate, mussarela, calabresa fatiada e cebola",
        price: 44.9,
        sortOrder: 2,
      },
      {
        name: "Frango com Catupiry",
        description: "Molho de tomate, mussarela, frango desfiado e catupiry",
        price: 46.9,
        sortOrder: 3,
      },
      {
        name: "Portuguesa",
        description: "Molho de tomate, mussarela, presunto, ovo, ervilha e cebola",
        price: 46.9,
        sortOrder: 4,
      },
    ],
  },
  {
    name: "Pizzas Especiais",
    description: "Combinações premium para os mais exigentes",
    sortOrder: 2,
    items: [
      {
        name: "Quatro Queijos",
        description: "Mussarela, parmesão, provolone e catupiry",
        price: 54.9,
        sortOrder: 1,
      },
      {
        name: "Camarão",
        description: "Molho de tomate, mussarela, camarão temperado e alho dourado",
        price: 64.9,
        sortOrder: 2,
      },
      {
        name: "Lombo com Gorgonzola",
        description: "Molho de tomate, mussarela, lombo defumado e gorgonzola",
        price: 58.9,
        sortOrder: 3,
      },
    ],
  },
  {
    name: "Bebidas",
    description: "Refrescos e sucos para acompanhar",
    sortOrder: 3,
    items: [
      {
        name: "Coca-Cola 2L",
        description: "Garrafa 2 litros geladinha",
        price: 12.9,
        sortOrder: 1,
      },
      {
        name: "Suco de Laranja 500ml",
        description: "Suco natural espremido na hora",
        price: 9.9,
        sortOrder: 2,
      },
    ],
  },
  {
    name: "Sobremesas",
    description: "Doces para finalizar com chave de ouro",
    sortOrder: 4,
    items: [
      {
        name: "Petit Gâteau",
        description: "Bolo quente de chocolate com sorvete de baunilha",
        price: 19.9,
        sortOrder: 1,
      },
      {
        name: "Sorvete 2 Bolas",
        description: "Escolha 2 sabores: chocolate, morango ou creme",
        price: 12.9,
        sortOrder: 2,
      },
    ],
  },
];

/** GET – check if seeding is allowed (menu is empty) */
export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const count = await prisma.menuCategory.count({
      where: { restaurantId: ctx.restaurantId },
    });

    return ok({ seedAllowed: count === 0, existingCategories: count });
  } catch (err) {
    console.error("[GET /api/seed-menu]", err);
    return serverError();
  }
}

/** POST – seed sample pizzeria menu (only if menu is empty) */
export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) {
      return badRequest("Only OWNER or MANAGER can seed the menu.");
    }

    const count = await prisma.menuCategory.count({
      where: { restaurantId: ctx.restaurantId },
    });

    if (count > 0) {
      return badRequest(
        "Menu already has data. Seeding is only allowed when the menu is empty."
      );
    }

    const created: { categories: number; items: number } = {
      categories: 0,
      items: 0,
    };

    for (const cat of SAMPLE_CATEGORIES) {
      const { items, ...catData } = cat;
      const category = await prisma.menuCategory.create({
        data: {
          restaurantId: ctx.restaurantId,
          name: catData.name,
          description: catData.description,
          sortOrder: catData.sortOrder,
          isActive: true,
          source: "MANUAL",
          items: {
            create: items.map((item) => ({
              name: item.name,
              description: item.description,
              price: item.price,
              sortOrder: item.sortOrder,
              isActive: true,
            })),
          },
        },
      });
      created.categories += 1;
      created.items += items.length;
      void category; // suppress unused warning
    }

    return ok({
      message: "Cardápio de exemplo criado com sucesso!",
      created,
    });
  } catch (err) {
    console.error("[POST /api/seed-menu]", err);
    return serverError();
  }
}
