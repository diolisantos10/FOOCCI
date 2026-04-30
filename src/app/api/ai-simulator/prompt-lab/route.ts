/**
 * POST /api/ai-simulator/prompt-lab
 *
 * Parses a natural-language scenario description, builds ScenarioDefs,
 * and streams simulation results as SSE — identical format to /run.
 *
 * Body: { userPrompt: string; variationCount: 1 | 5 | 10 }
 *
 * Event types:
 *   { type: "parsed",          parsed: ParsedPrompt }
 *   { type: "progress",        current, total, scenarioName }
 *   { type: "scenario_result", result: ScenarioResult }
 *   { type: "report",          report: SimulationReport }
 *   { type: "error",           message }
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { unauthorized } from "@/lib/api-response";
import { parseTestPrompt } from "@/services/ai/PromptParser";
import { generateScenariosFromDims } from "@/services/ai/ScenarioGenerator";
import { AISimulatorService, type TestDepth } from "@/services/ai/AISimulatorService";
import { SimulationJobStore } from "@/services/ai/SimulationJobStore";

export const maxDuration = 300;

const ALLOWED_VARIATION_COUNTS = [1, 5, 10] as const;
type VariationCount = (typeof ALLOWED_VARIATION_COUNTS)[number];

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const { restaurantId } = ctx;
  const encoder = new TextEncoder();

  const ALLOWED_DEPTHS: TestDepth[] = ["discovery", "first_item", "food_expansion", "checkout_trigger", "full_checkout"];
  let userPrompt: string    = "";
  let variationCount: VariationCount = 1;
  let testDepth: TestDepth = "full_checkout";

  try {
    const body = await req.json() as { userPrompt?: unknown; variationCount?: unknown; testDepth?: unknown };
    if (typeof body?.userPrompt === "string") {
      userPrompt = body.userPrompt.slice(0, 500).trim();
    }
    const rawCount = Number(body?.variationCount);
    if ((ALLOWED_VARIATION_COUNTS as readonly number[]).includes(rawCount)) {
      variationCount = rawCount as VariationCount;
    }
    if (typeof body?.testDepth === "string" && ALLOWED_DEPTHS.includes(body.testDepth as TestDepth)) {
      testDepth = body.testDepth as TestDepth;
    }
  } catch {
    // use defaults
  }

  if (!userPrompt) {
    return new Response(JSON.stringify({ error: "userPrompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed    = parseTestPrompt(userPrompt);
  const scenarios = generateScenariosFromDims(
    {
      intent:       parsed.intent,
      budget:       parsed.budget,
      groupSize:    parsed.groupSize,
      behavior:     parsed.behavior,
      dietaryLabel: parsed.dietary ?? undefined,
      // patience + upsellOpenness are fixed per the parsed prompt;
      // indecisionLevel + budgetSensitivity randomise per variation.
      variation: {
        patience:       parsed.patience,
        upsellOpenness: parsed.upsellOpenness,
      },
    },
    variationCount,
  );

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected — job continues in SimulationJobStore
        }
      };

      // First event: show what the parser extracted
      send({ type: "parsed", parsed });

      SimulationJobStore.start(restaurantId, variationCount);

      try {
        const report = await AISimulatorService.runScenarios(
          restaurantId,
          scenarios,
          (progress) => {
            SimulationJobStore.updateProgress(restaurantId, progress);
            send({ type: "progress", ...progress });
          },
          (result) => {
            SimulationJobStore.addResult(restaurantId, result);
            send({ type: "scenario_result", result });
          },
          testDepth,
        );
        SimulationJobStore.complete(restaurantId, report);
        send({ type: "report", report });
      } catch (err) {
        const msg = String(err);
        SimulationJobStore.fail(restaurantId, msg);
        console.error("[POST /api/ai-simulator/prompt-lab]", err);
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
