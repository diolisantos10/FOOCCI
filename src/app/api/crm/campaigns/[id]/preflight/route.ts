/**
 * GET /api/crm/campaigns/[id]/preflight — pre-send diagnosis:
 * audience / eligible now / blocked breakdown (opt-out, invalid phone, weekly cap,
 * already-impacted concept, duplicate message, caps) + forecast + recommendations.
 * Tenant-scoped, read-only — never sends.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, notFound, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { buildPreflightForCampaign } from "@/services/crm/CRMPreflightDiagnosisService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    // Tenant guard before running the (heavier) diagnosis.
    const campaign = await prisma.campaign.findUnique({ where: { id: params.id }, select: { restaurantId: true } });
    if (!campaign || campaign.restaurantId !== ctx.restaurantId) return notFound("Campaign not found");

    const diagnosis = await buildPreflightForCampaign(params.id);
    if (!diagnosis) return notFound("Campaign not found");
    return ok(diagnosis);
  } catch (err) {
    console.error("[GET /api/crm/campaigns/[id]/preflight]", err);
    return serverError();
  }
}
