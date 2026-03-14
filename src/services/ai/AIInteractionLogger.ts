/**
 * AIInteractionLogger
 *
 * Fire-and-forget logging of every AI turn to AIInteractionLog.
 * Errors here are swallowed so they never affect the customer-facing flow.
 *
 * Cost calculation uses published OpenAI pricing as of 2025.
 * Update PRICING_USD_PER_1K_TOKENS if rates change.
 */

import { prisma } from "@/lib/prisma";

interface ToolCallRecord {
  name: string;
  args: unknown;
  result: unknown;
  success: boolean;
}

export interface AILogInput {
  restaurantId: string;
  conversationId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  turnNumber: number;
  toolCalls: ToolCallRecord[];
  success: boolean;
  errorMessage?: string;
}

// Prices in USD per 1 000 tokens (input / output)
const PRICING_USD_PER_1K: Record<string, [number, number]> = {
  "gpt-4o-mini": [0.00015, 0.0006],
  "gpt-4o":      [0.0025,  0.01],
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const [inputRate, outputRate] = PRICING_USD_PER_1K[model] ?? [0.0025, 0.01];
  return (promptTokens / 1000) * inputRate + (completionTokens / 1000) * outputRate;
}

export class AIInteractionLogger {
  static async log(input: AILogInput): Promise<void> {
    try {
      const totalTokens = input.promptTokens + input.completionTokens;
      const estimatedCostUsd = estimateCost(
        input.model,
        input.promptTokens,
        input.completionTokens
      );

      await prisma.aIInteractionLog.create({
        data: {
          restaurantId: input.restaurantId,
          conversationId: input.conversationId,
          model: input.model,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          totalTokens,
          latencyMs: input.latencyMs,
          turnNumber: input.turnNumber,
          toolCalls: input.toolCalls as object[],
          estimatedCostUsd,
          success: input.success,
          errorMessage: input.errorMessage ?? null,
        },
      });
    } catch (err) {
      // Logging failures must never break the ordering flow
      console.error("[AIInteractionLogger] Failed to persist log:", err);
    }
  }
}
