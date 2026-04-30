/**
 * POST /api/ai-simulator/web-run
 *
 * Runs the V2 event-driven customer simulator against the caller's restaurant.
 * Streams live progress as Server-Sent Events while the client is connected.
 *
 * Body (optional):
 *   { mode?: "QUICK" | "STANDARD" | "STRESS" | "CUSTOM", customCount?: number }
 *
 * SSE event types:
 *   { type: "progress", current, total, archetype }
 *   { type: "scenario_result", result: WebScenarioResult }
 *   { type: "report", report: WebSimReport }
 *   { type: "error", message }
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized } from "@/lib/api-response";
import { runWebSimulation, type WebSimMode } from "@/services/ai/AIWebSimulatorService";

export const maxDuration = 300;

const ALLOWED_MODES: WebSimMode[] = ["QUICK", "STANDARD", "STRESS", "CUSTOM"];

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const { restaurantId } = ctx;
  const encoder = new TextEncoder();

  let mode: WebSimMode = "STANDARD";
  let customCount: number | undefined;

  try {
    const body = await req.json() as { mode?: unknown; customCount?: unknown };
    if (typeof body?.mode === "string" && ALLOWED_MODES.includes(body.mode as WebSimMode)) {
      mode = body.mode as WebSimMode;
    }
    if (mode === "CUSTOM") {
      const raw = Math.floor(Number(body?.customCount));
      if (Number.isFinite(raw) && raw >= 1 && raw <= 50) customCount = raw;
      else customCount = 5;
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
          // client disconnected — continue to completion
        }
      };

      try {
        const report = await runWebSimulation(restaurantId, mode, {
          customCount,
          onScenarioDone: (result, current, total) => {
            send({ type: "progress",         current, total, archetype: result.profile.archetype });
            send({ type: "scenario_result",  result });
          },
        });
        send({ type: "report", report });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro interno no simulador V2.";
        send({ type: "error", message: msg });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
