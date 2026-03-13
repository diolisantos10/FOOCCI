import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type {
  CreateMenuCategoryInput,
  UpdateMenuCategoryInput,
  ReorderCategoriesInput,
} from "@/validators/menu";
import type { MenuCategory } from "@prisma/client";

export type MenuCategoryWithItemCount = MenuCategory & { _count: { items: number } };

export class MenuCategoryService {
  static async list(
    restaurantId: string,
    activeOnly = false
  ): Promise<ServiceResult<MenuCategoryWithItemCount[]>> {
    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId, ...(activeOnly && { isActive: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { items: true } } },
    });

    return serviceOk(categories);
  }

  static async getById(
    restaurantId: string,
    categoryId: string
  ): Promise<ServiceResult<MenuCategory & { items: unknown[] }>> {
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      include: {
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return serviceFail("Category not found", 404);
    }

    return serviceOk(category);
  }

  static async create(
    restaurantId: string,
    input: CreateMenuCategoryInput
  ): Promise<ServiceResult<MenuCategory>> {
    const category = await prisma.menuCategory.create({
      data: {
        restaurantId,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl || null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });

    return serviceOk(category);
  }

  static async update(
    restaurantId: string,
    categoryId: string,
    input: UpdateMenuCategoryInput
  ): Promise<ServiceResult<MenuCategory>> {
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, restaurantId: true },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return serviceFail("Category not found", 404);
    }

    const updated = await prisma.menuCategory.update({
      where: { id: categoryId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl || null }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    return serviceOk(updated);
  }

  /**
   * Batch-update sortOrder for multiple categories in a single transaction.
   */
  static async reorder(
    restaurantId: string,
    input: ReorderCategoriesInput
  ): Promise<ServiceResult<{ message: string }>> {
    await prisma.$transaction(
      input.items.map(({ id, sortOrder }) =>
        prisma.menuCategory.updateMany({
          where: { id, restaurantId },
          data: { sortOrder },
        })
      )
    );

    return serviceOk({ message: "Categories reordered" });
  }

  static async remove(
    restaurantId: string,
    categoryId: string
  ): Promise<ServiceResult<{ message: string }>> {
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, restaurantId: true, _count: { select: { items: true } } },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return serviceFail("Category not found", 404);
    }

    if (category._count.items > 0) {
      return serviceFail(
        "Cannot delete category with existing items. Deactivate it instead.",
        409
      );
    }

    await prisma.menuCategory.delete({ where: { id: categoryId } });

    return serviceOk({ message: "Category deleted" });
  }
}
