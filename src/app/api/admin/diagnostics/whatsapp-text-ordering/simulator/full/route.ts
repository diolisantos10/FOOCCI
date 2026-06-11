/**
 * POST /api/admin/diagnostics/whatsapp-text-ordering/simulator/full
 *
 * Admin-facing one-click full simulation: runs the hermetic Text Order simulator
 * (synthetic catalog/payment/address) and returns PASS/WARNING/FAIL + per-scenario
 * transcript + comanda + WOULD_* actions + safety flags. Never sends a WhatsApp,
 * never creates a real order or Pix. Admin-only (ADMIN_SECRET / cookie).
 *
 * Body (JSON, optional): { mode?: "DRY_RUN" | "REPLY_ONLY" | "FULL_TEST" }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { runTextOrderSimulator, type SimMode } from "@/services/whatsapp/ordering/WhatsAppTextOrderSimulatorService";

const VALID: SimMode[] = ["DRY_RUN", "REPLY_ONLY", "FULL_TEST"];

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  const mode = (VALID as string[]).includes(body.mode ?? "") ? (body.mode as SimMode) : "REPLY_ONLY";
  const result = await runTextOrderSimulator(mode);
  return NextResponse.json(result, { status: 200 });
}
