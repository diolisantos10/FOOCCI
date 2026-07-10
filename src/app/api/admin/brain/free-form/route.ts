/**
 * GET  /api/admin/brain/free-form?restaurantId=… — status da escada + gates
 * POST /api/admin/brain/free-form — transições governadas do raciocínio livre:
 *   { action: "promote-allowlist", restaurantId, phones[], confirm }
 *   { action: "promote-wide", restaurantId, confirm, acknowledgeRealCustomers }
 *   { action: "rollback", restaurantId, confirm }
 *
 * Tudo config-only (runtimeTouched: false). A escada não pula degrau; os gates
 * (golden set p0=0 + completude da verdade) rodam a cada promoção.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getFreeFormConfig } from "@/services/brain/runtime/BrainFreeFormConfigService";
import { getShadowStats, listRecentShadowSamples } from "@/services/brain/runtime/BrainShadowEvidenceService";
import {
  promoteFreeFormToAllowlist,
  promoteFreeFormToWide,
  rollbackFreeForm,
  runFreeFormGates,
} from "@/services/brain/runtime/freeFormGovernance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const restaurantId = req.nextUrl.searchParams.get("restaurantId");
    if (!restaurantId) return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
    const [config, gates, shadowStats, recentSamples] = await Promise.all([
      getFreeFormConfig(restaurantId),
      runFreeFormGates(restaurantId),
      getShadowStats(restaurantId),
      listRecentShadowSamples(restaurantId),
    ]);
    return NextResponse.json({ ok: true, config, gates, shadowStats, recentSamples, runtimeTouched: false });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      restaurantId?: string;
      phones?: string[];
      confirm?: string;
      acknowledgeRealCustomers?: boolean;
    };
    if (!body.restaurantId || !body.action) {
      return NextResponse.json({ ok: false, error: "action e restaurantId são obrigatórios." }, { status: 400 });
    }

    if (body.action === "promote-allowlist") {
      const result = await promoteFreeFormToAllowlist({
        restaurantId: body.restaurantId,
        phones: Array.isArray(body.phones) ? body.phones : [],
        confirm: body.confirm ?? "",
      });
      return NextResponse.json({ ok: result.success, result });
    }
    if (body.action === "promote-wide") {
      const result = await promoteFreeFormToWide({
        restaurantId: body.restaurantId,
        confirm: body.confirm ?? "",
        acknowledgeRealCustomers: body.acknowledgeRealCustomers,
      });
      return NextResponse.json({ ok: result.success, result });
    }
    if (body.action === "rollback") {
      const result = await rollbackFreeForm({ restaurantId: body.restaurantId, confirm: body.confirm ?? "" });
      return NextResponse.json({ ok: result.success, result });
    }
    return NextResponse.json({ ok: false, error: `action desconhecida: ${body.action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
