/**
 * POST /api/integrations/saipos/test-secret
 *
 * Tests a temporary Saipos secret without saving it.
 * Uses the stored idPartner, codStore and environment from the saved config,
 * but replaces the secret with the provided tempSecret for this test only.
 *
 * Body: { tempSecret: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { SaiposIntegrationService } from "@/services/integrations/SaiposIntegrationService";
import { z } from "zod";

const bodySchema = z.object({
  tempSecret: z.string().min(1, "tempSecret obrigatório"),
});

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
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

  const result = await SaiposIntegrationService.testWithTempSecret(
    ctx.restaurantId,
    parsed.data.tempSecret,
  );

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
