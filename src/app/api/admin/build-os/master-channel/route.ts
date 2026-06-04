/**
 * GET  /api/admin/build-os/master-channel        — focused Master channel status.
 * POST /api/admin/build-os/master-channel/sync    — (see ./sync/route.ts)
 *
 * Admin-only (ADMIN_SECRET). Read-only live status of the Build OS WhatsApp
 * Master/Admin instance (connection, masked number, webhook, last event). No
 * tokens/secrets/full phones. No Claude/GitHub/LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getMasterChannelStatus } from "@/services/buildos/BuildOSMasterChannelService";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Admin access not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const status = await getMasterChannelStatus();
  return NextResponse.json({ ok: true, status });
}
