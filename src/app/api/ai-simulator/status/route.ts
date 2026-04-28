/**
 * GET /api/ai-simulator/status
 *
 * Returns the current state of the most recent simulation run for this restaurant.
 * Allows clients to reconnect after disconnecting without re-triggering a full run.
 *
 * Response shapes:
 *   404  — no job has been started for this restaurant
 *   200  — { status, progress, results, report, error, jobId, startedAt }
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized } from "@/lib/api-response";
import { SimulationJobStore } from "@/services/ai/SimulationJobStore";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const job = SimulationJobStore.get(ctx.restaurantId);
  if (!job) {
    return NextResponse.json({ error: "No simulation job found for this restaurant." }, { status: 404 });
  }

  return NextResponse.json({
    jobId:      job.jobId,
    status:     job.status,
    startedAt:  job.startedAt,
    progress:   job.progress,
    results:    job.results,
    report:     job.report,
    error:      job.error,
  });
}
