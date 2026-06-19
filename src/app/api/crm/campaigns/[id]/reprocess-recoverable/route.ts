/**
 * POST /api/crm/campaigns/[id]/reprocess-recoverable
 *
 * LIVE, owner-confirmed reprocess of a campaign's recoverable failures.
 *
 * Safety contract:
 *  - tenant/auth scoped; requires OWNER or MANAGER.
 *  - requires an explicit { "confirm": true } payload — sends NOTHING otherwise.
 *  - recomputes the recoverable plan server-side at request time (never trusts the
 *    client preview), dedupes, and sends only the next safe batch (cap 5, Evolution Web).
 *  - checks the live Evolution instance state immediately before sending and blocks
 *    if it is not "open".
 *  - revalidates opt-out / contactable / phone / already-sent per recipient.
 *  - creates NEW execution rows (never mutates old failed rows); successful sends
 *    appear in Central de Conversas; failures get proper classification.
 *
 * All heavy lifting lives in ScheduledCampaignRunnerService.reprocessRecoverableBatch,
 * which reuses the same battle-tested send path as the cron.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { ScheduledCampaignRunnerService } from "@/services/crm/ScheduledCampaignRunnerService";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

  try {
    const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };

    const result = await ScheduledCampaignRunnerService.reprocessRecoverableBatch(params.id, {
      restaurantId: ctx.restaurantId,
      confirm:      body?.confirm,
    });

    if (result.ok) return ok(result);

    // Blocked by a safety gate — return the rich result so the UI can explain why.
    return NextResponse.json(
      { success: false, error: result.message ?? "Reprocessamento bloqueado", data: result },
      { status: result.httpStatus },
    );
  } catch (err) {
    console.error("[POST /api/crm/campaigns/[id]/reprocess-recoverable]", err);
    return serverError();
  }
}
