import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type {
  CreateMenuItemInput,
  UpdateMenuItemInput,
  ReorderItemsInput,
} from "@/validators/menu";
import type { MenuItem } from "@prisma/client";

export class MenuItemService {
  static async listByCategory(
    restaurantId: string,
    categoryId: string,
    activeOnly = false
  ): Promise<ServiceResult<MenuItem[]>> {
    // Verify category belongs to tenant
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { restaurantId: true },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return serviceFail("Category not found", 404);
    }

    const items = await prisma.menuItem.findMany({
      where: { categoryId, ...(activeOnly && { isActive: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return serviceOk(items);
  }

  static async getById(
    restaurantId: string,
    itemId: string
  ): Promise<ServiceResult<MenuItem & { category: { name: string } }>> {
    const item = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { category: { select: { name: true, restaurantId: true } } },
    });

    if (!item || item.category.restaurantId !== restaurantId) {
      return serviceFail("Item not found", 404);
    }

    return serviceOk(item);
  }

  static async create(
    restaurantId: string,
    categoryId: string,
    input: CreateMenuItemInput
  ): Promise<ServiceResult<MenuItem>> {
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { restaurantId: true },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return serviceFail("Category not found", 404);
    }

    const item = await prisma.menuItem.create({
      data: {
        categoryId,
        name: input.name,
        description: input.description,
        ingredients: input.ingredients,
        price: new Decimal(input.price),
        imageUrl: input.imageUrl || null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        isAvailable: input.isAvailable ?? true,
        showInDelivery: input.showInDelivery ?? true,
        showInDineIn: input.showInDineIn ?? true,
        servingSize: input.servingSize ?? null,
        portionInfo: input.portionInfo ?? null,
      },
    });

    return serviceOk(item);
  }

  static async update(
    restaurantId: string,
    itemId: string,
    input: UpdateMenuItemInput
  ): Promise<ServiceResult<MenuItem>> {
    const item = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { category: { select: { restaurantId: true } } },
    });

    if (!item || item.category.restaurantId !== restaurantId) {
      return serviceFail("Item not found", 404);
    }

    // If categoryId is changing, verify the new category belongs to this restaurant
    if (input.categoryId && input.categoryId !== item.categoryId) {
      const newCat = await prisma.menuCategory.findUnique({
        where: { id: input.categoryId },
        select: { restaurantId: true },
      });
      if (!newCat || newCat.restaurantId !== restaurantId) {
        return serviceFail("Category not found", 404);
      }
    }

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.ingredients !== undefined && { ingredients: input.ingredients || null }),
        ...(input.price !== undefined && { price: new Decimal(input.price) }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl || null }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.isAvailable !== undefined && { isAvailable: input.isAvailable }),
        ...(input.showInDelivery !== undefined && { showInDelivery: input.showInDelivery }),
        ...(input.showInDineIn !== undefined && { showInDineIn: input.showInDineIn }),
        ...(input.hasVariants !== undefined && { hasVariants: input.hasVariants }),
        ...(input.code !== undefined && { code: input.code || null }),
        ...(input.servingSize !== undefined && { servingSize: input.servingSize ?? null }),
        ...(input.portionInfo !== undefined && { portionInfo: input.portionInfo ?? null }),
        ...(input.tagFunil             !== undefined && { tagFunil:             input.tagFunil             || null }),
        ...(input.perfilPaladar        !== undefined && { perfilPaladar:        input.perfilPaladar        || null }),
        ...(input.harmonizacaoSugerida !== undefined && { harmonizacaoSugerida: input.harmonizacaoSugerida || null }),
        ...(input.alergenosDetalhados  !== undefined && { alergenosDetalhados:  input.alergenosDetalhados  || null }),
        ...(input.storytellingIA       !== undefined && { storytellingIA:       input.storytellingIA       || null }),
      },
    });

    return serviceOk(updated);
  }

  static async reorder(
    restaurantId: string,
    categoryId: string,
    input: ReorderItemsInput
  ): Promise<ServiceResult<{ message: string }>> {
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { restaurantId: true },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return serviceFail("Category not found", 404);
    }

    await prisma.$transaction(
      input.items.map(({ id, sortOrder }) =>
        prisma.menuItem.updateMany({
          where: { id, categoryId },
          data: { sortOrder },
        })
      )
    );

    return serviceOk({ message: "Items reordered" });
  }

  static async remove(
    restaurantId: string,
    itemId: string
  ): Promise<ServiceResult<{ message: string }>> {
    const item = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { category: { select: { restaurantId: true } } },
    });

    if (!item || item.category.restaurantId !== restaurantId) {
      return serviceFail("Item not found", 404);
    }

    // Soft delete: deactivate instead of physical delete to preserve order history
    await prisma.menuItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });

    return serviceOk({ message: "Item deactivated" });
  }
}
