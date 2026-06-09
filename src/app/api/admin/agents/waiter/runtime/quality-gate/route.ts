/**
 * POST /api/admin/agents/waiter/runtime/quality-gate
 * Runs the Waiter Quality gate (read-only auditor, SafeMode) and reports whether
 * activation would be allowed (P0 === 0). Does NOT activate anything.
 *
 * Auth: admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../_guard";
import { runWaiterQualityGate } from "@/services/waiterRuntime/qualityGate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  try {
    const gate = await runWaiterQualityGate();
    return NextResponse.json({ ok: true, gate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao rodar o Quality gate.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
