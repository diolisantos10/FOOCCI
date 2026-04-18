import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type { AttachPaymentInput, UpdatePaymentStatusInput } from "@/validators/order";
import type { Payment } from "@prisma/client";

// Fields used when creating a payment with a Stone hosted link
export interface StonePaymentFields {
  providerName: "stone";
  providerReference: string;
  paymentUrl: string;
  expiresAt: string; // ISO-8601
}

export class PaymentService {
  /**
   * Attach a payment record to an order.
   * An order can only have one payment record (enforced by @unique on orderId).
   */
  static async attach(
    restaurantId: string,
    orderId: string,
    input: AttachPaymentInput,
    stoneFields?: StonePaymentFields
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
        paymentMode: input.paymentMode ?? "PAY_NOW",
        ...(stoneFields && {
          providerName: stoneFields.providerName,
          providerReference: stoneFields.providerReference,
          paymentUrl: stoneFields.paymentUrl,
          expiresAt: new Date(stoneFields.expiresAt),
        }),
      },
    });

    return serviceOk(payment);
  }

  /**
   * Update payment status (e.g. LINK_SENT → PAID after Stone webhook).
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

  /**
   * Look up a payment by its external provider reference.
   *
   * Used primarily in the Stone webhook for idempotency — we don't know the
   * restaurantId ahead of time (providerReference is the only identifier Stone
   * sends us). The optional restaurantId parameter scopes the query to a
   * specific tenant when the caller does know it.
   *
   * NOTE: The Stone webhook handler performs HMAC signature verification before
   * calling this method, so the cross-tenant lookup is covered by that gate.
   */
  static async getByProviderReference(
    providerReference: string,
    restaurantId?: string
  ): Promise<Payment | null> {
    return prisma.payment.findFirst({
      where: {
        providerReference,
        // When restaurantId is provided, scope through the order relation
        // so a caller with a known tenant cannot access another tenant's payment.
        ...(restaurantId !== undefined && {
          order: { restaurantId },
        }),
      },
    });
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
