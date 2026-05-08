/**
 * GET /api/crm/import/jobs — list recent ImportJob records for the current restaurant.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await prisma.importJob.findMany({
    where:   { restaurantId: ctx.restaurantId },
    orderBy: { createdAt: "desc" },
    take:    20,
    select: {
      id:                true,
      type:              true,
      filename:          true,
      status:            true,
      totalRows:         true,
      validRows:         true,
      errorRows:         true,
      warningRows:       true,
      createdCustomers:  true,
      updatedCustomers:  true,
      createdOrders:     true,
      createdItems:      true,
      skippedDuplicates: true,
      unmatchedProducts: true,
      createdAt:         true,
      completedAt:       true,
    },
  });

  return NextResponse.json({ data: jobs });
}
