import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { AdaptiveCRMService } from "@/services/crm/AdaptiveCRMService";
import { z } from "zod";
import type { CRMToneProfile } from "@prisma/client";

const bodySchema = z.object({
  tone: z.enum(["CASUAL", "PREMIUM_FEEL", "FRIENDLY", "SALES_FORWARD"]),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Tom inválido");

    const result = await AdaptiveCRMService.setToneProfile(
      ctx.restaurantId,
      parsed.data.tone as CRMToneProfile
    );
    if (!result.ok) return serverError(result.error);

    // Recompute weights immediately after tone change
    const weights = await AdaptiveCRMService.refreshWeights(ctx.restaurantId);

    return ok({ tone: parsed.data.tone, weights });
  } catch (err) {
    console.error("[PATCH /api/crm/brain/tone]", err);
    return serverError();
  }
}
