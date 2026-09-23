/**
 * AnthropicEngineAdapter — o piloto CLAUDE do Brain.
 *
 * Só ativa quando ANTHROPIC_API_KEY existe (o router já não seleciona CLAUDE
 * sem a chave). Cliente lazy/singleton.
 *
 * ⚠️ DUAS GERAÇÕES DE API, E ELAS NÃO SÃO COMPATÍVEIS (medido em 24/09/2026)
 * -------------------------------------------------------------------------
 * O adapter nasceu para `claude-haiku-4-5` e usava dois recursos que a geração
 * 5 REJEITA COM ERRO 400:
 *
 *   • `temperature`      → removido na família 5 (e em Opus/Sonnet 4.6+).
 *   • prefill "{"        → prefill de assistente removido na família 5.
 *
 * Ou seja: apontar o roteador para um modelo classe A SEM tocar aqui daria 400
 * em toda chamada, o agente cairia no fallback determinístico e ninguém veria
 * nada além de "a IA não entendeu". Motor trocado no papel e desligado na
 * prática é pior que motor velho: mata a dúvida e deixa o defeito.
 *
 * Por isso a chamada é montada POR GERAÇÃO, e o JSON da geração 5 é garantido
 * por instrução no system + limpeza de cerca markdown na saída (não por prefill).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { StructuredCallInput } from "./EngineAdapter";
import { FalhaDeMotor } from "./FalhaDeMotor";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** Só para teste: derruba o cliente memorizado. */
export function __resetAnthropicClient(): void {
  client = null;
}

/**
 * Família Claude 5 e posteriores (opus-5, opus-5-5, fable-5/5.1, sonnet-5, ...).
 * ⛔ Falha FECHADA no desconhecido: modelo que não reconhecemos é tratado como
 * geração 5 (sem `temperature`, sem prefill), porque esse é o formato para onde
 * a API andou. Supor o formato velho num modelo novo dá 400 silencioso.
 */
export function isGeracao5(model: string): boolean {
  return !/-4-\d|-3-\d|^claude-(instant|2)/.test(model);
}

const JSON_INSTRUCTION =
  "\n\nIMPORTANTE: responda SOMENTE com um objeto JSON válido, sem markdown, sem cerca de código, sem texto fora do JSON.";

/** Remove ```json ... ``` quando o modelo insiste na cerca, e apara o que sobra. */
function limparCerca(texto: string): string {
  const t = texto.trim();
  const cerca = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return (cerca?.[1] ?? t).trim();
}

export async function callAnthropic(input: StructuredCallInput): Promise<string> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave || !chave.trim() || chave.trim() === "not-configured") {
    throw new FalhaDeMotor("sem_chave", "ANTHROPIC_API_KEY ausente");
  }

  const model = input.selection.model;
  const wantsJson = (input.responseFormat ?? "json") === "json";
  const system = wantsJson ? `${input.systemPrompt}${JSON_INSTRUCTION}` : input.systemPrompt;
  const maxTokens = input.maxTokens ?? 1024;

  const base = { model, max_tokens: maxTokens, system };

  // `output_config` é campo da geração 5; o tipo do SDK instalado pode ainda não
  // conhecê-lo, então entra por um objeto solto — nunca por `any` espalhado.
  const extras: Record<string, unknown> = isGeracao5(model)
    ? (input.effort ? { output_config: { effort: input.effort } } : {})
    : { temperature: input.temperature ?? 0.2 };

  const messages: Anthropic.MessageParam[] =
    isGeracao5(model) || !wantsJson
      ? [{ role: "user", content: input.userContent }]
      : [
          { role: "user", content: input.userContent },
          { role: "assistant", content: "{" }, // prefill: só a geração 4 aceita
        ];

  const response: Anthropic.Message = await getClient().messages.create({
    ...base,
    ...extras,
    messages,
  } as Anthropic.MessageCreateParamsNonStreaming);

  /* O turno pode terminar sem conteúdo útil por três motivos DIFERENTES, e
   * confundi-los leva a conserto errado — é o mesmo cuidado que o piloto OpenAI
   * já toma com `finish_reason`. */
  if (response.stop_reason === "refusal") {
    throw new FalhaDeMotor("recusado", `modelo recusou a resposta (${model})`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new FalhaDeMotor("cortado_por_limite", `resposta truncada em ${maxTokens} tokens`);
  }

  const bloco = response.content.find((b) => b.type === "text");
  const texto = bloco && bloco.type === "text" ? bloco.text : "";
  if (!texto.trim()) {
    throw new FalhaDeMotor("sem_conteudo", `stop_reason=${response.stop_reason ?? "ausente"}`);
  }

  if (!wantsJson) return texto;
  // Geração 4 responde a partir do prefill "{"; a 5 responde o objeto inteiro.
  return isGeracao5(model) ? limparCerca(texto) : `{${texto}`;
}
