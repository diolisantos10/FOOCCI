/**
 * GET  /api/orders/[id]/fiscal  — current fiscal doc for the order (refreshes a
 *                                 pending one from the gateway first).
 * POST /api/orders/[id]/fiscal  — manually emit / reprocess the NFC-e now.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { FiscalEmissionService } from "@/services/fiscal/FiscalEmissionService";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    await FiscalEmissionService.refreshStatus(ctx.restaurantId, params.id);
    const doc = await FiscalEmissionService.getForOrder(ctx.restaurantId, params.id);
    return ok(doc);
  } catch (err) {
    console.error("[GET /api/orders/[id]/fiscal]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
    await FiscalEmissionService.maybeEmitForOrder(ctx.restaurantId, params.id);
    const doc = await FiscalEmissionService.getForOrder(ctx.restaurantId, params.id);
    return ok(doc);
  } catch (err) {
    console.error("[POST /api/orders/[id]/fiscal]", err);
    return serverError();
  }
}
