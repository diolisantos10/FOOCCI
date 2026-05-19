/**
 * GET /api/crm/audience?template={templateId}
 *
 * Returns audience preview for a campaign template.
 * Uses CrmAudienceService which returns both:
 *   - totalSegmentCount (raw segment, no WhatsApp eligibility filter)
 *   - eligibleCount     (WhatsApp-eligible only)
 *
 * For backward compatibility, `count` = `eligibleCount` and
 * `customers` = `previewCustomers`.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { CrmAudienceService } from "@/services/crm/CrmAudienceService";

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const template = req.nextUrl.searchParams.get("template");
    if (!template) return badRequest("Parâmetro 'template' é obrigatório");

    const result = await CrmAudienceService.getAudiencePreview(ctx.restaurantId, template);
    return ok(result);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Template '")) {
      return badRequest(err.message);
    }
    console.error("[GET /api/crm/audience]", err);
    return serverError();
  }
}
