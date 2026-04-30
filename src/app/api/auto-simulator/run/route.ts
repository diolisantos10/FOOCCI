/**
 * POST /api/auto-simulator/run
 *
 * Enqueues one auto-simulator run for the authenticated restaurant.
 * Returns 202 immediately — execution runs in the background on the server,
 * independent of the client connection.
 *
 * Poll GET /api/auto-simulator/status to detect completion.
 *
 * Body (optional): { scenarioCount?: number }
 *
 * Response:
 *   202 { success: true,  data: { queued: true } }
 *   200 { success: false, data: { queued: false, reason: "already_running" } }
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized } from "@/lib/api-response";
import { AutoSimulatorService } from "@/services/ai/AutoSimulatorService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => ({})) as { scenarioCount?: number };
  const scenarioCount = typeof body.scenarioCount === "number"
    ? Math.min(Math.max(body.scenarioCount, 1), 20)
    : 10;

  const queued = AutoSimulatorService.enqueue(ctx.restaurantId, scenarioCount, "manual");

  if (!queued) {
    return NextResponse.json(
      { success: false, data: { queued: false, reason: "already_running" } },
      { status: 200 },
    );
  }

  return NextResponse.json(
    { success: true, data: { queued: true } },
    { status: 202 },
  );
}
