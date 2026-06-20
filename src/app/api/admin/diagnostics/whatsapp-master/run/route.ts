/**
 * POST /api/admin/diagnostics/whatsapp-master/run
 *
 * Admin-only endpoint that runs the WhatsApp Master Simulator and returns the
 * full MasterReport. Zero side effects: no Evolution, no real order, no real Pix.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { runMasterSimulator } from "@/services/whatsapp/master/WhatsAppMasterSimulatorService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runMasterSimulator();
    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "erro desconhecido";
    return NextResponse.json(
      { ok: false, status: "FAIL", message, runtimeTouched: false },
      { status: 200 },
    );
  }
}
