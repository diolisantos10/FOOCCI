/**
 * POST /api/admin/crm/campaigns/restart-cold-campaign
 * Body: { restaurantId, name?, campaignFamilyKey?, sourceCampaignId?, reuseMessage?,
 *         message?, dedupeWindowDays? }
 *
 * Prepares a NEW cold-recovery campaign in a safe, conservative config — created
 * PAUSED so it NEVER sends. Returns the new campaign + its preflight diagnosis.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { restartColdCampaign } from "@/services/crm/CRMColdCampaignRestartService";
import { buildPreflightForCampaign } from "@/services/crm/CRMPreflightDiagnosisService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) {
    return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
  }

  try {
    const created = await restartColdCampaign({
      restaurantId,
      name: typeof body.name === "string" ? body.name : undefined,
      campaignFamilyKey: typeof body.campaignFamilyKey === "string" ? body.campaignFamilyKey : undefined,
      sourceCampaignId: typeof body.sourceCampaignId === "string" ? body.sourceCampaignId : undefined,
      reuseMessage: typeof body.reuseMessage === "boolean" ? body.reuseMessage : undefined,
      message: typeof body.message === "string" ? body.message : undefined,
      dedupeWindowDays: typeof body.dedupeWindowDays === "number" ? body.dedupeWindowDays : undefined,
    });
    // Run preflight immediately so the operator sees who is eligible before activating.
    const preflight = await buildPreflightForCampaign(created.campaignId).catch(() => null);
    return NextResponse.json({ ok: true, campaign: created, preflight });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao preparar a campanha.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
