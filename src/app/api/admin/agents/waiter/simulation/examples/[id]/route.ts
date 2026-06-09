/**
 * PATCH /api/admin/agents/waiter/simulation/examples/[id]
 * Body: { status: "APPROVED" | "REJECTED" | "BACKLOGGED" | "PENDING_REVIEW", reviewedBy? }
 *
 * Human approval step. Only APPROVED makes an example usable by the generator.
 * Auth: admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { reviewExample, type ExampleReviewStatus } from "@/services/simulation/examples/SimulationExampleStore";

const VALID: ExampleReviewStatus[] = ["APPROVED", "REJECTED", "BACKLOGGED", "PENDING_REVIEW"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const status = body.status as ExampleReviewStatus;
  if (!VALID.includes(status)) {
    return NextResponse.json({ ok: false, error: `status inválido. Use: ${VALID.join(", ")}.` }, { status: 400 });
  }

  try {
    const example = await reviewExample(params.id, status, typeof body.reviewedBy === "string" ? body.reviewedBy : null);
    return NextResponse.json({ ok: true, example });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao revisar o exemplo.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
