/**
 * PATCH /api/admin/agents/waiter/training-suggestions/[id] — human review of a
 * training proposal: APPROVED | REJECTED | BACKLOG.
 *
 * Approving ONLY records the decision (the proposal joins the approved-learning
 * pool). It NEVER changes the real runtime or the live prompt. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../../runtime/_guard";
import { reviewSuggestion, type SuggestionStatus } from "@/services/waiterTraining/WaiterTrainingSuggestionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: SuggestionStatus[] = ["APPROVED", "REJECTED", "BACKLOG", "PENDING_REVIEW"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const body = (await req.json().catch(() => ({}))) as { status?: string; reviewedBy?: string };
    if (!body.status || !STATUSES.includes(body.status as SuggestionStatus)) {
      return NextResponse.json({ ok: false, error: "status inválido." }, { status: 400 });
    }
    const suggestion = await reviewSuggestion(params.id, body.status as SuggestionStatus, body.reviewedBy ?? null);
    // Hard guarantee for the operator: approving never touches the live runtime.
    return NextResponse.json({ ok: true, suggestion, runtimeTouched: false });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
