/**
 * POST /api/orders/[id]/reprint — re-send an order's station tickets to the Carteiro.
 *
 * Tenant-scoped (OWNER/MANAGER). Bypasses the once-only enqueue guard so an operator
 * can reprint after a paper jam / wrong setup. Creates fresh PENDING PrintJobs that
 * the agent picks up on its next poll. No printing happens here.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { PrintQueueService } from "@/services/print/PrintQueueService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") {
    return forbidden("Apenas o proprietário ou gerente pode reimprimir.");
  }
  try {
    const order = await prisma.order.findFirst({
      where:  { id: params.id, restaurantId: ctx.restaurantId },
      select: { id: true },
    });
    if (!order) return notFound("Pedido não encontrado.");

    const result = await PrintQueueService.reprintOrder(ctx.restaurantId, params.id);
    if (!result.ok) return badRequest(result.reason ?? "Não foi possível reimprimir.");
    return ok({ jobs: result.jobs });
  } catch (err) {
    console.error("[POST /api/orders/[id]/reprint]", err);
    return serverError();
  }
}
