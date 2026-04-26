import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type { CreateExtraInput, UpdateExtraInput } from "@/validators/menu";
import type { MenuItemExtra } from "@prisma/client";

export class MenuItemExtraService {
  private static async resolveItem(restaurantId: string, itemId: string) {
    return prisma.menuItem
      .findUnique({
        where: { id: itemId },
        include: { category: { select: { restaurantId: true } } },
      })
      .then((item) =>
        item && item.category.restaurantId === restaurantId ? item : null
      );
  }

  private static async resolveExtra(restaurantId: string, extraId: string) {
    return prisma.menuItemExtra
      .findUnique({
        where: { id: extraId },
        include: {
          menuItem: { include: { category: { select: { restaurantId: true } } } },
        },
      })
      .then((e) =>
        e && e.menuItem.category.restaurantId === restaurantId ? e : null
      );
  }

  static async list(
    restaurantId: string,
    itemId: string
  ): Promise<ServiceResult<MenuItemExtra[]>> {
    const item = await this.resolveItem(restaurantId, itemId);
    if (!item) return serviceFail("Item not found", 404);

    const extras = await prisma.menuItemExtra.findMany({
      where: { menuItemId: itemId },
      orderBy: { name: "asc" },
    });
    return serviceOk(extras);
  }

  static async create(
    restaurantId: string,
    itemId: string,
    input: CreateExtraInput
  ): Promise<ServiceResult<MenuItemExtra>> {
    const item = await this.resolveItem(restaurantId, itemId);
    if (!item) return serviceFail("Item not found", 404);

    const extra = await prisma.menuItemExtra.create({
      data: {
        menuItemId: itemId,
        name: input.name.trim(),
        quantity: input.quantity,
        price: new Decimal(input.price),
        portion: input.portion?.trim() ?? null,
        isAvailable: input.isAvailable ?? true,
      },
    });
    return serviceOk(extra);
  }

  static async update(
    restaurantId: string,
    extraId: string,
    input: UpdateExtraInput
  ): Promise<ServiceResult<MenuItemExtra>> {
    const extra = await this.resolveExtra(restaurantId, extraId);
    if (!extra) return serviceFail("Extra not found", 404);

    const updated = await prisma.menuItemExtra.update({
      where: { id: extraId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.quantity !== undefined && { quantity: input.quantity }),
        ...(input.price !== undefined && { price: new Decimal(input.price) }),
        ...(input.portion !== undefined && { portion: input.portion?.trim() ?? null }),
        ...(input.isAvailable !== undefined && { isAvailable: input.isAvailable }),
      },
    });
    return serviceOk(updated);
  }

  static async remove(
    restaurantId: string,
    extraId: string
  ): Promise<ServiceResult<{ message: string }>> {
    const extra = await this.resolveExtra(restaurantId, extraId);
    if (!extra) return serviceFail("Extra not found", 404);

    await prisma.menuItemExtra.delete({ where: { id: extraId } });
    return serviceOk({ message: "Extra deleted" });
  }
}
