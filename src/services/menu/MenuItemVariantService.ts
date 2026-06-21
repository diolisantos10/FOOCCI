import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type {
  CreateVariantInput,
  UpdateVariantInput,
  ReorderVariantsInput,
} from "@/validators/menu";
import type { MenuItemVariant } from "@prisma/client";

function toChannelDecimal(v: number | null | undefined): Decimal | null | undefined {
  if (v === undefined) return undefined;
  return v === null ? null : new Decimal(v);
}

export class MenuItemVariantService {
  /** Verify that itemId belongs to restaurantId; returns the item or null. */
  private static async resolveItem(restaurantId: string, itemId: string) {
    return prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { category: { select: { restaurantId: true } } },
    }).then((item) =>
      item && item.category.restaurantId === restaurantId ? item : null
    );
  }

  /** Verify that variantId chains back to restaurantId. */
  private static async resolveVariant(restaurantId: string, variantId: string) {
    return prisma.menuItemVariant.findUnique({
      where: { id: variantId },
      include: {
        menuItem: { include: { category: { select: { restaurantId: true } } } },
      },
    }).then((v) =>
      v && v.menuItem.category.restaurantId === restaurantId ? v : null
    );
  }

  static async list(
    restaurantId: string,
    itemId: string
  ): Promise<ServiceResult<MenuItemVariant[]>> {
    const item = await this.resolveItem(restaurantId, itemId);
    if (!item) return serviceFail("Item not found", 404);

    const variants = await prisma.menuItemVariant.findMany({
      where: { menuItemId: itemId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return serviceOk(variants);
  }

  static async create(
    restaurantId: string,
    itemId: string,
    input: CreateVariantInput
  ): Promise<ServiceResult<MenuItemVariant>> {
    const item = await this.resolveItem(restaurantId, itemId);
    if (!item) return serviceFail("Item not found", 404);

    const variant = await prisma.menuItemVariant.create({
      data: {
        menuItemId: itemId,
        name: input.name.trim(),
        // Optional — null means "inherit the product's price" (no override).
        price: input.price == null ? null : new Decimal(input.price),
        priceDelivery: toChannelDecimal(input.priceDelivery) ?? null,
        priceDineIn:   toChannelDecimal(input.priceDineIn) ?? null,
        priceIfood:    toChannelDecimal(input.priceIfood) ?? null,
        portion: input.portion?.trim() ?? null,
        isAvailable: input.isAvailable ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return serviceOk(variant);
  }

  static async update(
    restaurantId: string,
    variantId: string,
    input: UpdateVariantInput
  ): Promise<ServiceResult<MenuItemVariant>> {
    const variant = await this.resolveVariant(restaurantId, variantId);
    if (!variant) return serviceFail("Variant not found", 404);

    const updated = await prisma.menuItemVariant.update({
      where: { id: variantId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.price !== undefined && { price: input.price === null ? null : new Decimal(input.price) }),
        ...(input.priceDelivery !== undefined && { priceDelivery: toChannelDecimal(input.priceDelivery) }),
        ...(input.priceDineIn   !== undefined && { priceDineIn:   toChannelDecimal(input.priceDineIn) }),
        ...(input.priceIfood    !== undefined && { priceIfood:    toChannelDecimal(input.priceIfood) }),
        ...(input.portion !== undefined && { portion: input.portion?.trim() ?? null }),
        ...(input.isAvailable !== undefined && { isAvailable: input.isAvailable }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
    });
    return serviceOk(updated);
  }

  static async reorder(
    restaurantId: string,
    itemId: string,
    input: ReorderVariantsInput
  ): Promise<ServiceResult<{ message: string }>> {
    const item = await this.resolveItem(restaurantId, itemId);
    if (!item) return serviceFail("Item not found", 404);

    await prisma.$transaction(
      input.items.map(({ id, sortOrder }) =>
        prisma.menuItemVariant.updateMany({
          where: { id, menuItemId: itemId },
          data: { sortOrder },
        })
      )
    );
    return serviceOk({ message: "Variants reordered" });
  }

  static async remove(
    restaurantId: string,
    variantId: string
  ): Promise<ServiceResult<{ message: string }>> {
    const variant = await this.resolveVariant(restaurantId, variantId);
    if (!variant) return serviceFail("Variant not found", 404);

    await prisma.menuItemVariant.delete({ where: { id: variantId } });
    return serviceOk({ message: "Variant deleted" });
  }
}
