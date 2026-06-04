/**
 * POST /api/admin/build-os/master-channel/sync
 *
 * Admin-only (ADMIN_SECRET). Re-applies the canonical webhook config to the
 * Build OS Master instance ONLY (never restaurant instances, never the WhatsApp
 * session). The URL is always the canonical one; the token is appended
 * server-side and never returned. No Claude/GitHub/LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { syncMasterWebhook } from "@/services/buildos/BuildOSMasterChannelService";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Admin access not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const result = await syncMasterWebhook();
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Falha ao sincronizar." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result });
}
