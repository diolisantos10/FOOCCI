/**
 * GET /api/auto-simulator/status
 *
 * Returns the full real-time status of the auto-simulator for the
 * authenticated restaurant. Designed to be polled every 5 s by the UI.
 *
 * Response:
 *   {
 *     status:    "IDLE" | "RUNNING" | "SCHEDULED" | "PAUSED" | "ERROR"
 *     isRunning: boolean
 *     lastRunAt: string | null
 *     nextRunAt: string | null          // null when scheduler disabled
 *     progress:  { current, total, pct, scenarioName } | null
 *     lastError: string | null
 *   }
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { AutoSimulatorService } from "@/services/ai/AutoSimulatorService";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const { restaurantId } = ctx;
    const config    = await AutoSimulatorService.getConfig(restaurantId);
    const isRunning = AutoSimulatorService.isRunning(restaurantId);
    const status    = AutoSimulatorService.deriveStatus(restaurantId, config);
    const rawProg   = AutoSimulatorService.getProgress(restaurantId);
    const lastError = AutoSimulatorService.getLastError(restaurantId);

    const lastRunAt = config.lastRunAt ? config.lastRunAt.toISOString() : null;
    const nextRunAt = config.enabled && config.lastRunAt
      ? new Date(config.lastRunAt.getTime() + config.intervalMinutes * 60_000).toISOString()
      : null;

    const progress = rawProg
      ? {
          current:      rawProg.current,
          total:        rawProg.total,
          pct:          rawProg.total > 0 ? Math.round((rawProg.current / rawProg.total) * 100) : 0,
          scenarioName: rawProg.scenarioName,
        }
      : null;

    return ok({ status, isRunning, lastRunAt, nextRunAt, progress, lastError });
  } catch (err) {
    return serverError("Erro ao buscar status do simulador", err);
  }
}
