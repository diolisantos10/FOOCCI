import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { CRMService } from "@/services/crm/CRMService";
import { z } from "zod";

const querySchema = z.object({
  filter: z.enum(["all", "inactive", "neverOrdered", "quente", "morno", "frio", "perdido", "recent", "firstTime", "tier-bronze", "tier-prata", "tier-ouro", "tier-diamante"]).default("all"),
  search: z.string().max(100).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return badRequest("Parâmetros inválidos");

    const result = await CRMService.getCustomers(
      ctx.restaurantId, parsed.data.filter, parsed.data.search, parsed.data.page, parsed.data.pageSize,
    );
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/crm/customers]", err);
    return serverError();
  }
}
