/**
 * POST /api/ai-simulator/run
 *
 * Streams simulation progress + results as Server-Sent Events.
 * Each event is a JSON object on a `data:` line.
 *
 * Event types:
 *   { type: "progress", current, total, scenarioName }
 *   { type: "scenario_result", result: ScenarioResult }
 *   { type: "report", report: SimulationReport }
 *   { type: "error", message }
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized } from "@/lib/api-response";
import { AISimulatorService } from "@/services/ai/AISimulatorService";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const { restaurantId } = ctx;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      try {
        const report = await AISimulatorService.run(
          restaurantId,
          (progress) => send({ type: "progress", ...progress }),
          (result)   => send({ type: "scenario_result", result }),
        );
        send({ type: "report", report });
      } catch (err) {
        console.error("[POST /api/ai-simulator/run]", err);
        send({ type: "error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache, no-transform",
      "Connection":      "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
