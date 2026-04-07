import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, created, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { PromotionService } from "@/services/promotions/PromotionService";
import { createPromotionSchema, promotionListQuerySchema } from "@/validators/promotions";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const parsed = promotionListQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    if (!parsed.success) return badRequest("Parâmetros inválidos", parsed.error.flatten());

    const result = await PromotionService.list(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/promotions]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = createPromotionSchema.safeParse(body);
    if (!parsed.success) return badRequest("Dados inválidos", parsed.error.flatten());

    const result = await PromotionService.create(ctx.restaurantId, parsed.data);
    if (!result.ok) return badRequest(result.error);

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/promotions]", err);
    return serverError();
  }
}
