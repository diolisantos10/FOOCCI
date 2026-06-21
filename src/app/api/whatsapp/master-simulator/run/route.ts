/**
 * POST /api/whatsapp/master-simulator/run
 *
 * Tenant-authenticated endpoint that runs the WhatsApp Master Simulator and
 * returns the full MasterReport. Used by the dashboard Simulador tab.
 *
 * HARD INVARIANTS — enforced in WhatsAppMasterSimulatorService, not here:
 *   ✗ Does NOT send real WhatsApp messages.
 *   ✗ Does NOT create real orders.
 *   ✗ Does NOT generate real Pix.
 *   ✓ runtimeTouched is always false.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized } from "@/lib/api-response";
import { runMasterSimulator } from "@/services/whatsapp/master/WhatsAppMasterSimulatorService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  try {
    const report = await runMasterSimulator();
    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "erro no simulador";
    return NextResponse.json(
      { ok: false, status: "FAIL", message, runtimeTouched: false },
      { status: 200 },
    );
  }
}
