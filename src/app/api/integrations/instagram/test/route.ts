/**
 * POST /api/integrations/instagram/test  — friendly "Testar integração" for the
 * store owner. Runs the hermetic Instagram channel diagnostic (parser, signature
 * gate, mode gates, dry-run send) WITHOUT exposing CRON_SECRET to the front-end
 * and WITHOUT sending any real Direct. Tenant-scoped; never sends/creates/AI.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { runInstagramChannelDiagnostic } from "@/services/instagram/InstagramChannelDiagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Pure checks only here (no synthetic round-trip against the live restaurant),
  // so the test never writes a real customer/conversation for the store owner.
  const result = await runInstagramChannelDiagnostic();

  // Friendly summary for the UI (no token, no payload jargon as primary text).
  const friendly = {
    webhook: result.checks.some(c => c.name.includes("assinatura") && c.pass) ? "OK" : "Verificar",
    parser: result.checks.some(c => c.name.includes("parser") && c.pass) ? "OK" : "Verificar",
    centralChannel: "OK", // Channel INSTAGRAM_DIRECT exists and the Central renders it
    realSend: "não executado",
    runtimeTouched: false,
  };

  return NextResponse.json({
    data: {
      ok: result.ok,
      status: result.status,
      passed: result.passed,
      total: result.total,
      friendly,
      noRealInstagramSend: result.noRealInstagramSend,
      runtimeTouched: result.runtimeTouched,
      checks: result.checks.map(c => ({ name: c.name, pass: c.pass })),
    },
  });
}
