/**
 * OpenAIEngineAdapter — the OPENAI engine behind the router.
 *
 * Thin re-export of the project's existing OpenAI singleton so every Brain
 * consumer goes through ONE engine entry point. No new client, no behavior
 * change: the Waiter keeps using exactly what it uses today.
 */

import { openai } from "@/lib/openai";
import type { AIEngineSelection } from "./AIEngineTypes";

export { openai as openaiEngine };

export interface StructuredJsonCallInput {
  selection: AIEngineSelection;
  systemPrompt: string;
  userContent: string;
  temperature?: number;
}

/**
 * One structured-JSON chat call through the routed engine. v1 only implements
 * OPENAI (today's production engine); any other provider must be introduced via
 * a governed BrainChangeRequest before this adapter learns it.
 */
export async function callStructuredJson(input: StructuredJsonCallInput): Promise<string> {
  if (input.selection.provider !== "OPENAI") {
    throw new Error(`Engine ${input.selection.provider} ainda não implementado — use OPENAI ou o fallback determinístico.`);
  }
  const completion = await openai.chat.completions.create({
    model: input.selection.model,
    temperature: input.temperature ?? 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userContent },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Engine sem conteúdo");
  return raw;
}
