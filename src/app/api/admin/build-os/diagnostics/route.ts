/**
 * GET  /api/admin/build-os/diagnostics — structured Build OS WhatsApp-path report.
 * POST /api/admin/build-os/diagnostics — run an internal simulated command intake.
 *
 * Internal only (ADMIN_SECRET), same guard as other admin routes. Read-only by
 * default; POST supports dryRun (no write) or a real simulated BuildCommand.
 * NO Claude/GitHub/LLM, NO execution. Never returns secrets.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { runBuildOsDiagnostics } from "@/services/buildos/BuildOSDiagnosticsService";
import { runSimulatedIntake } from "@/services/buildos/BuildOSBootstrapService";

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

  const phone = req.nextUrl.searchParams.get("phone") ?? undefined;
  const message = req.nextUrl.searchParams.get("message") ?? undefined;
  const report = await runBuildOsDiagnostics({ phone, message });
  return NextResponse.json({ report });
}

const simulateSchema = z.object({
  phone: z.string().min(6).max(40).optional(),
  message: z.string().min(1).max(2000).optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const raw = await req.json().catch(() => ({}));
  const parsed = simulateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const phone = parsed.data.phone ?? "+5511940595223";
  const message = parsed.data.message ?? "/build Faz um RAIO-X do checkout Pix. Não implemente nada ainda.";
  const dryRun = parsed.data.dryRun ?? false;

  // dryRun → diagnostics-only preview (no DB write). Real → simulated intake.
  if (dryRun) {
    const report = await runBuildOsDiagnostics({ phone, message });
    return NextResponse.json({ ok: true, dryRun: true, report });
  }

  const result = await runSimulatedIntake({ phone, message, noSend: true });
  return NextResponse.json({ ok: result.ok, dryRun: false, result });
}
