/**
 * POST /api/crm/review-request/send
 *
 * Human-confirmed review-request send. Requires `confirm: true`. The server
 * RE-CHECKS eligibility (ReviewRequestService) + safety (ContactSafetyService)
 * + dedup before sending — the UI preview is advisory only.
 *
 * NEVER autonomous: this endpoint only runs when an operator explicitly POSTs
 * with confirm: true. Tenant-scoped.
 *
 * Body:
 *   customerId : string (required)
 *   orderId?   : string
 *   platform?  : "GOOGLE" | "IFOOD" | "AUTO"   (default AUTO)
 *   message?   : string   (operator-edited final text; must keep the review link)
 *   confirm    : true     (literal — mandatory)
 *
 * GET /api/crm/review-request/send → review-request metrics (sent/failed/skipped).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { ReviewRequestSendService } from "@/services/crm/ReviewRequestSendService";

const bodySchema = z.object({
  customerId: z.string().min(1),
  orderId: z.string().optional(),
  platform: z.enum(["GOOGLE", "IFOOD", "AUTO"]).optional(),
  message: z.string().max(2000).optional(),
  // Literal true — a missing/false confirm fails validation (no autonomous send).
  confirm: z.literal(true),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Confirmação obrigatória ou dados inválidos.", parsed.error.flatten());
    }

    const result = await ReviewRequestSendService.sendReviewRequest({
      restaurantId: ctx.restaurantId,
      customerId: parsed.data.customerId,
      orderId: parsed.data.orderId,
      platform: parsed.data.platform,
      message: parsed.data.message ?? null,
      confirm: true,
    });

    return ok(result);
  } catch (err) {
    console.error("[POST /api/crm/review-request/send]", err);
    return serverError();
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const metrics = await ReviewRequestSendService.getMetrics(ctx.restaurantId);
    return ok(metrics);
  } catch (err) {
    console.error("[GET /api/crm/review-request/send]", err);
    return serverError();
  }
}
