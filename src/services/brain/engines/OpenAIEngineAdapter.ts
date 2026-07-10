/**
 * OpenAIEngineAdapter — o piloto OPENAI + o DISPATCHER de pilotos do Brain.
 *
 * callStructuredJson é o ÚNICO ponto por onde qualquer consumidor do Brain fala
 * com uma IA: ele roteia pela seleção (OPENAI / CLAUDE / GEMINI) para o adapter
 * do provider. Trocar o piloto de um agente é config governada no router —
 * nenhum consumidor muda. (Mantido neste arquivo pelo import histórico; o
 * OpenAI segue sendo o piloto default de produção.)
 */

import { openai } from "@/lib/openai";
import type { AIEngineSelection } from "./AIEngineTypes";
import type { StructuredCallInput } from "./EngineAdapter";

export { openai as openaiEngine };

export interface StructuredJsonCallInput extends StructuredCallInput {
  selection: AIEngineSelection;
}

async function callOpenAI(input: StructuredCallInput): Promise<string> {
  const wantsJson = (input.responseFormat ?? "json") === "json";
  const completion = await openai.chat.completions.create({
    model: input.selection.model,
    temperature: input.temperature ?? 0.2,
    ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
    ...(wantsJson ? { response_format: { type: "json_object" as const } } : {}),
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userContent },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Engine sem conteúdo");
  return raw;
}

/**
 * Uma chamada estruturada através do piloto roteado. Lança em erro — quem chama
 * decide o fallback (o BrainReasoner cai no determinístico que nunca inventa).
 */
export async function callStructuredJson(input: StructuredJsonCallInput): Promise<string> {
  switch (input.selection.provider) {
    case "OPENAI":
      return callOpenAI(input);
    case "CLAUDE": {
      const { callAnthropic } = await import("./AnthropicEngineAdapter");
      return callAnthropic(input);
    }
    case "GEMINI": {
      const { callGemini } = await import("./GeminiEngineAdapter");
      return callGemini(input);
    }
    default:
      throw new Error(`Engine ${input.selection.provider} não implementado — use o fallback determinístico.`);
  }
}
