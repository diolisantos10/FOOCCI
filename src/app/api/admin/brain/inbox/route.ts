/**
 * GET /api/admin/brain/inbox — Unified Approval Inbox (READ-ONLY aggregation)
 *
 * Aggregates every pending approval queue (BrainChangeRequest, WhatsApp
 * learnings, waiter training suggestions, improvement proposals, simulation
 * lab, knowledge base) into one normalized, deduplicated list. v1 never moves
 * the writes — approving/rejecting still happens in each source's own endpoint.
 * Admin-only; nothing here touches the runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getUnifiedInbox } from "@/services/brain/training/UnifiedApprovalInbox";

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
    const limitPerSource = Number(req.nextUrl.searchParams.get("limitPerSource") ?? 20) || 20;
    const inbox = await getUnifiedInbox(limitPerSource);
    return NextResponse.json({ ok: true, ...inbox, runtimeTouched: false });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
