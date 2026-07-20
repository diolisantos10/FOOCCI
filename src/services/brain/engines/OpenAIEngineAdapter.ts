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
import type OpenAI from "openai";
import type { AIEngineSelection } from "./AIEngineTypes";
import type { StructuredCallInput } from "./EngineAdapter";

export { openai as openaiEngine };

export interface StructuredJsonCallInput extends StructuredCallInput {
  selection: AIEngineSelection;
}

async function callOpenAI(input: StructuredCallInput): Promise<string> {
  const wantsJson = (input.responseFormat ?? "json") === "json";
  // Visual input (e.g. nota de compra) rides along as an image part.
  const userContent: string | OpenAI.Chat.Completions.ChatCompletionContentPart[] =
    input.imageDataUrl
      ? [
          { type: "text", text: input.userContent },
          { type: "image_url", image_url: { url: input.imageDataUrl } },
        ]
      : input.userContent;
  const completion = await openai.chat.completions.create({
    model: input.selection.model,
    temperature: input.temperature ?? 0.2,
    ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
    ...(wantsJson ? { response_format: { type: "json_object" as const } } : {}),
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: userContent },
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
      if (input.imageDataUrl) {
        throw new Error("Entrada de imagem ainda não suportada no piloto CLAUDE — roteie para OPENAI.");
      }
      const { callAnthropic } = await import("./AnthropicEngineAdapter");
      return callAnthropic(input);
    }
    case "GEMINI": {
      if (input.imageDataUrl) {
        throw new Error("Entrada de imagem ainda não suportada no piloto GEMINI — roteie para OPENAI.");
      }
      const { callGemini } = await import("./GeminiEngineAdapter");
      return callGemini(input);
    }
    default:
      throw new Error(`Engine ${input.selection.provider} não implementado — use o fallback determinístico.`);
  }
}
