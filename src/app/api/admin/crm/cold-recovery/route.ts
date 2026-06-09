/**
 * GET /api/admin/crm/cold-recovery?restaurantId=...
 * Diagnoses the old "cold customer recovery" campaigns: candidates, real
 * failures vs safety blocks, current identity, recommended familyKey, already
 * impacted, eligible now. Admin-only, read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { diagnoseColdRecovery } from "@/services/crm/CRMColdCampaignRecoveryDiagnosticService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = new URL(req.url).searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
  }

  try {
    const diagnosis = await diagnoseColdRecovery(restaurantId);
    return NextResponse.json({ ok: true, diagnosis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao diagnosticar.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
