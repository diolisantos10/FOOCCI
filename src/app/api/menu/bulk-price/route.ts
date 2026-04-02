import { Decimal } from "@prisma/client/runtime/library";
import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { bulkPriceSchema } from "@/validators/menu";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";

const PRICE_FLOOR = new Decimal("0.01");

function applyAction(current: Decimal, action: string, value: Decimal): Decimal {
  let result: Decimal;
  if (action === "increase") {
    result = current.add(value);
  } else if (action === "decrease") {
    result = current.sub(value);
  } else {
    // "set"
    result = value;
  }
  // Enforce floor and round to 2 decimal places
  return result.lt(PRICE_FLOOR)
    ? PRICE_FLOOR
    : result.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const body = await req.json();
    const parsed = bulkPriceSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const { action, value, categoryId, applyToVariants } = parsed.data;
    const decimalValue = new Decimal(value);

    // Verify categoryId belongs to this restaurant if provided
    if (categoryId) {
      const category = await prisma.menuCategory.findUnique({
        where: { id: categoryId },
        select: { restaurantId: true },
      });
      if (!category || category.restaurantId !== ctx.restaurantId) {
        return badRequest("Categoria não encontrada.");
      }
    }

    // Fetch all active items in scope (with variants if needed)
    const items = await prisma.menuItem.findMany({
      where: {
        isActive: true,
        category: { restaurantId: ctx.restaurantId },
        ...(categoryId ? { categoryId } : {}),
      },
      select: {
        id: true,
        price: true,
        variants: applyToVariants
          ? { select: { id: true, price: true } }
          : false,
      },
    });

    // Build all updates inside a single transaction
    const itemUpdates = items.map((item) =>
      prisma.menuItem.update({
        where: { id: item.id },
        data: { price: applyAction(item.price, action, decimalValue) },
      })
    );

    const variantUpdates = applyToVariants
      ? items.flatMap((item) =>
          (item.variants as { id: string; price: Decimal }[]).map((v) =>
            prisma.menuItemVariant.update({
              where: { id: v.id },
              data: { price: applyAction(v.price, action, decimalValue) },
            })
          )
        )
      : [];

    await prisma.$transaction([...itemUpdates, ...variantUpdates]);

    return ok({
      affected: items.length,
      variantsAffected: variantUpdates.length,
    });
  } catch (err) {
    console.error("[POST /api/menu/bulk-price]", err);
    return serverError();
  }
}
