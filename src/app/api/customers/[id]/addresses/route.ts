import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { createAddressSchema } from "@/validators/address";
import { AddressService } from "@/services/customer/AddressService";
import { ok, created, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await AddressService.list(ctx.restaurantId, params.id);
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/customers/[id]/addresses]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = createAddressSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await AddressService.create(ctx.restaurantId, params.id, parsed.data);
    if (!result.ok) return notFound(result.error);

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/customers/[id]/addresses]", err);
    return serverError();
  }
}
