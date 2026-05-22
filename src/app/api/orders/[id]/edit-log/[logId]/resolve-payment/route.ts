/**
 * POST /api/orders/[id]/edit-log/[logId]/resolve-payment
 *
 * Marks a payment difference from an order edit as manually resolved.
 * Staff uses this after collecting/refunding the diff outside the system.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string; logId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const log = await prisma.orderEditLog.findUnique({
      where: { id: params.logId },
      select: { id: true, orderId: true, restaurantId: true },
    });

    if (!log || log.orderId !== params.id || log.restaurantId !== ctx.restaurantId) {
      return notFound("Registro não encontrado");
    }

    await prisma.orderEditLog.update({
      where: { id: params.logId },
      data:  { paymentResolved: true },
    });

    return ok({ resolved: true });
  } catch (err) {
    console.error("[POST /api/orders/[id]/edit-log/[logId]/resolve-payment]", err);
    return serverError();
  }
}
