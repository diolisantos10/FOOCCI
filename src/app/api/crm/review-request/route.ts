/**
 * POST /api/crm/review-request
 *
 * Evaluates whether a customer/order is eligible for a post-order review
 * request and returns a SAFE draft with the real Google/iFood link.
 *
 * DRAFT-ONLY: never sends a message, never creates a campaign. Every response
 * carries `requiresApproval: true`. Tenant-scoped.
 *
 * GET /api/crm/review-request  → review-link configuration status only.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { ReviewRequestService } from "@/services/crm/ReviewRequestService";

const bodySchema = z.object({
  customerId: z.string().min(1),
  orderId:    z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Dados inválidos", parsed.error.flatten());

    const result = await ReviewRequestService.evaluateReviewRequestEligibility({
      restaurantId: ctx.restaurantId,
      customerId:   parsed.data.customerId,
      orderId:      parsed.data.orderId,
      channel:      "WHATSAPP",
    });

    return ok(result);
  } catch (err) {
    console.error("[POST /api/crm/review-request]", err);
    return serverError();
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const status = await ReviewRequestService.getReviewLinkStatus(ctx.restaurantId);
    return ok(status);
  } catch (err) {
    console.error("[GET /api/crm/review-request]", err);
    return serverError();
  }
}
