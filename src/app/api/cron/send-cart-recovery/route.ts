/**
 * POST /api/cron/send-cart-recovery
 *
 * Phase 3 of abandoned cart recovery: sends a WhatsApp recovery message to
 * identified customers with stale OPEN OrderDrafts who have not yet been
 * contacted.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 *
 * Body (all optional):
 *   dryRun?            boolean — if true, eligible count is computed but no
 *                               messages are sent and no DB mutations occur
 *   inactivityMinutes? number  — override inactivity threshold (default: 2)
 *   limit?             number  — max drafts to process per run (default: 50)
 *
 * Response:
 *   { ok, dryRun, checked, eligible, sent, skippedNoPhone,
 *     skippedAlreadySent, skippedDailyLimit, skippedOrderedAfter,
 *     skippedPendingPayment, failed, inactivityMinutes, durationMs }
 *
 * Idempotent: a draft with recoveryAttempts > 0 is never re-processed.
 * A customer who already received a recovery today is skipped.
 *
 * Recommended schedule: every 1 minute.
 */

import { NextRequest, NextResponse } from "next/server";
import { OrderDraftRecoverySendService } from "@/services/order/OrderDraftRecoverySendService";

const LOG = "[cron/send-cart-recovery]";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(`${LOG} CRON_SECRET env var is not configured — recovery will not run`);
    return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const authCheck = checkCronAuth(req);
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      dryRun?:            boolean;
      inactivityMinutes?: number;
      limit?:             number;
    };

    const dryRun            = body.dryRun === true;
    const inactivityMinutes =
      typeof body.inactivityMinutes === "number" && body.inactivityMinutes > 0
        ? Math.min(body.inactivityMinutes, 60) // cap at 60 min — beyond that use the mark-abandoned job
        : 2; // default: 2 minutes for food-delivery context
    const limit =
      typeof body.limit === "number" && body.limit > 0
        ? Math.min(body.limit, 200)
        : 50;

    console.info(`${LOG} starting`, { dryRun, inactivityMinutes, limit });

    const result = await OrderDraftRecoverySendService.sendCartRecoveryMessages({
      inactivityMinutes,
      limit,
      dryRun,
    });

    console.info(`${LOG} done`, result);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(`${LOG} unhandled error`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
