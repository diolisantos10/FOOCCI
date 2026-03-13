import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { updateCustomerSchema } from "@/validators/customer";
import { CustomerService } from "@/services/customer/CustomerService";
import {
  ok, noContent, badRequest, unauthorized, forbidden,
  notFound, conflict, serverError,
} from "@/lib/api-response";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await CustomerService.getById(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/customers/[id]]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = updateCustomerSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await CustomerService.update(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      if (result.status === 409) return conflict(result.error);
      return badRequest(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/customers/[id]]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

    const result = await CustomerService.deactivate(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return noContent();
  } catch (err) {
    console.error("[DELETE /api/customers/[id]]", err);
    return serverError();
  }
}
