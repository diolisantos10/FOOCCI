import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { updateAddressSchema } from "@/validators/address";
import { AddressService } from "@/services/customer/AddressService";
import { ok, noContent, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";

type Params = { params: { id: string; addressId: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = updateAddressSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const result = await AddressService.update(
      ctx.restaurantId,
      params.id,
      params.addressId,
      parsed.data
    );
    if (!result.ok) return notFound(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[PATCH /api/customers/[id]/addresses/[addressId]]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const result = await AddressService.remove(
      ctx.restaurantId,
      params.id,
      params.addressId
    );
    if (!result.ok) return notFound(result.error);

    return noContent();
  } catch (err) {
    console.error("[DELETE /api/customers/[id]/addresses/[addressId]]", err);
    return serverError();
  }
}
