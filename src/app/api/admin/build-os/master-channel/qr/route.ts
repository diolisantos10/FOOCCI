/**
 * GET /api/admin/build-os/master-channel/qr
 *
 * Admin-only (ADMIN_SECRET). Returns the QR / pairing code to connect the Build
 * OS Master number — by instanceName, with NO restaurant context. Reuses the
 * restaurant-agnostic EvolutionClient QR methods. Never exposes tokens/secrets.
 * Honest error when the Master instance has no Evolution config (we never point
 * the user to the restaurant integration screen). No Claude/GitHub/LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getMasterChannelQr } from "@/services/buildos/BuildOSMasterChannelService";

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

  const result = await getMasterChannelQr();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "Falha ao obter QR." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result });
}
