/**
 * POST /api/integrations/saipos/retry
 *
 * Manually retry sending a specific order to Saipos.
 * Idempotent — skips if order was already successfully sent (saiposSentAt set).
 *
 * Body: { orderId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { SaiposIntegrationService } from "@/services/integrations/SaiposIntegrationService";
import { z } from "zod";

const bodySchema = z.object({
  orderId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (ctx.role !== "OWNER") {
    return NextResponse.json(
      { error: "Apenas o proprietário pode reenviar pedidos para a Saipos." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const result = await SaiposIntegrationService.retryOrder(
    ctx.restaurantId,
    parsed.data.orderId,
  );

  return NextResponse.json(result, { status: result.sent ? 200 : 400 });
}
