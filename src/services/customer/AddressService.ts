import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type { CreateAddressInput, UpdateAddressInput } from "@/validators/address";
import type { Address } from "@prisma/client";

export class AddressService {
  /**
   * Verify customer belongs to the tenant before any address operation.
   */
  private static async assertCustomerOwnership(
    restaurantId: string,
    customerId: string
  ): Promise<boolean> {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { restaurantId: true },
    });
    return customer?.restaurantId === restaurantId;
  }

  static async list(
    restaurantId: string,
    customerId: string
  ): Promise<ServiceResult<Address[]>> {
    const owned = await this.assertCustomerOwnership(restaurantId, customerId);
    if (!owned) return serviceFail("Customer not found", 404);

    const addresses = await prisma.address.findMany({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return serviceOk(addresses);
  }

  static async create(
    restaurantId: string,
    customerId: string,
    input: CreateAddressInput
  ): Promise<ServiceResult<Address>> {
    const owned = await this.assertCustomerOwnership(restaurantId, customerId);
    if (!owned) return serviceFail("Customer not found", 404);

    // If this is the first address or explicitly set as default, clear others
    const address = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.address.count({ where: { customerId } });
      const shouldBeDefault = input.isDefault || existingCount === 0;

      if (shouldBeDefault) {
        await tx.address.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          customerId,
          label: input.label,
          street: input.street,
          number: input.number,
          complement: input.complement,
          neighborhood: input.neighborhood,
          city: input.city,
          state: input.state,
          zipCode: input.zipCode.replace("-", ""),
          isDefault: shouldBeDefault,
        },
      });
    });

    return serviceOk(address);
  }

  static async update(
    restaurantId: string,
    customerId: string,
    addressId: string,
    input: UpdateAddressInput
  ): Promise<ServiceResult<Address>> {
    const owned = await this.assertCustomerOwnership(restaurantId, customerId);
    if (!owned) return serviceFail("Customer not found", 404);

    const address = await prisma.address.findUnique({
      where: { id: addressId },
      select: { id: true, customerId: true },
    });

    if (!address || address.customerId !== customerId) {
      return serviceFail("Address not found", 404);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.address.updateMany({
          where: { customerId, id: { not: addressId } },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id: addressId },
        data: {
          ...(input.label !== undefined && { label: input.label }),
          ...(input.street !== undefined && { street: input.street }),
          ...(input.number !== undefined && { number: input.number }),
          ...(input.complement !== undefined && { complement: input.complement }),
          ...(input.neighborhood !== undefined && { neighborhood: input.neighborhood }),
          ...(input.city !== undefined && { city: input.city }),
          ...(input.state !== undefined && { state: input.state }),
          ...(input.zipCode !== undefined && { zipCode: input.zipCode.replace("-", "") }),
          ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
        },
      });
    });

    return serviceOk(updated);
  }

  static async remove(
    restaurantId: string,
    customerId: string,
    addressId: string
  ): Promise<ServiceResult<{ message: string }>> {
    const owned = await this.assertCustomerOwnership(restaurantId, customerId);
    if (!owned) return serviceFail("Customer not found", 404);

    const address = await prisma.address.findUnique({
      where: { id: addressId },
      select: { id: true, customerId: true, isDefault: true },
    });

    if (!address || address.customerId !== customerId) {
      return serviceFail("Address not found", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: addressId } });

      // If deleted address was default, promote the most recent remaining one
      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { customerId },
          orderBy: { createdAt: "desc" },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return serviceOk({ message: "Address removed" });
  }
}
