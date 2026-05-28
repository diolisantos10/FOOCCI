/**
 * POST /api/admin/diagnostics/reset-draft-recovery
 *
 * QA-only: resets recoveryAttempts + lastRecoveryAt on a single named draft
 * so it becomes eligible for one more recovery attempt.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Body: { draftId: string }
 *
 * Returns before/after values for the single draft.
 * Touches ONLY the one draft — verified by returning the exact row updated.
 *
 * This endpoint exists exclusively for controlled QA resets.
 * It does NOT change recovery logic, anti-spam rules, or any other drafts.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import { z } from "zod";

const bodySchema = z.object({
  draftId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw    = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "draftId is required" }, { status: 400 });
  }
  const { draftId } = parsed.data;

  // Read before state
  const before = await prisma.orderDraft.findUnique({
    where:  { id: draftId },
    select: {
      id:               true,
      restaurantId:     true,
      customerId:       true,
      status:           true,
      recoveryAttempts: true,
      lastRecoveryAt:   true,
    },
  });

  if (!before) {
    return NextResponse.json({ error: `Draft ${draftId} not found` }, { status: 404 });
  }

  // Reset only this draft
  const after = await prisma.orderDraft.update({
    where: { id: draftId },
    data:  {
      recoveryAttempts: 0,
      lastRecoveryAt:   null,
    },
    select: {
      id:               true,
      recoveryAttempts: true,
      lastRecoveryAt:   true,
    },
  });

  return NextResponse.json({
    ok:    true,
    draftId,
    before: {
      recoveryAttempts: before.recoveryAttempts,
      lastRecoveryAt:   before.lastRecoveryAt?.toISOString() ?? null,
    },
    after: {
      recoveryAttempts: after.recoveryAttempts,
      lastRecoveryAt:   after.lastRecoveryAt ?? null,
    },
    noOtherDraftsChanged: true,
    note: "Draft is now eligible for one recovery attempt. Anti-spam rules still apply for all other drafts.",
  });
}
