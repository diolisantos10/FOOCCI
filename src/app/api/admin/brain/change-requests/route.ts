/**
 * GET  /api/admin/brain/change-requests — queue + risk summary (Brain Director)
 * POST /api/admin/brain/change-requests — create a change proposal (never approved on entry)
 *
 * Persistent governance of the Foocci Brain. Approving NEVER applies a change —
 * real changes still need a test version + Quality Gate + manual activation.
 * Admin-only; nothing here touches the runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import {
  createChangeRequest,
  listChangeRequests,
  getRiskSummary,
  type CreateChangeRequestInput,
} from "@/services/brain/director/PersistentBrainDirectorService";

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
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const [latestRequests, summary] = await Promise.all([
      listChangeRequests({ status, limit: Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50 }),
      getRiskSummary(),
    ]);
    return NextResponse.json({
      ok: true,
      pendingCount: summary.pendingCount,
      highRiskCount: summary.highRiskCount,
      productionImpactCount: summary.productionImpactCount,
      decidedCount: summary.decidedCount,
      latestRequests,
      runtimeTouched: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<CreateChangeRequestInput>;
    if (!body.requestedByType || !body.target || !body.summary || !body.rationale) {
      return NextResponse.json(
        { ok: false, error: "requestedByType, target, summary e rationale são obrigatórios." },
        { status: 400 },
      );
    }
    const request = await createChangeRequest(body as CreateChangeRequestInput);
    return NextResponse.json({ ok: true, request, runtimeTouched: false });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
