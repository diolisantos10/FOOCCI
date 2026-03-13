/**
 * UserService
 *
 * Manages users (staff) within a restaurant tenant.
 * Every method receives restaurantId explicitly — never queries across tenants.
 */

import { hash, compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type {
  CreateUserInput,
  UpdateUserInput,
  ChangePasswordInput,
} from "@/validators/user";
import type { User } from "@prisma/client";

export type UserPublic = Omit<User, "password">;

export class UserService {
  /**
   * List all users for a restaurant (excludes passwords).
   */
  static async list(restaurantId: string): Promise<ServiceResult<UserPublic[]>> {
    const users = await prisma.user.findMany({
      where: { restaurantId },
      omit: { password: true },
      orderBy: { createdAt: "asc" },
    });

    return serviceOk(users);
  }

  /**
   * Get a single user by id, scoped to the tenant.
   */
  static async getById(
    restaurantId: string,
    userId: string
  ): Promise<ServiceResult<UserPublic>> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      omit: { password: true },
    });

    if (!user || user.restaurantId !== restaurantId) {
      return serviceFail("User not found", 404);
    }

    return serviceOk(user);
  }

  /**
   * Create a new user (staff member) within the tenant.
   */
  static async create(
    restaurantId: string,
    input: CreateUserInput
  ): Promise<ServiceResult<UserPublic>> {
    const existing = await prisma.user.findUnique({
      where: {
        email_restaurantId: { email: input.email, restaurantId },
      },
      select: { id: true },
    });

    if (existing) {
      return serviceFail(
        "A user with this email already exists in this restaurant.",
        409
      );
    }

    const hashedPassword = await hash(input.password, 12);

    const user = await prisma.user.create({
      data: {
        restaurantId,
        name: input.name,
        email: input.email,
        password: hashedPassword,
        role: input.role,
      },
      omit: { password: true },
    });

    return serviceOk(user);
  }

  /**
   * Update a user's mutable fields.
   * Password changes go through changePassword() instead.
   */
  static async update(
    restaurantId: string,
    userId: string,
    input: UpdateUserInput
  ): Promise<ServiceResult<UserPublic>> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, restaurantId: true },
    });

    if (!user || user.restaurantId !== restaurantId) {
      return serviceFail("User not found", 404);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.role !== undefined && { role: input.role }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
      omit: { password: true },
    });

    return serviceOk(updated);
  }

  /**
   * Change password with current password verification.
   */
  static async changePassword(
    restaurantId: string,
    userId: string,
    input: ChangePasswordInput
  ): Promise<ServiceResult<{ message: string }>> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, restaurantId: true, password: true },
    });

    if (!user || user.restaurantId !== restaurantId) {
      return serviceFail("User not found", 404);
    }

    const isValid = await compare(input.currentPassword, user.password);
    if (!isValid) {
      return serviceFail("Current password is incorrect", 400);
    }

    const hashedPassword = await hash(input.newPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return serviceOk({ message: "Password changed successfully" });
  }

  /**
   * Soft-delete: deactivate instead of destroying the record.
   * Preserves referential integrity for orders, messages, etc.
   */
  static async deactivate(
    restaurantId: string,
    userId: string,
    requestingUserId: string
  ): Promise<ServiceResult<{ message: string }>> {
    if (userId === requestingUserId) {
      return serviceFail("You cannot deactivate your own account", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, restaurantId: true, role: true },
    });

    if (!user || user.restaurantId !== restaurantId) {
      return serviceFail("User not found", 404);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return serviceOk({ message: "User deactivated" });
  }
}
