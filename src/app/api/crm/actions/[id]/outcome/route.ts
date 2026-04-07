import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";
import { AdaptiveCRMService } from "@/services/crm/AdaptiveCRMService";
import { z } from "zod";

const bodySchema = z.object({
  responded: z.boolean().optional(),
  converted: z.boolean().optional(),
  revenue:   z.number().min(0).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { id } = await params;
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Dados inválidos", parsed.error.flatten());

    const result = await AdaptiveCRMService.recordOutcome(ctx.restaurantId, id, parsed.data);
    if (!result.ok) {
      if (result.status === 404) return notFound(result.error);
      return serverError(result.error);
    }

    // Refresh weights after a conversion (high-signal event)
    if (parsed.data.converted) {
      void AdaptiveCRMService.refreshWeights(ctx.restaurantId).catch(() => {});
    }

    return ok({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/crm/actions/[id]/outcome]", err);
    return serverError();
  }
}
