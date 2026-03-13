import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type { AttachPaymentInput, UpdatePaymentStatusInput } from "@/validators/order";
import type { Payment } from "@prisma/client";

export class PaymentService {
  /**
   * Attach a payment record to an order.
   * An order can only have one payment record (enforced by @unique on orderId).
   */
  static async attach(
    restaurantId: string,
    orderId: string,
    input: AttachPaymentInput
  ): Promise<ServiceResult<Payment>> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, restaurantId: true, total: true, status: true, payment: true },
    });

    if (!order || order.restaurantId !== restaurantId) {
      return serviceFail("Order not found", 404);
    }

    if (order.status === "CANCELLED") {
      return serviceFail("Cannot attach payment to a cancelled order", 400);
    }

    if (order.payment) {
      return serviceFail(
        "Order already has a payment record. Use PATCH to update its status.",
        409
      );
    }

    const payment = await prisma.payment.create({
      data: {
        orderId,
        method: input.method,
        amount: new Decimal(input.amount),
        status: "PENDING",
      },
    });

    return serviceOk(payment);
  }

  /**
   * Update payment status (e.g. PENDING → PAID after PIX confirmation).
   */
  static async updateStatus(
    restaurantId: string,
    orderId: string,
    input: UpdatePaymentStatusInput
  ): Promise<ServiceResult<Payment>> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, restaurantId: true, payment: { select: { id: true } } },
    });

    if (!order || order.restaurantId !== restaurantId) {
      return serviceFail("Order not found", 404);
    }

    if (!order.payment) {
      return serviceFail("No payment record found for this order", 404);
    }

    const updated = await prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        status: input.status,
        ...(input.status === "PAID" && {
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        }),
      },
    });

    return serviceOk(updated);
  }

  static async getByOrderId(
    restaurantId: string,
    orderId: string
  ): Promise<ServiceResult<Payment>> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { restaurantId: true, payment: true },
    });

    if (!order || order.restaurantId !== restaurantId) {
      return serviceFail("Order not found", 404);
    }

    if (!order.payment) {
      return serviceFail("No payment record found", 404);
    }

    return serviceOk(order.payment);
  }
}
