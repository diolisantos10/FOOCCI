import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { createCustomerSchema, customerListQuerySchema } from "@/validators/customer";
import { CustomerService } from "@/services/customer/CustomerService";
import { ok, created, badRequest, unauthorized, conflict, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { searchParams } = req.nextUrl;
    const parsed = customerListQuerySchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );
    if (!parsed.success) return badRequest("Invalid query", parsed.error.flatten());

    const result = await CustomerService.list(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/customers]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = createCustomerSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await CustomerService.create(ctx.restaurantId, parsed.data);
    if (!result.ok) {
      if (result.status === 409) return conflict(result.error);
      return badRequest(result.error);
    }

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/customers]", err);
    return serverError();
  }
}
