/**
 * GET /api/integrations/impressao — status for the Integrations Center card.
 *
 * Static override of the generic [provider] route (static segments win over the
 * dynamic one in Next.js). Tenant-scoped, read-only. The card shows "Ativo" once
 * at least one station has a printer assigned. Full config lives at
 * /api/integracoes/impressao and the Integrações → Impressão page.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stations = await prisma.printStation.findMany({
    where: { restaurantId: ctx.restaurantId },
    select: { printerName: true },
  });
  const assigned = stations.filter((s) => s.printerName && s.printerName.trim()).length;
  const status =
    assigned > 0 ? "active" : stations.length > 0 ? "configured" : "unconfigured";

  return NextResponse.json({
    data: {
      provider: "impressao",
      status,
      isActive: status === "active",
      lastTestedAt: null,
      lastError: null,
      stationsTotal: stations.length,
      stationsAssigned: assigned,
    },
  });
}
