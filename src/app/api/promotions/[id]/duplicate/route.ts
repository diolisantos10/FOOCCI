import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { created, unauthorized, notFound, serverError } from "@/lib/api-response";
import { PromotionService } from "@/services/promotions/PromotionService";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { id } = await params;
    const result = await PromotionService.duplicate(ctx.restaurantId, id);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return serverError(result.error);
    }

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/promotions/[id]/duplicate]", err);
    return serverError();
  }
}
