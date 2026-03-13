/**
 * POST /api/orders/drafts
 * Gets the existing OPEN draft for a customer or creates a new one.
 * GET  /api/orders/drafts?customerId=xxx
 * Same as above, read-only.
 */
import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { createDraftSchema } from "@/validators/order";
import { OrderDraftService } from "@/services/order/OrderDraftService";
import { ok, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const customerId = req.nextUrl.searchParams.get("customerId");
    if (!customerId) return badRequest("customerId query param is required");

    const parsed = createDraftSchema.safeParse({ customerId });
    if (!parsed.success) return badRequest("Invalid customerId");

    const result = await OrderDraftService.getOrCreate(ctx.restaurantId, parsed.data);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/orders/drafts]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = createDraftSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await OrderDraftService.getOrCreate(ctx.restaurantId, parsed.data);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return badRequest(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/orders/drafts]", err);
    return serverError();
  }
}
