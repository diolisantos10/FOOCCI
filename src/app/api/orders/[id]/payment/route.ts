import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { attachPaymentSchema, updatePaymentStatusSchema } from "@/validators/order";
import { PaymentService } from "@/services/payment/PaymentService";
import {
  ok, created, badRequest, unauthorized, notFound, conflict, serverError,
} from "@/lib/api-response";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await PaymentService.getByOrderId(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/orders/[id]/payment]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = attachPaymentSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await PaymentService.attach(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      if (result.status === 409) return conflict(result.error);
      return badRequest(result.error);
    }

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/orders/[id]/payment]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = updatePaymentStatusSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await PaymentService.updateStatus(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return badRequest(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/orders/[id]/payment]", err);
    return serverError();
  }
}
