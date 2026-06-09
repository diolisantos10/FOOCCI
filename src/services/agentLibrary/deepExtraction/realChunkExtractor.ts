/**
 * realChunkExtractor — production per-chunk technique extractor (OpenAI).
 *
 * One LLM call per chunk, asking for deep, APPLICABLE techniques (not generic
 * phrases), with short synthesized evidence only — never long copyrighted
 * excerpts. Throws a controlled error when OPENAI_API_KEY is missing so the
 * orchestrator can retry / mark the chunk FAILED without crashing.
 */

import { openai } from "@/lib/openai";
import { parseExtractedTechniques } from "../agentLibraryHelpers";
import type { ChunkExtractor } from "./DeepExtractionService";

const SYSTEM = [
  "Você é um curador de formação técnica para o agente garçom-vendedor (Foocci).",
  "A partir do TRECHO fornecido (parte de um material maior), EXTRAIA técnicas OPERACIONAIS",
  "APLICÁVEIS ao Waiter: venda consultiva, atendimento, recomendação, escolha guiada, redução",
  "de fricção, fechamento, upsell ético, pedido em grupo, condução de indeciso, respeito a",
  "restrições e experiência em restaurante.",
  "NÃO faça resumo. NÃO retorne frases genéricas (ex.: 'faça perguntas', 'seja gentil').",
  "Se o trecho contiver um PRINCÍPIO aplicável, TRANSFORME-O em uma técnica CONCRETA.",
  "Para CADA técnica, SEMPRE preencha 'application' (como o Waiter usa no Foocci, em 1-2 frases)",
  "E 'usageRule' (uma regra prática objetiva). Inclua 'qualityTest' sempre que possível.",
  "NUNCA reproduza trechos longos da obra — produza apenas SÍNTESES operacionais próprias.",
  'Responda em JSON: { "techniques": [ { "techniqueName", "category", "purpose", "principle",',
  '"application", "usageRule", "qualityTest", "goodExample", "badExample", "confidence" } ] }.',
  "confidence é 0..1. Extraia de 1 a 6 técnicas por trecho denso; só retorne lista vazia se o",
  "trecho realmente não tiver nenhuma técnica aplicável.",
].join(" ");

export const realChunkExtractor: ChunkExtractor = async (input) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada — extração profunda indisponível.");
  }
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          `Agente: ${input.agentSlug}\nFonte: ${input.sourceTitle}\n` +
          `Categoria: ${input.category ?? "(sem categoria)"}\n` +
          `Parte ${input.chunkIndex + 1} de ${input.totalChunks}\n\nTRECHO:\n${input.text}`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  return parseExtractedTechniques(raw);
};
