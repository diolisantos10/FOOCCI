/**
 * GET /api/admin/build-os/diagnostics/instance-health
 *
 * Admin-only (ADMIN_SECRET). Read-only Evolution instance / webhook-delivery
 * health probe for the Build OS → Diagnóstico screen. Surfaces, for every
 * configured instance: live connection state, the connected number (masked),
 * the live webhook URL + events vs the expected URL, and the last event Foocci
 * received. No mutations, no tokens/secrets, no full phone numbers.
 *
 * NO Claude/GitHub/LLM, NO execution.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { runInstanceHealthCheck } from "@/services/buildos/BuildOSInstanceHealthService";

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

  const report = await runInstanceHealthCheck();
  return NextResponse.json({ ok: true, report });
}
