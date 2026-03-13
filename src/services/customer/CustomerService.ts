import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult, PaginatedResult } from "@/types";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerListQuery,
} from "@/validators/customer";
import type { Customer } from "@prisma/client";

export class CustomerService {
  static async list(
    restaurantId: string,
    query: CustomerListQuery
  ): Promise<ServiceResult<PaginatedResult<Customer>>> {
    const { page, limit, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where = {
      restaurantId,
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    return serviceOk({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  static async getById(
    restaurantId: string,
    customerId: string
  ): Promise<ServiceResult<Customer & { addresses: unknown[] }>> {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] } },
    });

    if (!customer || customer.restaurantId !== restaurantId) {
      return serviceFail("Customer not found", 404);
    }

    return serviceOk(customer);
  }

  static async create(
    restaurantId: string,
    input: CreateCustomerInput
  ): Promise<ServiceResult<Customer>> {
    const existing = await prisma.customer.findUnique({
      where: { phone_restaurantId: { phone: input.phone, restaurantId } },
      select: { id: true },
    });

    if (existing) {
      return serviceFail(
        "A customer with this phone number already exists.",
        409
      );
    }

    const customer = await prisma.customer.create({
      data: {
        restaurantId,
        name: input.name,
        phone: input.phone,
        email: input.email || null,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        notes: input.notes,
      },
    });

    return serviceOk(customer);
  }

  static async update(
    restaurantId: string,
    customerId: string,
    input: UpdateCustomerInput
  ): Promise<ServiceResult<Customer>> {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, restaurantId: true, phone: true },
    });

    if (!customer || customer.restaurantId !== restaurantId) {
      return serviceFail("Customer not found", 404);
    }

    // Check phone uniqueness only if phone is changing
    if (input.phone && input.phone !== customer.phone) {
      const conflict = await prisma.customer.findUnique({
        where: { phone_restaurantId: { phone: input.phone, restaurantId } },
        select: { id: true },
      });
      if (conflict) {
        return serviceFail("Phone number already in use by another customer.", 409);
      }
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email || null }),
        ...(input.birthDate !== undefined && {
          birthDate: input.birthDate ? new Date(input.birthDate) : null,
        }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    return serviceOk(updated);
  }

  /**
   * Soft delete – deactivates customer and preserves all history.
   */
  static async deactivate(
    restaurantId: string,
    customerId: string
  ): Promise<ServiceResult<{ message: string }>> {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, restaurantId: true },
    });

    if (!customer || customer.restaurantId !== restaurantId) {
      return serviceFail("Customer not found", 404);
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { isActive: false },
    });

    return serviceOk({ message: "Customer deactivated" });
  }
}
