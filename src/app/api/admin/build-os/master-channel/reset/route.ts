/**
 * POST /api/admin/build-os/master-channel/reset
 *
 * Admin-only (ADMIN_SECRET). Hard-resets the Build OS Admin instance
 * (logout → delete → create) and returns a FRESH QR. For a stuck/inconsistent
 * instance whose QR keeps failing ("Can't link new devices"). Admin snapshot
 * only — never a restaurant instance. No tokens/secrets exposed. No
 * Claude/GitHub/LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { resetMasterChannel } from "@/services/buildos/BuildOSMasterChannelService";

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

  const result = await resetMasterChannel();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "Falha ao resetar a instância." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result });
}
