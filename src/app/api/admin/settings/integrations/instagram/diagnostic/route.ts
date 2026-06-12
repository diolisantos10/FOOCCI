/**
 * POST /api/admin/settings/integrations/instagram/diagnostic
 *
 * Admin-facing "Testar integração": runs the hermetic Instagram channel
 * diagnostic and returns a friendly result for the UI — without exposing
 * CRON_SECRET to the front-end and without sending any real Direct. Never
 * sends/creates/AI; token never appears in the response.
 *
 * Body (JSON, optional): { restaurantSlug?, restaurantId? } — when given, runs
 * the synthetic inbound round-trip (with cleanup) too.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { runInstagramChannelDiagnostic } from "@/services/instagram/InstagramChannelDiagnostic";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { restaurantSlug?: string; restaurantId?: string };

  let restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : undefined;
  if (!restaurantId && typeof body.restaurantSlug === "string") {
    const r = await prisma.restaurant.findFirst({ where: { slug: body.restaurantSlug }, select: { id: true } }).catch(() => null);
    restaurantId = r?.id;
  }

  const result = await runInstagramChannelDiagnostic(restaurantId);
  return NextResponse.json({
    ok: result.ok,
    status: result.status,
    passed: result.passed,
    total: result.total,
    friendly: {
      webhook: result.checks.some(c => c.name.includes("assinatura") && c.pass) ? "OK" : "Verificar",
      parser: result.checks.some(c => c.name.includes("parser") && c.pass) ? "OK" : "Verificar",
      centralChannel: "OK",
      realSend: "não executado",
      runtimeTouched: false,
    },
    noRealInstagramSend: result.noRealInstagramSend,
    runtimeTouched: result.runtimeTouched,
  });
}
