/**
 * AIInteractionLogger
 *
 * Fire-and-forget logging of every AI turn to AIInteractionLog.
 * Errors here are swallowed so they never affect the customer-facing flow.
 *
 * Cost calculation lives in the PURE module ./pricing/modelPricing — sem prisma,
 * testável sozinho. Modelo fora da tabela grava estimatedCostUsd = null
 * (custo indeterminado), NUNCA o preço de outro modelo.
 */

import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "./pricing/modelPricing";

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
  /**
   * Qual agente fez a chamada. NULÁVEL de propósito: onde o chamador não sabe,
   * fica nulo e aparece como "não atribuído" — nunca somado ao agente errado.
   */
  agentSlug?: string | null;
  /**
   * `true` quando a contagem de tokens do turno está INCOMPLETA (o provedor não
   * devolveu `usage` em alguma iteração). Nesse caso o custo é gravado como null
   * — custo calculado sobre contagem incompleta seria um piso apresentado como
   * total. "Não sei" nunca vira número.
   */
  tokensUnknown?: boolean;
}

export class AIInteractionLogger {
  static async log(input: AILogInput): Promise<void> {
    try {
      const totalTokens = input.promptTokens + input.completionTokens;
      // `costUsd` é null quando o modelo não está precificado. Gravar null é a
      // resposta honesta; gravar o preço do gpt-4o era inventar um número.
      const { costUsd } = estimateCostUsd(
        input.model,
        input.promptTokens,
        input.completionTokens
      );
      // Contagem incompleta → custo indeterminado, mesmo com modelo precificado.
      const finalCostUsd = input.tokensUnknown ? null : costUsd;
      const slug = typeof input.agentSlug === "string" && input.agentSlug.trim() !== ""
        ? input.agentSlug.trim()
        : null;

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
          estimatedCostUsd: finalCostUsd,
          agentSlug: slug,
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
