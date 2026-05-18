import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { CRMService } from "@/services/crm/CRMService";
import { z } from "zod";

const querySchema = z.object({
  filter: z.enum(["all", "inactive", "neverOrdered", "morno", "frio", "vip", "recent", "firstTime"]).default("all"),
  search: z.string().max(100).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return badRequest("Parâmetros inválidos");

    const result = await CRMService.getCustomers(ctx.restaurantId, parsed.data.filter, parsed.data.search);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/crm/customers]", err);
    return serverError();
  }
}
