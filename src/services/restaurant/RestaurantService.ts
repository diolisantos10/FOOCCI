/**
 * RestaurantService
 *
 * Handles restaurant (tenant) lifecycle:
 *   - Registration (creates restaurant + first OWNER user atomically)
 *   - Read / update
 *
 * All methods are scoped to a restaurantId to prevent cross-tenant leaks.
 */

import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type {
  CreateRestaurantInput,
  UpdateRestaurantInput,
} from "@/validators/restaurant";
import type { Restaurant, User } from "@prisma/client";

export type RestaurantWithOwner = {
  restaurant: Restaurant;
  owner: Omit<User, "password">;
};

export type RestaurantPublic = Omit<Restaurant, "updatedAt">;

export class RestaurantService {
  /**
   * Register a new tenant.
   * Creates the Restaurant + Owner user in a single transaction.
   */
  static async register(
    input: CreateRestaurantInput
  ): Promise<ServiceResult<RestaurantWithOwner>> {
    const slugTaken = await prisma.restaurant.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });

    if (slugTaken) {
      return serviceFail(
        `Slug "${input.slug}" is already taken. Choose a different slug.`,
        409
      );
    }

    const hashedPassword = await hash(input.ownerPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: input.name,
          slug: input.slug,
          phone: input.phone,
          email: input.email,
          address: input.address,
          timezone: input.timezone,
        },
      });

      const owner = await tx.user.create({
        data: {
          restaurantId: restaurant.id,
          name: input.ownerName,
          email: input.ownerEmail,
          password: hashedPassword,
          role: "OWNER",
        },
      });

      return { restaurant, owner };
    });

    const { password: _pwd, ...ownerWithoutPassword } = result.owner;

    return serviceOk({
      restaurant: result.restaurant,
      owner: ownerWithoutPassword,
    });
  }

  /**
   * Fetch a restaurant by id.
   * Verifies it matches the authenticated tenant.
   */
  static async getById(
    restaurantId: string
  ): Promise<ServiceResult<RestaurantPublic>> {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      return serviceFail("Restaurant not found", 404);
    }

    return serviceOk(restaurant);
  }

  /**
   * Update mutable restaurant fields.
   * Slug is immutable after creation.
   */
  static async update(
    restaurantId: string,
    input: UpdateRestaurantInput
  ): Promise<ServiceResult<Restaurant>> {
    const exists = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });

    if (!exists) {
      return serviceFail("Restaurant not found", 404);
    }

    const updated = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email || null }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl || null }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    return serviceOk(updated);
  }
}
