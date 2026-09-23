/**
 * OpenAIEngineAdapter — o piloto OPENAI. SÓ o piloto OPENAI.
 *
 * O DISPATCHER saiu daqui em 24/09/2026 e mora em `EngineDispatcher.ts`, com
 * nome neutro. Motivo: a porta de entrada da IA não pode se chamar pelo nome de
 * um laboratório. Enquanto se chamou, cada consumidor escrevia
 * `import { callStructuredJson } from ".../OpenAIEngineAdapter"` — e quem lia o
 * código concluía, errado, que a escolha do AIEngineRouter não valia nada.
 *
 * O reexport abaixo existe só para os consumidores antigos não quebrarem de uma
 * vez. Código NOVO importa de `EngineDispatcher`.
 */

import { openai } from "@/lib/openai";
import type OpenAI from "openai";
import type { StructuredCallInput } from "./EngineAdapter";
import { FalhaDeMotor } from "./FalhaDeMotor";

export { openai as openaiEngine };

export async function callOpenAI(input: StructuredCallInput): Promise<string> {
  // Sem chave o SDK vai com "not-configured" e o provedor devolve 401 depois de
  // uma ida à rede. Barrar aqui troca um 401 genérico por um motivo nomeado —
  // e é o motivo que o diário do SDR precisa registrar.
  const chave = process.env.OPENAI_API_KEY;
  if (!chave || !chave.trim() || chave.trim() === "not-configured") {
    throw new FalhaDeMotor("sem_chave", "OPENAI_API_KEY ausente");
  }
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
  /* ── Por que `finish_reason` importa mais do que parece ────────────────────
   * Quando o modelo bate no teto de tokens ele devolve `finish_reason: "length"`
   * COM texto — um JSON pela metade. Sem olhar aqui, esse pedaço desce até o
   * `JSON.parse`, quebra, e o consumidor registra "a IA não entendeu" quando o
   * que houve foi um teto curto demais. Diagnóstico errado leva a conserto
   * errado: alguém iria mexer no prompt em vez de subir `maxTokens`. */
  const escolha = completion.choices[0];
  const raw = escolha?.message?.content;
  if (escolha?.finish_reason === "length") {
    throw new FalhaDeMotor(
      "cortado_por_limite",
      `resposta truncada em ${input.maxTokens ?? "padrão"} tokens`,
    );
  }
  if (!raw) throw new FalhaDeMotor("sem_conteudo", `finish_reason=${escolha?.finish_reason ?? "ausente"}`);
  return raw;
}

// ── Compatibilidade: a porta antiga ───────────────────────────────────────────
// `callStructuredJson` e seu tipo agora vivem em EngineDispatcher (porta neutra).
// Reexportados aqui para não quebrar os consumidores que ainda apontam para cá.
export { callStructuredJson } from "./EngineDispatcher";
export type { StructuredJsonCallInput } from "./EngineDispatcher";
