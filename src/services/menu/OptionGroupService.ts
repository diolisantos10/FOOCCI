import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type {
  CreateOptionGroupInput,
  UpdateOptionGroupInput,
  CreateOptionItemInput,
  UpdateOptionItemInput,
} from "@/validators/menu";
import type { OptionGroup, OptionGroupItem } from "@prisma/client";

type OptionGroupWithItems = OptionGroup & { options: OptionGroupItem[] };

export class OptionGroupService {
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

  private static async resolveGroup(restaurantId: string, groupId: string) {
    return prisma.optionGroup
      .findUnique({
        where: { id: groupId },
        include: {
          menuItem: { include: { category: { select: { restaurantId: true } } } },
        },
      })
      .then((g) =>
        g && g.menuItem.category.restaurantId === restaurantId ? g : null
      );
  }

  private static async resolveOptionItem(restaurantId: string, optionItemId: string) {
    return prisma.optionGroupItem
      .findUnique({
        where: { id: optionItemId },
        include: {
          group: {
            include: {
              menuItem: { include: { category: { select: { restaurantId: true } } } },
            },
          },
        },
      })
      .then((o) =>
        o && o.group.menuItem.category.restaurantId === restaurantId ? o : null
      );
  }

  // ── Option Groups ──────────────────────────────────────────────────────────

  static async list(
    restaurantId: string,
    itemId: string
  ): Promise<ServiceResult<OptionGroupWithItems[]>> {
    const item = await this.resolveItem(restaurantId, itemId);
    if (!item) return serviceFail("Item not found", 404);

    const groups = await prisma.optionGroup.findMany({
      where: { menuItemId: itemId },
      orderBy: { sortOrder: "asc" },
      include: {
        options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
    });
    return serviceOk(groups);
  }

  static async createGroup(
    restaurantId: string,
    itemId: string,
    input: CreateOptionGroupInput
  ): Promise<ServiceResult<OptionGroupWithItems>> {
    const item = await this.resolveItem(restaurantId, itemId);
    if (!item) return serviceFail("Item not found", 404);

    const group = await prisma.optionGroup.create({
      data: {
        menuItemId: itemId,
        name: input.name.trim(),
        required: input.required ?? false,
        minSelect: input.minSelect ?? 0,
        maxSelect: input.maxSelect ?? 1,
        sortOrder: input.sortOrder ?? 0,
      },
      include: { options: true },
    });
    return serviceOk(group);
  }

  static async updateGroup(
    restaurantId: string,
    groupId: string,
    input: UpdateOptionGroupInput
  ): Promise<ServiceResult<OptionGroupWithItems>> {
    const group = await this.resolveGroup(restaurantId, groupId);
    if (!group) return serviceFail("Group not found", 404);

    const updated = await prisma.optionGroup.update({
      where: { id: groupId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.required !== undefined && { required: input.required }),
        ...(input.minSelect !== undefined && { minSelect: input.minSelect }),
        ...(input.maxSelect !== undefined && { maxSelect: input.maxSelect }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
      include: { options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    });
    return serviceOk(updated);
  }

  static async removeGroup(
    restaurantId: string,
    groupId: string
  ): Promise<ServiceResult<{ message: string }>> {
    const group = await this.resolveGroup(restaurantId, groupId);
    if (!group) return serviceFail("Group not found", 404);

    await prisma.optionGroup.delete({ where: { id: groupId } });
    return serviceOk({ message: "Group deleted" });
  }

  // ── Option Items ────────────────────────────────────────────────────────────

  static async createOption(
    restaurantId: string,
    groupId: string,
    input: CreateOptionItemInput
  ): Promise<ServiceResult<OptionGroupItem>> {
    const group = await this.resolveGroup(restaurantId, groupId);
    if (!group) return serviceFail("Group not found", 404);

    const option = await prisma.optionGroupItem.create({
      data: {
        groupId,
        name: input.name.trim(),
        price: new Decimal(input.price ?? 0),
        portion: input.portion?.trim() ?? null,
        isAvailable: input.isAvailable ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return serviceOk(option);
  }

  static async updateOption(
    restaurantId: string,
    optionItemId: string,
    input: UpdateOptionItemInput
  ): Promise<ServiceResult<OptionGroupItem>> {
    const option = await this.resolveOptionItem(restaurantId, optionItemId);
    if (!option) return serviceFail("Option not found", 404);

    const updated = await prisma.optionGroupItem.update({
      where: { id: optionItemId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.price !== undefined && { price: new Decimal(input.price) }),
        ...(input.portion !== undefined && { portion: input.portion?.trim() ?? null }),
        ...(input.isAvailable !== undefined && { isAvailable: input.isAvailable }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
    });
    return serviceOk(updated);
  }

  static async removeOption(
    restaurantId: string,
    optionItemId: string
  ): Promise<ServiceResult<{ message: string }>> {
    const option = await this.resolveOptionItem(restaurantId, optionItemId);
    if (!option) return serviceFail("Option not found", 404);

    await prisma.optionGroupItem.delete({ where: { id: optionItemId } });
    return serviceOk({ message: "Option deleted" });
  }
}
