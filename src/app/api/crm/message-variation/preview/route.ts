import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { MessageVariationService } from "@/services/crm/MessageVariationService";

const bodySchema = z.object({
  customerId:        z.string().optional(),
  actionType:        z.string().optional(),
  campaignObjective: z.string().optional(),
  couponCode:        z.string().max(40).optional().nullable(),
  tone:              z.string().max(40).optional().nullable(),
  maxVariants:       z.number().int().min(1).max(5).optional(),
});

/**
 * POST /api/crm/message-variation/preview
 *
 * Generates SAFE personalized WhatsApp message DRAFTS for CRM. DRAFT-ONLY:
 * never sends a message, never creates a campaign or CampaignExecution.
 * Every response carries `requiresApproval: true`. Tenant-scoped.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Dados inválidos", parsed.error.flatten());

    if (!parsed.data.actionType && !parsed.data.campaignObjective) {
      return badRequest("Informe actionType ou campaignObjective.");
    }

    const result = await MessageVariationService.generatePreview({
      restaurantId:      ctx.restaurantId,
      customerId:        parsed.data.customerId,
      actionType:        parsed.data.actionType,
      campaignObjective: parsed.data.campaignObjective,
      couponCode:        parsed.data.couponCode ?? null,
      tone:              parsed.data.tone ?? null,
      maxVariants:       parsed.data.maxVariants,
    });

    return ok(result);
  } catch (err) {
    console.error("[POST /api/crm/message-variation/preview]", err);
    return serverError();
  }
}
