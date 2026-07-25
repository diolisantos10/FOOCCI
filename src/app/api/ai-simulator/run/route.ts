/**
 * POST /api/ai-simulator/run
 *
 * Starts a simulation run as a detached background task.
 * Accepts optional { scenarioCount: number } body — must be 5, 10, or 20 (default 10).
 * Streams live progress as Server-Sent Events while the client is connected.
 * The job continues running even if the client disconnects — results are stored
 * in SimulationJobStore and accessible via GET /api/ai-simulator/status.
 *
 * Event types while connected:
 *   { type: "progress",        current, total, scenarioName }
 *   { type: "scenario_result", result: ScenarioResult }
 *   { type: "report",          report: SimulationReport }
 *   { type: "error",           message }
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized } from "@/lib/api-response";
import { AISimulatorService, type TestDepth } from "@/services/ai/AISimulatorService";
import { SimulationJobStore } from "@/services/ai/SimulationJobStore";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const { restaurantId } = ctx;
  const encoder = new TextEncoder();

  // Parse and clamp scenarioCount + testDepth (defaults: 10, full_checkout)
  const ALLOWED_COUNTS = [5, 10, 20] as const;
  const ALLOWED_DEPTHS: TestDepth[] = ["discovery", "first_item", "food_expansion", "checkout_trigger", "full_checkout"];
  let scenarioCount: 5 | 10 | 20 = 10;
  let testDepth: TestDepth = "full_checkout";
  try {
    const body = await req.json() as { scenarioCount?: unknown; testDepth?: unknown };
    const raw  = Math.floor(Number(body?.scenarioCount));
    if (ALLOWED_COUNTS.includes(raw as 5 | 10 | 20)) {
      scenarioCount = raw as 5 | 10 | 20;
    } else if (Number.isFinite(raw) && raw > 0) {
      // Clamp to nearest allowed value
      scenarioCount = raw <= 7 ? 5 : raw <= 15 ? 10 : 20;
    }
    if (typeof body?.testDepth === "string" && ALLOWED_DEPTHS.includes(body.testDepth as TestDepth)) {
      testDepth = body.testDepth as TestDepth;
    }
  } catch {
    // missing or non-JSON body — use defaults
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected — job continues via SimulationJobStore
        }
      };

      // Initialise store entry with the chosen scenario count
      SimulationJobStore.start(restaurantId, scenarioCount);

      try {
        const report = await AISimulatorService.run(
          restaurantId,
          scenarioCount,
          (progress) => {
            SimulationJobStore.updateProgress(restaurantId, progress);
            send({ type: "progress", ...progress });
          },
          (result) => {
            SimulationJobStore.addResult(restaurantId, result);
            send({ type: "scenario_result", result });
          },
          undefined,
          testDepth,
        );
        SimulationJobStore.complete(restaurantId, report);
        send({ type: "report", report });
      } catch (err) {
        // Mostra a mensagem amigável do pré-voo (sem o prefixo "Error:"); só cai
        // no String(err) técnico quando é uma falha inesperada de verdade.
        const msg = err instanceof Error ? err.message : String(err);
        SimulationJobStore.fail(restaurantId, msg);
        console.error("[POST /api/ai-simulator/run]", err);
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
