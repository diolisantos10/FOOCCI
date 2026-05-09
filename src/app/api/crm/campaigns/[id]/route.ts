/**
 * GET /api/crm/campaigns/[id]  — campaign detail with recipients
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, notFound, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const campaign = await prisma.campaign.findUnique({
      where:  { id: params.id },
      select: {
        id:            true,
        restaurantId:  true,
        name:          true,
        objective:     true,
        channel:       true,
        targetSegment: true,
        templateId:    true,
        status:        true,
        totalAudience: true,
        totalSent:     true,
        totalFailed:   true,
        totalResponded: true,
        createdAt:     true,
        sentAt:        true,
        executions: {
          orderBy: { createdAt: "asc" },
          select: {
            id:            true,
            customerId:    true,
            customerName:  true,
            customerPhone: true,
            messageText:   true,
            status:        true,
            sentAt:        true,
            failedReason:  true,
          },
        },
      },
    });

    if (!campaign || campaign.restaurantId !== ctx.restaurantId) {
      return notFound("Campaign not found");
    }

    return ok(campaign);
  } catch (err) {
    console.error("[GET /api/crm/campaigns/[id]]", err);
    return serverError();
  }
}
