/**
 * PATCH /api/admin/brain/change-requests/[id] — HUMAN decision on a Brain change:
 * approve | reject | backlog (+ optional decisionReason).
 *
 * Approving ONLY records the decision (status=APPROVED) — it never applies the
 * change. Real changes still require a test version + Quality Gate + manual
 * activation. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { reviewChangeRequest, type ReviewAction } from "@/services/brain/director/PersistentBrainDirectorService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: Record<string, ReviewAction> = { approve: "APPROVED", reject: "REJECTED", backlog: "BACKLOG" };

/** Identidade real: nomes genéricos/não-humanos não valem como revisor. */
const GENERIC_REVIEWERS = /^(admin|agent|system|bot|ai)$/i;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; reviewedBy?: string; decisionReason?: string };
    const action = body.action ? ACTIONS[body.action.toLowerCase()] : undefined;
    if (!action) {
      return NextResponse.json({ ok: false, error: "action deve ser approve, reject ou backlog." }, { status: 400 });
    }
    const reviewedBy = body.reviewedBy?.trim() ?? "";
    if (!reviewedBy || GENERIC_REVIEWERS.test(reviewedBy)) {
      return NextResponse.json(
        { ok: false, error: "Informe seu nome real em reviewedBy — identificadores genéricos (admin/agent/system/bot/ai) não são aceitos." },
        { status: 400 },
      );
    }
    const request = await reviewChangeRequest({
      id: params.id,
      action,
      reviewedBy,
      decisionReason: body.decisionReason ?? null,
    });
    return NextResponse.json({ ok: true, request, runtimeTouched: false });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
