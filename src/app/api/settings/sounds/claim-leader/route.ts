/**
 * POST   /api/settings/sounds/claim-leader — heartbeat: claim/renew this
 *        device's cross-device alarm lease for the current restaurant.
 * DELETE /api/settings/sounds/claim-leader — graceful release on clean tab close.
 *
 * See AlarmLeaderService for the full rationale. Any logged-in staff member of
 * the restaurant may claim (not owner/manager-only — every device that opens
 * Foocci should be eligible to be the one that rings).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { claimAlarmLeader, releaseAlarmLeader } from "@/services/settings/AlarmLeaderService";

const bodySchema = z.object({ deviceId: z.string().min(8).max(100) });

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return badRequest("deviceId inválido");
    const result = await claimAlarmLeader(ctx.restaurantId, parsed.data.deviceId);
    return ok(result);
  } catch (err) {
    console.error("[POST /api/settings/sounds/claim-leader]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return badRequest("deviceId inválido");
    await releaseAlarmLeader(ctx.restaurantId, parsed.data.deviceId);
    return ok({ released: true });
  } catch (err) {
    console.error("[DELETE /api/settings/sounds/claim-leader]", err);
    return serverError();
  }
}
