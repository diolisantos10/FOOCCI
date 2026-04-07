import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { created, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { AdaptiveCRMService } from "@/services/crm/AdaptiveCRMService";
import { z } from "zod";

const bodySchema = z.object({
  customerId:   z.string().optional(),
  actionType:   z.enum(["REACTIVATION", "BIRTHDAY", "VIP_INACTIVE", "NEW_CUSTOMER", "POST_ORDER"]),
  messageStyle: z.enum(["FRIENDLY", "PLAYFUL", "DIRECT", "EMOTIONAL", "PREMIUM"]),
  messageText:  z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Dados inválidos", parsed.error.flatten());

    const result = await AdaptiveCRMService.logAction(ctx.restaurantId, parsed.data);
    if (!result.ok) return serverError(result.error);

    // After every 10th action, refresh cached weights in the background
    // (fire-and-forget — does not block the response)
    void (async () => {
      try {
        const count = await (await import("@/lib/prisma")).prisma.cRMActionLog.count({
          where: { restaurantId: ctx.restaurantId },
        });
        if (count % 10 === 0) {
          await AdaptiveCRMService.refreshWeights(ctx.restaurantId);
        }
      } catch { /* non-critical */ }
    })();

    return created(result.data);
  } catch (err) {
    console.error("[POST /api/crm/actions]", err);
    return serverError();
  }
}
