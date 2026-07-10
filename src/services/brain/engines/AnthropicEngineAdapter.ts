/**
 * AnthropicEngineAdapter — o piloto CLAUDE do Brain.
 *
 * Só ativa quando ANTHROPIC_API_KEY existe (o router já não seleciona CLAUDE
 * sem a chave). Cliente lazy/singleton; JSON garantido por instrução no system
 * prompt + prefill "{" (a API da Anthropic não tem response_format json).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { StructuredCallInput } from "./EngineAdapter";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function callAnthropic(input: StructuredCallInput): Promise<string> {
  const wantsJson = (input.responseFormat ?? "json") === "json";
  const system = wantsJson
    ? `${input.systemPrompt}\n\nIMPORTANTE: responda SOMENTE com um objeto JSON válido, sem markdown, sem texto fora do JSON.`
    : input.systemPrompt;

  const response = await getClient().messages.create({
    model: input.selection.model,
    max_tokens: input.maxTokens ?? 1024,
    temperature: input.temperature ?? 0.2,
    system,
    messages: wantsJson
      ? [
          { role: "user", content: input.userContent },
          { role: "assistant", content: "{" }, // prefill: força a resposta a começar como JSON
        ]
      : [{ role: "user", content: input.userContent }],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "";
  if (!text) throw new Error("Engine CLAUDE sem conteúdo");
  return wantsJson ? `{${text}` : text;
}
